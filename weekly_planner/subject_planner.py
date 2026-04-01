# subject_planner.py
#
# Planner basato su materie che supporta settimana A/B, limiti giornalieri per
# materia/classe e preferenze. Include due metodi: random (greedy) e MIP.

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, List, Optional, Tuple

import numpy as np
import pulp

from .models import PlanResult, PlannerConfig


@dataclass
class SubjectPlanningData:
    week_labels: List[str]
    required_hours: List[np.ndarray]  # per settimana: (classi, materie)
    prof_subject_caps: np.ndarray     # shape (prof, materie)
    subject_daily_max: np.ndarray     # shape (materie, classi)
    preferences: np.ndarray           # shape (prof, classi)
    aggregate_hours_rule: bool
    single_teacher_rule: bool
    subject_names: List[str]

    @property
    def num_subjects(self) -> int:
        return self.subject_daily_max.shape[0]

    @property
    def total_required(self) -> List[int]:
        return [int(req.sum()) for req in self.required_hours]


def _normalize_hours(arr: Any, length: int) -> List[int]:
    try:
        seq = list(arr)
    except Exception:
        seq = []
    return [
        int(seq[i]) if i < len(seq) and seq[i] is not None else 0
        for i in range(length)
    ]


def normalize_subject_input(req: Any, config: PlannerConfig) -> Optional[SubjectPlanningData]:
    """
    Converte i campi subject_* della request in strutture normalizzate.
    Ritorna None se non ci sono dati di materie.
    """
    subject_rows = list(getattr(req, "subject_class_hours", None) or [])
    num_subjects = len(subject_rows)
    if num_subjects == 0:
        return None

    num_classes = config.num_classes
    num_prof = config.num_professors

    subj_names = getattr(req, "subject_names", None) or []
    if len(subj_names) != num_subjects:
        subj_names = [f"Materia {i + 1}" for i in range(num_subjects)]

    generate_both = bool(getattr(req, "generate_both_weeks", False)) or any(
        getattr(row, "altWeeks", False) or (isinstance(row, dict) and row.get("altWeeks"))
        for row in subject_rows
    )
    week_labels = ["Settimana A"]
    if generate_both:
        week_labels.append("Settimana B")

    # Ore richieste per materia/classe per settimana
    required_hours: List[np.ndarray] = []
    for week_idx, _ in enumerate(week_labels):
        mat = np.zeros((num_classes, num_subjects), dtype=int)
        for s, row in enumerate(subject_rows):
            alt = bool(row.get("altWeeks") if isinstance(row, dict) else getattr(row, "altWeeks", False))
            base_hours = _normalize_hours(row.get("hours") if isinstance(row, dict) else getattr(row, "hours", []), num_classes)
            hours_a = _normalize_hours(
                row.get("hoursA") if isinstance(row, dict) else getattr(row, "hoursA", []),
                num_classes,
            )
            hours_b = _normalize_hours(
                row.get("hoursB") if isinstance(row, dict) else getattr(row, "hoursB", []),
                num_classes,
            )
            if alt:
                use = hours_a if week_idx == 0 else (hours_b if hours_b else hours_a)
            else:
                use = base_hours
            mat[:, s] = use
        required_hours.append(mat)

    # Limiti giornalieri materia/classe
    sdm_raw = getattr(req, "subject_daily_max", None)
    if sdm_raw and len(sdm_raw) == num_subjects:
        sdm = np.array(
            [
                _normalize_hours(row, num_classes)
                for row in sdm_raw
            ],
            dtype=int,
        )
    else:
        sdm = np.full((num_subjects, num_classes), 2, dtype=int)

    # Disponibilità ore per materia di ogni professore
    caps = np.zeros((num_prof, num_subjects), dtype=int)
    assignments = getattr(req, "subject_assignments", None) or []
    for p in range(num_prof):
        row = assignments[p] if p < len(assignments) else {}
        subj_list = row.get("subjects") if isinstance(row, dict) else getattr(row, "subjects", []) or []
        for entry in subj_list:
            s_idx = entry.get("subjectIndex") if isinstance(entry, dict) else getattr(entry, "subjectIndex", None)
            hours = entry.get("hours") if isinstance(entry, dict) else getattr(entry, "hours", None)
            if s_idx is None or hours is None:
                continue
            try:
                s_int = int(s_idx)
                h_int = max(0, int(hours))
            except (TypeError, ValueError):
                continue
            if 0 <= s_int < num_subjects:
                caps[p, s_int] += h_int

    # Preferenze prof × classe
    pref_raw = getattr(req, "preferences", None)
    prefs = np.zeros((num_prof, num_classes), dtype=bool)
    if pref_raw and len(pref_raw) == num_prof:
        prefs = np.array(
            [
                [bool(v) for v in _normalize_hours(row, num_classes)]
                for row in pref_raw
            ],
            dtype=bool,
        )

    aggregate_hours_rule = bool(getattr(req, "aggregate_hours_rule", True))
    single_teacher_rule = bool(getattr(req, "single_teacher_rule", True))

    return SubjectPlanningData(
        week_labels=week_labels,
        required_hours=required_hours,
        prof_subject_caps=caps,
        subject_daily_max=sdm,
        preferences=prefs,
        aggregate_hours_rule=aggregate_hours_rule,
        single_teacher_rule=single_teacher_rule,
        subject_names=subj_names,
    )


def validate_subject_data(ctx: SubjectPlanningData, config: PlannerConfig) -> List[str]:
    errors: List[str] = []
    num_subjects = ctx.num_subjects
    num_classes = config.num_classes
    num_prof = config.num_professors

    if ctx.subject_daily_max.shape != (num_subjects, num_classes):
        errors.append("Dimensioni di subject_daily_max non coerenti con materie/classi.")

    if ctx.prof_subject_caps.shape != (num_prof, num_subjects):
        errors.append("Dimensioni di subject_assignments non coerenti con numero di professori/materie.")

    for s in range(num_subjects):
        for c in range(num_classes):
            if ctx.subject_daily_max[s, c] <= 0:
                errors.append(f"Limite giornaliero non valido per materia {s+1}, classe {c+1}.")

    # Verifica copertura ore per materia
    caps_per_subject = ctx.prof_subject_caps.sum(axis=0)
    for week_idx, req in enumerate(ctx.required_hours):
        total_per_subject = req.sum(axis=0)
        for s in range(num_subjects):
            if total_per_subject[s] > caps_per_subject[s]:
                errors.append(
                    f"Settimana {ctx.week_labels[week_idx]}: ore richieste per '{ctx.subject_names[s]}' "
                    f"({int(total_per_subject[s])}) superano le ore disponibili dei professori ({int(caps_per_subject[s])})."
                )

    return errors


class SubjectMIPPlanner:
    """
    Planner MIP che lavora direttamente su materie.
    """

    def __init__(self, config: PlannerConfig, ctx: SubjectPlanningData):
        self.config = config
        self.ctx = ctx

        self.days = config.days
        self.daily_hours = config.daily_hours
        self.num_classes = config.num_classes
        self.num_prof = config.num_professors
        self.num_subjects = ctx.num_subjects
        self.last_morning_hour = config.last_morning_hour
        self.wed_free = config.wednesday_afternoon_free

        if config.availability is None:
            self.avail = np.ones((self.num_prof, self.days, 2), dtype=bool)
        else:
            A = np.array(config.availability, dtype=bool)
            if A.ndim == 2:
                A = np.repeat(A[:, :, None], 2, axis=2)
            self.avail = A

    def _is_available(self, prof: int, day: int, hour: int) -> bool:
        slot = 0 if hour < self.last_morning_hour else 1
        return bool(self.avail[prof, day, slot])

    def solve(self, time_limit_sec: int | None = 60) -> PlanResult:
        plans: List[np.ndarray] = []
        subject_plans: List[np.ndarray] = []
        scores: List[float] = []

        for week_idx, label in enumerate(self.ctx.week_labels):
            plan, subj_plan, score = self._solve_single_week(
                self.ctx.required_hours[week_idx],
                time_limit_sec=time_limit_sec,
            )
            if plan is None:
                return PlanResult(plans=[], scores=[], week_labels=self.ctx.week_labels)
            plans.append(plan)
            subject_plans.append(subj_plan)
            scores.append(score)

        return PlanResult(plans=plans, scores=scores, week_labels=self.ctx.week_labels, subject_plans=subject_plans)

    def _solve_single_week(
        self,
        required: np.ndarray,  # shape (classes, subjects)
        time_limit_sec: int | None = 60,
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], float]:
        D = self.days
        H = self.daily_hours
        C = self.num_classes
        S = self.num_subjects
        P = self.num_prof

        prob = pulp.LpProblem("SubjectWeeklyTimetable", pulp.LpMinimize)

        # Variabili: x[d,h,c,s,p] ∈ {0,1}
        x_idx = [(d, h, c, s, p) for d in range(D) for h in range(H) for c in range(C) for s in range(S) for p in range(P)]
        x = pulp.LpVariable.dicts("x", x_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Aggregazioni per materia
        z_idx = [(d, h, c, s) for d in range(D) for h in range(H) for c in range(C) for s in range(S)]
        z = pulp.LpVariable.dicts("z", z_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Inizio segmento per materia
        start_idx = [(d, h, c, s) for d in range(D) for h in range(H) for c in range(C) for s in range(S)]
        start = pulp.LpVariable.dicts("start", start_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Day used per materia/classe
        day_used_idx = [(d, c, s) for d in range(D) for c in range(C) for s in range(S)]
        day_used = pulp.LpVariable.dicts("day_used", day_used_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Prof working per slot
        work_idx = [(d, h, p) for d in range(D) for h in range(H) for p in range(P)]
        work = pulp.LpVariable.dicts("work", work_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Segmenti prof
        seg_idx = [(d, h, p) for d in range(D) for h in range(H) for p in range(P)]
        seg_start = pulp.LpVariable.dicts("seg_start", seg_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Prof utilizzato per materia/classe
        t_used_idx = [(c, s, p) for c in range(C) for s in range(S) for p in range(P)]
        t_used = pulp.LpVariable.dicts("t_used", t_used_idx, lowBound=0, upBound=1, cat=pulp.LpBinary)

        # Copertura ore materia/classe
        for c in range(C):
            for s in range(S):
                required_hours = int(required[c, s])
                if required_hours <= 0:
                    # Nessun vincolo se non servono ore
                    continue
                vars_list = [
                    x[(d, h, c, s, p)]
                    for d in range(D)
                    for h in range(H)
                    for p in range(P)
                ]
                prob += (
                    pulp.lpSum(vars_list) == required_hours,
                    f"Hours_c{c}_s{s}",
                )

        # Classe: 1 materia/prof per slot
        for d in range(D):
            for h in range(H):
                for c in range(C):
                    prob += (
                        pulp.lpSum(x[(d, h, c, s, p)] for s in range(S) for p in range(P)) <= 1,
                        f"ClassOne_d{d}_h{h}_c{c}",
                    )

        # Prof: 1 classe/slot
        for d in range(D):
            for h in range(H):
                for p in range(P):
                    prob += (
                        pulp.lpSum(x[(d, h, c, s, p)] for c in range(C) for s in range(S)) <= 1,
                        f"ProfOne_d{d}_h{h}_p{p}",
                    )

        # Disponibilità prof
        for p in range(P):
            for d in range(D):
                for h in range(H):
                    if not self._is_available(p, d, h):
                        for c in range(C):
                            for s in range(S):
                                prob += (x[(d, h, c, s, p)] == 0, f"Unavailable_d{d}_h{h}_c{c}_s{s}_p{p}")

        # Mercoledì pomeriggio libero
        if self.wed_free and D > 2:
            wed = 2
            for h in range(self.last_morning_hour, H):
                for c in range(C):
                    for s in range(S):
                        for p in range(P):
                            prob += (x[(wed, h, c, s, p)] == 0, f"WedFree_d{wed}_h{h}_c{c}_s{s}_p{p}")

        # Capacità prof per materia (non superare ore dichiarate)
        caps = self.ctx.prof_subject_caps
        for p in range(P):
            for s in range(S):
                cap = int(caps[p, s])
                if cap <= 0:
                    for d in range(D):
                        for h in range(H):
                            for c in range(C):
                                prob += (x[(d, h, c, s, p)] == 0, f"NoCap_p{p}_s{s}_d{d}_h{h}_c{c}")
                else:
                    prob += (
                        pulp.lpSum(x[(d, h, c, s, p)] for d in range(D) for h in range(H) for c in range(C)) <= cap,
                        f"Cap_p{p}_s{s}",
                    )

        # Limite giornaliero materia/classe
        for d in range(D):
            for c in range(C):
                for s in range(S):
                    max_day = int(self.ctx.subject_daily_max[s, c])
                    prob += (
                        pulp.lpSum(x[(d, h, c, s, p)] for h in range(H) for p in range(P)) <= max_day,
                        f"DailyMax_d{d}_c{c}_s{s}",
                    )

        # Collega z a x
        for d in range(D):
            for h in range(H):
                for c in range(C):
                    for s in range(S):
                        prob += (
                            pulp.lpSum(x[(d, h, c, s, p)] for p in range(P)) - z[(d, h, c, s)] == 0,
                            f"Def_z_d{d}_h{h}_c{c}_s{s}",
                        )

        # Materia: un solo segmento per giorno (niente slot separati)
        for d in range(D):
            for c in range(C):
                for s in range(S):
                    # h = 0
                    prob += (start[(d, 0, c, s)] >= z[(d, 0, c, s)], f"Start0_d{d}_c{c}_s{s}")
                    prob += (start[(d, 0, c, s)] <= z[(d, 0, c, s)], f"Start0Upper_d{d}_c{c}_s{s}")
                    for h in range(1, H):
                        prob += (
                            start[(d, h, c, s)] >= z[(d, h, c, s)] - z[(d, h - 1, c, s)],
                            f"Start_d{d}_h{h}_c{c}_s{s}",
                        )
                        prob += (
                            start[(d, h, c, s)] <= z[(d, h, c, s)],
                            f"StartUpper_d{d}_h{h}_c{c}_s{s}",
                        )
                    prob += (
                        pulp.lpSum(start[(d, h, c, s)] for h in range(H)) <= 1,
                        f"SingleSegment_d{d}_c{c}_s{s}",
                    )

        # Giorni utilizzati per materia/classe
        for d in range(D):
            for c in range(C):
                for s in range(S):
                    prob += (
                        day_used[(d, c, s)] >= pulp.lpSum(z[(d, h, c, s)] for h in range(H)) * (1.0 / max(1, H)),
                        f"DayUsedLower_d{d}_c{c}_s{s}",
                    )
                    prob += (
                        day_used[(d, c, s)] <= pulp.lpSum(z[(d, h, c, s)] for h in range(H)),
                        f"DayUsedUpper_d{d}_c{c}_s{s}",
                    )

        # Prof usato per materia/classe
        for c in range(C):
            for s in range(S):
                for p in range(P):
                    prob += (
                        t_used[(c, s, p)] >= pulp.lpSum(x[(d, h, c, s, p)] for d in range(D) for h in range(H)) * (1.0 / max(1, H * D)),
                        f"TUsedLower_c{c}_s{s}_p{p}",
                    )
                    prob += (
                        t_used[(c, s, p)] <= pulp.lpSum(x[(d, h, c, s, p)] for d in range(D) for h in range(H)),
                        f"TUsedUpper_c{c}_s{s}_p{p}",
                    )

                if self.ctx.single_teacher_rule:
                    prob += (
                        pulp.lpSum(t_used[(c, s, p)] for p in range(P)) <= 1,
                        f"SingleTeacher_c{c}_s{s}",
                    )

        # Prof work + segmenti per buche
        for d in range(D):
            for h in range(H):
                for p in range(P):
                    prob += (
                        pulp.lpSum(x[(d, h, c, s, p)] for c in range(C) for s in range(S)) - work[(d, h, p)] == 0,
                        f"DefWork_d{d}_h{h}_p{p}",
                    )

        for d in range(D):
            for p in range(P):
                prob += (seg_start[(d, 0, p)] >= work[(d, 0, p)], f"Seg0Lower_d{d}_p{p}")
                prob += (seg_start[(d, 0, p)] <= work[(d, 0, p)], f"Seg0Upper_d{d}_p{p}")
                for h in range(1, H):
                    prob += (
                        seg_start[(d, h, p)] >= work[(d, h, p)] - work[(d, h - 1, p)],
                        f"Seg_d{d}_h{h}_p{p}",
                    )
                    prob += (
                        seg_start[(d, h, p)] <= work[(d, h, p)],
                        f"SegUpper_d{d}_h{h}_p{p}",
                    )

        # Nessun blocco che attraversi pausa pranzo
        L = self.last_morning_hour
        if 0 < L < H:
            for d in range(D):
                for c in range(C):
                    for s in range(S):
                        for p in range(P):
                            prob += (
                                x[(d, L - 1, c, s, p)] + x[(d, L, c, s, p)] <= 1,
                                f"NoCrossLunch_d{d}_c{c}_s{s}_p{p}",
                            )

        # Obiettivo
        w_gap = 10.0
        w_day_spread = 4.0 if self.ctx.aggregate_hours_rule else 0.0
        w_nonpref = 1.0
        w_multi_teacher = 2.0 if not self.ctx.single_teacher_rule else 0.5
        w_last_hour = 0.2

        gap_terms = [seg_start[(d, h, p)] for d in range(D) for h in range(H) for p in range(P)]
        day_terms = [day_used[(d, c, s)] for d in range(D) for c in range(C) for s in range(S)]

        # Penalità per non preferenze
        pref_penalties = []
        prefs = self.ctx.preferences
        any_pref = prefs.any()
        for d in range(D):
            for h in range(H):
                for c in range(C):
                    for s in range(S):
                        for p in range(P):
                            if any_pref and not prefs[p, c]:
                                pref_penalties.append(x[(d, h, c, s, p)])

        last_terms = [
            x[(d, H - 1, c, s, p)]
            for d in range(D)
            for c in range(C)
            for s in range(S)
            for p in range(P)
        ]

        multi_teacher_terms = [t_used[(c, s, p)] for c in range(C) for s in range(S) for p in range(P)]

        prob += (
            w_gap * pulp.lpSum(gap_terms)
            + w_day_spread * pulp.lpSum(day_terms)
            + w_nonpref * pulp.lpSum(pref_penalties)
            + w_multi_teacher * pulp.lpSum(multi_teacher_terms)
            + w_last_hour * pulp.lpSum(last_terms),
            "Objective",
        )

        solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit_sec) if time_limit_sec else pulp.PULP_CBC_CMD(msg=False)
        prob.solve(solver)

        status = pulp.LpStatus[prob.status]
        if status not in ("Optimal", "Feasible"):
            return None, None, float("inf")

        Pmat = np.zeros((D, H, C), dtype=int)
        Smat = np.zeros((D, H, C), dtype=int)
        for d in range(D):
            for h in range(H):
                for c in range(C):
                    prof_found = 0
                    subj_found = 0
                    for s in range(S):
                        for p in range(P):
                            val = pulp.value(x[(d, h, c, s, p)])
                            if val is not None and val > 0.5:
                                prof_found = p + 1
                                subj_found = s + 1
                                break
                        if prof_found:
                            break
                    Pmat[d, h, c] = prof_found
                    Smat[d, h, c] = subj_found

        obj_val = float(pulp.value(prob.objective))
        return Pmat, Smat, obj_val


class SubjectRandomPlanner:
    """
    Planner greedy/random che rispetta i vincoli principali.
    """

    def __init__(self, config: PlannerConfig, ctx: SubjectPlanningData, seed: Optional[int] = None):
        self.config = config
        self.ctx = ctx
        self.days = config.days
        self.daily_hours = config.daily_hours
        self.num_classes = config.num_classes
        self.num_prof = config.num_professors
        self.num_subjects = ctx.num_subjects
        self.last_morning_hour = config.last_morning_hour
        self.wed_free = config.wednesday_afternoon_free

        if config.availability is None:
            self.avail = np.ones((self.num_prof, self.days, 2), dtype=bool)
        else:
            A = np.array(config.availability, dtype=bool)
            if A.ndim == 2:
                A = np.repeat(A[:, :, None], 2, axis=2)
            self.avail = A

        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

    def _is_available(self, prof: int, day: int, hour: int) -> bool:
        slot = 0 if hour < self.last_morning_hour else 1
        return bool(self.avail[prof, day, slot])

    def _score_plan(self, plan: np.ndarray) -> float:
        # riprende la logica anti-buche
        opt = 0.0
        weight_gap = 1.0
        weight_segments = 0.01
        weight_lunch_cross = 0.0001
        D, H, C = plan.shape
        for p in range(self.num_prof):
            for d in range(D):
                z = np.array(
                    [np.any(plan[d, h, :] == p + 1) for h in range(H)],
                    dtype=int,
                )
                if z.sum() <= 1:
                    continue
                hours = np.where(z == 1)[0]
                first = hours[0]
                last = hours[-1]
                gaps = 0
                for h in range(first, last + 1):
                    if z[h] == 0:
                        gaps += 1
                opt += weight_gap * gaps
                segments = 1
                for i in range(1, len(hours)):
                    if hours[i] > hours[i - 1] + 1:
                        segments += 1
                if segments > 1:
                    opt += weight_segments * (segments - 1)
                for i in range(1, len(hours)):
                    h_prev = hours[i - 1]
                    h_curr = hours[i]
                    if h_prev < self.last_morning_hour <= h_curr:
                        opt += weight_lunch_cross
        return opt

    def _build_blocks_for_week(self, required: np.ndarray) -> List[dict]:
        blocks = []
        max_per_day = self.ctx.subject_daily_max
        for c in range(self.num_classes):
            for s in range(self.num_subjects):
                total = int(required[c, s])
                if total <= 0:
                    continue
                daily_limit = max(1, int(max_per_day[s, c]))
                remaining = total
                while remaining > 0:
                    size = min(daily_limit if self.ctx.aggregate_hours_rule else 1, remaining)
                    # se resto>0 prova a usare blocco massimo per aggregare
                    blocks.append({"class": c, "subject": s, "size": size})
                    remaining -= size
        random.shuffle(blocks)
        return blocks

    def _pick_professor(self, c: int, s: int, size: int, remaining_caps: np.ndarray, teachers_for_cs: dict) -> Optional[int]:
        candidates = []
        for p in range(self.num_prof):
            if remaining_caps[p, s] < size:
                continue
            pref = bool(self.ctx.preferences[p, c]) if p < self.ctx.preferences.shape[0] else False
            already = teachers_for_cs.get((c, s))
            score = 0
            if pref:
                score -= 2
            if already is not None and already == p:
                score -= 3
            candidates.append((score, random.random(), p))
        if not candidates:
            return None
        candidates.sort()
        return candidates[0][2]

    def _place_block(
        self,
        plan: np.ndarray,
        subject_plan: np.ndarray,
        block: dict,
        prof: int,
        day_subject_load: np.ndarray,
    ) -> bool:
        size = block["size"]
        c = block["class"]
        s = block["subject"]
        D = self.days
        H = self.daily_hours
        tries = 400
        for _ in range(tries):
            d = random.randrange(D)
            if day_subject_load[d, c, s] > 0:
                # già presente un blocco di questa materia in quel giorno: mantieni contiguità evitando split
                continue
            start = random.randrange(max(1, H - size + 1))
            if self.wed_free and d == 2 and start >= self.last_morning_hour:
                continue
            # evita blocchi che attraversano pausa pranzo
            if 0 < self.last_morning_hour < H:
                if start <= self.last_morning_hour - 1 < start + size - 1:
                    continue
            ok = True
            for k in range(size):
                h = start + k
                if h >= H:
                    ok = False
                    break
                if day_subject_load[d, c, s] + size > self.ctx.subject_daily_max[s, c]:
                    ok = False
                    break
                if not self._is_available(prof, d, h):
                    ok = False
                    break
                if plan[d, h, c] != 0:
                    ok = False
                    break
                if np.any(plan[d, h, :] == prof + 1):
                    ok = False
                    break
                # stessa materia deve essere contigua: controlliamo le celle intorno al blocco
                if k == 0 and h > 0 and np.any(plan[d, h - 1, c] == prof + 1):
                    # ok, contiguità solo con stesso prof? lasciamo passare
                    pass
            if not ok:
                continue
            # Assign
            for k in range(size):
                h = start + k
                plan[d, h, c] = prof + 1
                subject_plan[d, h, c] = block["subject"] + 1
                day_subject_load[d, c, s] += 1
            return True
        return False

    def generate(self, time_limit_sec: float = 10.0) -> PlanResult:
        plans: List[np.ndarray] = []
        subject_plans: List[np.ndarray] = []
        scores: List[float] = []
        remaining_caps = np.array(self.ctx.prof_subject_caps, dtype=int)
        teachers_for_cs: dict[Tuple[int, int], int] = {}

        for week_idx, required in enumerate(self.ctx.required_hours):
            plan = np.zeros((self.days, self.daily_hours, self.num_classes), dtype=int)
            subject_plan = np.zeros((self.days, self.daily_hours, self.num_classes), dtype=int)
            day_subject_load = np.zeros((self.days, self.num_classes, self.num_subjects), dtype=int)
            blocks = self._build_blocks_for_week(required)
            success = True
            for blk in blocks:
                prof = self._pick_professor(blk["class"], blk["subject"], blk["size"], remaining_caps, teachers_for_cs)
                if prof is None:
                    success = False
                    break
                if not self._place_block(plan, subject_plan, blk, prof, day_subject_load):
                    success = False
                    break
                remaining_caps[prof, blk["subject"]] -= blk["size"]
                teachers_for_cs.setdefault((blk["class"], blk["subject"]), prof)
            if not success:
                return PlanResult(plans=[], scores=[], week_labels=self.ctx.week_labels)
            plans.append(plan)
            subject_plans.append(subject_plan)
            scores.append(self._score_plan(plan))

        return PlanResult(plans=plans, scores=scores, week_labels=self.ctx.week_labels, subject_plans=subject_plans)
