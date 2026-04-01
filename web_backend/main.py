# web_backend/main.py

from typing import List, Optional
import random
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from weekly_planner.models import PlanResult, PlannerConfig
from weekly_planner.planner import WeeklyPlanner
from weekly_planner.mip_planner import MIPWeeklyPlanner
from weekly_planner.subject_planner import (
    SubjectMIPPlanner,
    SubjectRandomPlanner,
    normalize_subject_input,
    validate_subject_data,
)
from weekly_planner.subject_greedy_planner import SubjectGreedyPlanner
from weekly_planner.pdf_export import render_classes_pdf, render_professors_pdf
from weekly_planner.excel_export import render_classes_excel, render_professors_excel
from weekly_planner.validation import validate_config


BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "web_frontend"
TEMPLATES_DIR = FRONTEND_DIR / "templates"
STATIC_DIR = FRONTEND_DIR / "static"
EXAMPLES_DIR = BASE_DIR / "examples"

app = FastAPI()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Serve file statici (CSS/JS) da /static
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class PlannerRequest(BaseModel):
    """
    Modello di input per la generazione del piano via API.
    """
    days: int
    daily_hours: int
    class_names: List[str]
    professor_names: List[str]
    hours_matrix: List[List[int]]            # H[p][c]
    availability: Optional[List] = None

    # Nuovi dati per planner a materie
    subject_names: Optional[List[str]] = None
    subject_class_hours: Optional[List[dict]] = None
    subject_assignments: Optional[List[dict]] = None
    subject_daily_max: Optional[List[List[int]]] = None
    preferences: Optional[List[List[bool]]] = None
    generate_both_weeks: bool = False
    aggregate_hours_rule: bool = True
    single_teacher_rule: bool = True

    wednesday_afternoon_free: bool = False
    last_morning_hour: int = 3

    # "mip" oppure "random"
    method: str = "mip"
    hour_names: Optional[List[str]] = None
    seed: Optional[int] = None
    # Piano già generato da riutilizzare per i PDF (shape: days x daily_hours x num_classes)
    plan: Optional[List[List[List[int]]]] = None
    plan_week_b: Optional[List[List[List[int]]]] = None
    # Flag per indicare i docenti di classe (niente limite 2h/dì con la classe)
    class_teachers: Optional[List[bool]] = None


def build_config_from_request(req: PlannerRequest) -> PlannerConfig:
    """
    Converte l'input JSON della richiesta in un PlannerConfig.
    """
    H = np.array(req.hours_matrix, dtype=int)

    if H.shape != (len(req.professor_names), len(req.class_names)):
        raise ValueError(
            f"Shape di hours_matrix errata: atteso ({len(req.professor_names)}, "
            f"{len(req.class_names)}), trovato {H.shape}"
        )

    availability_array = None
    if req.availability is not None:
        A = np.array(req.availability, dtype=bool)
        expected_2d = (len(req.professor_names), req.days)
        expected_3d = (len(req.professor_names), req.days, 2)
        if A.ndim == 2:
            if A.shape != expected_2d:
                # Se 2D ma non per professore, prova ad aggregare da prof-materia
                agg = _aggregate_availability_by_prof(
                    req, np.repeat(A[:, :, None], 2, axis=2)
                )
                if agg is None:
                    raise ValueError(
                        f"Shape di availability errata: atteso {expected_2d}, trovato {A.shape}"
                    )
                A = agg
            else:
                A = np.repeat(A[:, :, None], 2, axis=2)
        elif A.ndim == 3:
            if A.shape != expected_3d:
                agg = _aggregate_availability_by_prof(req, A)
                if agg is None:
                    raise ValueError(
                        f"Shape di availability errata: atteso {expected_3d}, trovato {A.shape}"
                    )
                A = agg
        else:
            raise ValueError("Struttura availability non valida.")
        availability_array = A

    class_teachers = None
    if req.class_teachers is not None:
        if len(req.class_teachers) != len(req.professor_names):
            raise ValueError(
                "La lunghezza di class_teachers deve coincidere con i professori."
            )
        class_teachers = [bool(v) for v in req.class_teachers]

    return PlannerConfig(
        days=req.days,
        daily_hours=req.daily_hours,
        num_professors=len(req.professor_names),
        num_classes=len(req.class_names),
        hours_matrix=H,
        availability=availability_array,
        last_morning_hour=req.last_morning_hour,
        wednesday_afternoon_free=req.wednesday_afternoon_free,
        class_names=req.class_names,
        professor_names=req.professor_names,
        hour_names=req.hour_names,
        seed=req.seed,
        class_teachers=class_teachers,
    )


def generate_with_method(config: PlannerConfig, method: str, subject_ctx=None):
    """
    Helper: lancia il planner giusto in base a 'method'.
    Ritorna sempre un PlanResult.
    """
    method = (method or "mip").lower()
    if subject_ctx is not None:
        if method == "greedy":
            # Greedy veloce
            planner = SubjectGreedyPlanner(config, subject_ctx, seed=config.seed)
            return planner.generate(time_limit_sec=5.0)
        
        # Default per "mip": usa il vero MIPPlanner
        planner = SubjectMIPPlanner(config, subject_ctx)
        result = planner.solve(time_limit_sec=60)
        if not result.plans:
            # Se MIP fallisce, ritenta con greedy come fallback
            fallback = SubjectGreedyPlanner(config, subject_ctx, seed=config.seed)
            return fallback.generate(time_limit_sec=5.0)
        return result
    if method == "greedy":
        planner = WeeklyPlanner(config)
        if hasattr(config, "seed") and config.seed is not None:
            np.random.seed(config.seed)
            random.seed(config.seed)
        # Continua finché lo score è adeguato o si esauriscono 5 secondi
        return planner.generate_until_time(
            target_score=0.1,
            time_limit_sec=5.0,
            show_progress=False,
        )
    planner = MIPWeeklyPlanner(config)
    result = planner.solve(time_limit_sec=60)
    if not result.plans:
        fallback = WeeklyPlanner(config)
        return fallback.generate_until_time(
            target_score=0.1,
            time_limit_sec=10.0,
            show_progress=False,
        )
    return result


def get_or_generate_result(req: PlannerRequest, config: PlannerConfig, subject_ctx=None) -> PlanResult:
    """
    Se la richiesta include già un piano (req.plan), lo usa direttamente
    evitando di rigenerare. Altrimenti lancia il planner.
    """
    if req.plan is None:
        return generate_with_method(config, req.method, subject_ctx)

    plans = []
    scores = []
    labels = []
    expected_shape = (config.days, config.daily_hours, config.num_classes)

    P = np.array(req.plan, dtype=int)
    if P.shape != expected_shape:
        raise ValueError(
            f"Shape di plan errata: atteso {expected_shape}, trovato {P.shape}"
        )
    plans.append(P)
    scores.append(0.0)
    labels.append("Settimana A")

    if req.plan_week_b is not None:
        Pb = np.array(req.plan_week_b, dtype=int)
        if Pb.shape != expected_shape:
            raise ValueError(
                f"Shape di plan_week_b errata: atteso {expected_shape}, trovato {Pb.shape}"
            )
        plans.append(Pb)
        scores.append(0.0)
        labels.append("Settimana B")

    if subject_ctx and subject_ctx.week_labels:
        labels = subject_ctx.week_labels

    return PlanResult(plans=plans, scores=scores, week_labels=labels or None)


def persist_example_plan(payload: dict):
    """
    Salva su disco l'ultimo piano generato (per debug/esempi).
    Non interrompe il flusso se il salvataggio fallisce.
    """
    try:
        EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)
        out = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "method": payload.get("method", "mip"),
            "week_labels": payload.get("week_labels"),
            "days": payload.get("days"),
            "daily_hours": payload.get("daily_hours"),
            "class_names": payload.get("class_names"),
            "professor_names": payload.get("professor_names"),
            "hour_names": payload.get("hour_names"),
            "plan": payload.get("plan"),
            "plan_week_b": payload.get("plan_week_b"),
            "total_required": payload.get("total_required"),
            "non_zero_total": payload.get("non_zero_total"),
            "non_zero_week_b": payload.get("non_zero_week_b"),
        }
        with open(EXAMPLES_DIR / "generated_plan.json", "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        if payload.get("request"):
            with open(EXAMPLES_DIR / "last_request_response.json", "w", encoding="utf-8") as f:
                json.dump(payload["request"], f, indent=2)
    except Exception:
        # Non bloccare la risposta in caso di errore di I/O
        pass


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """
    Pagina principale con il form HTML + JS.
    """
    return templates.TemplateResponse("index.html", {"request": request})


def _aggregate_availability_by_prof(req: PlannerRequest, A: np.ndarray) -> Optional[np.ndarray]:
    """
    Converte una availability fornita per coppia prof-materia (righe = assegnazioni)
    in availability per professore (righe = num_prof).
    Ordina le righe seguendo l'iterazione delle assegnazioni nel frontend:
    per ogni prof, per ogni subject assegnato.
    Restituisce None se non aggregabile.
    """
    num_prof = len(req.professor_names)
    days = req.days
    # Calcola il mapping riga -> prof a partire dalle assegnazioni
    mapping: list[int] = []
    assignments = getattr(req, "subject_assignments", None) or []
    for p, assign in enumerate(assignments):
        subjects = []
        if isinstance(assign, dict):
            subjects = assign.get("subjects") or []
        else:
            subjects = getattr(assign, "subjects", []) or []
        if not isinstance(subjects, list):
            continue
        for _ in subjects:
            mapping.append(p)

    if not mapping or len(mapping) != A.shape[0]:
        return None

    agg = np.zeros((num_prof, days, 2), dtype=bool)
    for row_idx, p in enumerate(mapping):
        if p < 0 or p >= num_prof:
            continue
        # OR tra tutte le righe che appartengono allo stesso prof
        agg[p] |= A[row_idx]
    return agg


@app.post("/api/generate-plan")
async def generate_plan(req: PlannerRequest):
    """
    Genera un piano con il metodo scelto (random o MIP).
    """
    config = build_config_from_request(req)
    validation_errors = validate_config(config)
    if validation_errors:
        return {
            "ok": False,
            "message": "Parametri non validi.",
            "errors": validation_errors,
        }
    subject_ctx = normalize_subject_input(req, config)
    if subject_ctx:
        subject_errors = validate_subject_data(subject_ctx, config)
        if subject_errors:
            return {
                "ok": False,
                "message": "Parametri materie non validi.",
                "errors": subject_errors,
            }
    else:
        # Nessun contesto materie: lascia lavorare il planner legacy (anche se H è vuota produrrà un piano vuoto).
        pass
    result = generate_with_method(config, req.method, subject_ctx)

    if not result.plans:
        return {
            "ok": False,
            "message": "Nessun piano valido trovato con questi parametri.",
        }

    total_required = 0
    if subject_ctx:
        try:
            total_required = sum(subject_ctx.total_required)
        except Exception:
            total_required = 0
    else:
        try:
            total_required = int(np.array(req.hours_matrix, dtype=int).sum())
        except Exception:
            total_required = 0

    best_plan = result.plans[0]
    best_score = float(result.scores[0]) if result.scores else 0.0
    non_zero = int((best_plan != 0).sum())
    if total_required > 0 and non_zero == 0:
        return {
            "ok": False,
            "message": "Piano vuoto generato: controlla ore materia/classe e assegnazioni.",
            "errors": ["Il solver ha restituito tutti zeri."],
        }

    response = {
        "ok": True,
        "best_score": best_score,
        "plan": best_plan.tolist(),
        "days": config.days,
        "daily_hours": config.daily_hours,
        "num_professors": config.num_professors,
        "num_classes": config.num_classes,
        "class_names": config.class_names,
        "professor_names": config.professor_names,
        "hour_names": config.hour_names or [],
        "week_labels": result.week_labels or ["Settimana A"],
        "total_required": total_required,
        "non_zero_total": non_zero,
        "using_subject_planner": bool(subject_ctx),
    }
    if subject_ctx and len(result.plans) > 1:
        response["plan_week_b"] = result.plans[1].tolist()
        non_zero_b = int((result.plans[1] != 0).sum())
        response["non_zero_week_b"] = non_zero_b
        if total_required > 0 and non_zero_b == 0:
            return {
                "ok": False,
                "message": "Piano vuoto per la settimana B: controlla ore materia/classe e assegnazioni.",
                "errors": ["Il solver ha restituito tutti zeri per la settimana B."],
            }
    persist_example_plan(
        response
        | {"method": req.method}
        | {
            "request": {
                "payload": req.model_dump(),
                "using_subject_planner": bool(subject_ctx),
            }
        }
    )
    return response


@app.post("/api/classes-pdf")
async def classes_pdf(req: PlannerRequest, week_index: int = 0):
    """
    Genera il PDF dei piani per classi usando lo stesso metodo richiesto.
    Usa week_index per scegliere la settimana (0 = A, 1 = B).
    """
    config = build_config_from_request(req)
    validation_errors = validate_config(config)
    if validation_errors:
        return {
            "ok": False,
            "message": "Parametri non validi per generare il PDF.",
            "errors": validation_errors,
        }
    subject_ctx = normalize_subject_input(req, config)
    if subject_ctx:
        subject_errors = validate_subject_data(subject_ctx, config)
        if subject_errors:
            return {
                "ok": False,
                "message": "Parametri materie non validi per il PDF.",
                "errors": subject_errors,
            }
    try:
        result = get_or_generate_result(req, config, subject_ctx)
    except ValueError as e:
        return {
            "ok": False,
            "message": str(e),
        }

    if not result.plans:
        return {
            "ok": False,
            "message": "Impossibile generare un piano valido per creare il PDF.",
        }

    plan_index = min(week_index, len(result.plans) - 1)
    week_label = (result.week_labels or ["A"])[plan_index].replace(" ", "_")
    pdf_bytes = render_classes_pdf(result, config, plan_index=plan_index)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Piano_classi_{week_label}.pdf"'},
    )


@app.post("/api/professors-pdf")
async def professors_pdf(req: PlannerRequest, week_index: int = 0):
    """
    Genera il PDF dei piani per professori usando lo stesso metodo richiesto.
    Usa week_index per scegliere la settimana (0 = A, 1 = B).
    """
    config = build_config_from_request(req)
    validation_errors = validate_config(config)
    if validation_errors:
        return {
            "ok": False,
            "message": "Parametri non validi per generare il PDF.",
            "errors": validation_errors,
        }
    subject_ctx = normalize_subject_input(req, config)
    if subject_ctx:
        subject_errors = validate_subject_data(subject_ctx, config)
        if subject_errors:
            return {
                "ok": False,
                "message": "Parametri materie non validi per il PDF.",
                "errors": subject_errors,
            }
    try:
        result = get_or_generate_result(req, config, subject_ctx)
    except ValueError as e:
        return {
            "ok": False,
            "message": str(e),
        }

    if not result.plans:
        return {
            "ok": False,
            "message": "Impossibile generare un piano valido per creare il PDF.",
        }

    plan_index = min(week_index, len(result.plans) - 1)
    week_label = (result.week_labels or ["A"])[plan_index].replace(" ", "_")
    pdf_bytes = render_professors_pdf(result, config, plan_index=plan_index)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Piano_professori_{week_label}.pdf"'},
    )


def _build_result_for_export(req: PlannerRequest, config: PlannerConfig, subject_ctx):
    """Logica comune per gli endpoint di esportazione (PDF ed Excel)."""
    validation_errors = validate_config(config)
    if validation_errors:
        return None, {"ok": False, "message": "Parametri non validi.", "errors": validation_errors}
    if subject_ctx:
        subject_errors = validate_subject_data(subject_ctx, config)
        if subject_errors:
            return None, {"ok": False, "message": "Parametri materie non validi.", "errors": subject_errors}
    try:
        result = get_or_generate_result(req, config, subject_ctx)
    except ValueError as e:
        return None, {"ok": False, "message": str(e)}
    if not result.plans:
        return None, {"ok": False, "message": "Nessun piano disponibile per l'esportazione."}
    return result, None


@app.post("/api/classes-excel")
async def classes_excel(req: PlannerRequest, week_index: int = 0):
    """
    Genera il file Excel dei piani per classi (un foglio per classe).
    Usa week_index per scegliere la settimana (0 = A, 1 = B).
    """
    config = build_config_from_request(req)
    subject_ctx = normalize_subject_input(req, config)
    result, err = _build_result_for_export(req, config, subject_ctx)
    if err:
        return err

    plan_index = min(week_index, len(result.plans) - 1)
    week_label = (result.week_labels or ["A"])[plan_index].replace(" ", "_")
    excel_bytes = render_classes_excel(result, config, plan_index=plan_index)

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Piano_classi_{week_label}.xlsx"'},
    )


@app.post("/api/professors-excel")
async def professors_excel(req: PlannerRequest, week_index: int = 0):
    """
    Genera il file Excel dei piani per professori (un foglio per professore).
    Usa week_index per scegliere la settimana (0 = A, 1 = B).
    """
    config = build_config_from_request(req)
    subject_ctx = normalize_subject_input(req, config)
    result, err = _build_result_for_export(req, config, subject_ctx)
    if err:
        return err

    plan_index = min(week_index, len(result.plans) - 1)
    week_label = (result.week_labels or ["A"])[plan_index].replace(" ", "_")
    excel_bytes = render_professors_excel(result, config, plan_index=plan_index)

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Piano_professori_{week_label}.xlsx"'},
    )
