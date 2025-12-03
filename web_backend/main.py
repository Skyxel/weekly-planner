# web_backend/main.py

from typing import List, Optional
import random

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from weekly_planner.models import PlanResult, PlannerConfig
from weekly_planner.planner import WeeklyPlanner
from weekly_planner.mip_planner import MIPWeeklyPlanner
from weekly_planner.pdf_export import render_classes_pdf, render_professors_pdf
from weekly_planner.validation import validate_config


app = FastAPI()
templates = Jinja2Templates(directory="web_backend/templates")

# Serve file statici (CSS/JS) da /static
app.mount("/static", StaticFiles(directory="web_backend/static"), name="static")


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

    wednesday_afternoon_free: bool = False
    last_morning_hour: int = 3

    # "mip" oppure "random"
    method: str = "mip"
    hour_names: Optional[List[str]] = None
    seed: Optional[int] = None
    # Piano già generato da riutilizzare per i PDF (shape: days x daily_hours x num_classes)
    plan: Optional[List[List[List[int]]]] = None


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
                raise ValueError(
                    f"Shape di availability errata: atteso {expected_2d}, trovato {A.shape}"
                )
            A = np.repeat(A[:, :, None], 2, axis=2)
        elif A.ndim == 3:
            if A.shape != expected_3d:
                raise ValueError(
                    f"Shape di availability errata: atteso {expected_3d}, trovato {A.shape}"
                )
        else:
            raise ValueError("Struttura availability non valida.")
        availability_array = A

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
    )


def generate_with_method(config: PlannerConfig, method: str):
    """
    Helper: lancia il planner giusto in base a 'method'.
    Ritorna sempre un PlanResult.
    """
    method = (method or "mip").lower()
    if method == "random":
        planner = WeeklyPlanner(config)
        if hasattr(config, "seed") and config.seed is not None:
            np.random.seed(config.seed)
            random.seed(config.seed)
        # Continua finché lo score è adeguato o si esauriscono 10 secondi
        return planner.generate_until_time(
            target_score=0.1,
            time_limit_sec=10.0,
            show_progress=False,
        )
    else:
        planner = MIPWeeklyPlanner(config)
        return planner.solve(time_limit_sec=60)


def get_or_generate_result(req: PlannerRequest, config: PlannerConfig) -> PlanResult:
    """
    Se la richiesta include già un piano (req.plan), lo usa direttamente
    evitando di rigenerare. Altrimenti lancia il planner.
    """
    if req.plan is None:
        return generate_with_method(config, req.method)

    P = np.array(req.plan, dtype=int)
    expected_shape = (config.days, config.daily_hours, config.num_classes)
    if P.shape != expected_shape:
        raise ValueError(
            f"Shape di plan errata: atteso {expected_shape}, trovato {P.shape}"
        )

    return PlanResult(plans=[P], scores=[0.0])


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """
    Pagina principale con il form HTML + JS.
    """
    return templates.TemplateResponse("index.html", {"request": request})


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
    result = generate_with_method(config, req.method)

    if not result.plans:
        return {
            "ok": False,
            "message": "Nessun piano valido trovato con questi parametri.",
        }

    best_plan = result.plans[0]
    best_score = float(result.scores[0])

    return {
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
    }


@app.post("/api/classes-pdf")
async def classes_pdf(req: PlannerRequest):
    """
    Genera il PDF dei piani per classi usando lo stesso metodo richiesto.
    """
    config = build_config_from_request(req)
    validation_errors = validate_config(config)
    if validation_errors:
        return {
            "ok": False,
            "message": "Parametri non validi per generare il PDF.",
            "errors": validation_errors,
        }
    try:
        result = get_or_generate_result(req, config)
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

    pdf_bytes = render_classes_pdf(result, config, plan_index=0)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Piano_classi.pdf"'},
    )


@app.post("/api/professors-pdf")
async def professors_pdf(req: PlannerRequest):
    """
    Genera il PDF dei piani per professori usando lo stesso metodo richiesto.
    """
    config = build_config_from_request(req)
    validation_errors = validate_config(config)
    if validation_errors:
        return {
            "ok": False,
            "message": "Parametri non validi per generare il PDF.",
            "errors": validation_errors,
        }
    try:
        result = get_or_generate_result(req, config)
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

    pdf_bytes = render_professors_pdf(result, config, plan_index=0)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Piano_professori.pdf"'},
    )
