# subject_greedy_planner.py
#
# Planner greedy veloce e affidabile per materie.
# Usa un algoritmo "stacking" che ordina gli assegnamenti per difficoltà
# e li posiziona rispettando vincoli, con backtracking se necessario.

import random
from typing import List, Optional, Tuple
import numpy as np

from .models import PlanResult, PlannerConfig
from .subject_planner import SubjectPlanningData


class SubjectGreedyPlanner:
    """
    Planner greedy veloce che genera piani validi senza usare solver MIP.
    Usa un algoritmo stacking + randomized placement con retry.
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
        """Calcola uno score per il piano (minore è meglio)."""
        score = 0.0
        D, H, C = plan.shape
        
        # Penalizza buchi nelle giornate dei prof
        for p in range(self.num_prof):
            for d in range(D):
                prof_hours = np.where(np.any(plan[d, :, :] == p + 1, axis=1))[0]
                if len(prof_hours) <= 1:
                    continue
                first = prof_hours[0]
                last = prof_hours[-1]
                gaps = 0
                for h in range(first, last + 1):
                    if not np.any(plan[d, h, :] == p + 1):
                        gaps += 1
                score += 0.5 * gaps
        
        return score

    def _try_generate_week(
        self,
        required: np.ndarray,  # shape (classes, subjects)
        max_attempts: int = 50,
        placement_tries: int = 500,
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Tenta di generare un piano per una settimana.
        Ritorna (plan, subject_plan) o (None, None) se fallisce dopo max_attempts.
        """

        for attempt in range(max_attempts):
            plan = np.zeros((self.days, self.daily_hours, self.num_classes), dtype=int)
            subject_plan = np.zeros((self.days, self.daily_hours, self.num_classes), dtype=int)
            
            # Crea lista di assegnamenti (class, subject, ore, difficoltà)
            tasks = []
            for c in range(self.num_classes):
                for s in range(self.num_subjects):
                    hours_needed = int(required[c, s])
                    if hours_needed <= 0:
                        continue
                    
                    # Difficoltà: quanti prof possono insegnare questa materia a questa classe
                    teachers_available = 0
                    for p in range(self.num_prof):
                        if self.ctx.prof_subject_caps[p, s] >= hours_needed:
                            teachers_available += 1
                    
                    difficulty = -teachers_available  # Negativo per sort ascendente (prima difficili)
                    daily_max = int(self.ctx.subject_daily_max[s, c])
                    
                    tasks.append({
                        "class": c,
                        "subject": s,
                        "hours_needed": hours_needed,
                        "difficulty": difficulty,
                        "daily_max": daily_max,
                    })
            
            # Ordina per difficoltà (più difficili prima)
            tasks.sort(key=lambda t: t["difficulty"])
            
            # Tracking
            prof_caps_remaining = np.array(self.ctx.prof_subject_caps, dtype=int)
            day_subject_load = np.zeros((self.days, self.num_classes, self.num_subjects), dtype=int)
            teachers_for_cs = {}  # (class, subject) -> prof
            
            success = True
            for task in tasks:
                c = task["class"]
                s = task["subject"]
                hours_needed = task["hours_needed"]
                daily_max = task["daily_max"]
                
                # Scegli prof (preferisci continuità)
                preferred_prof = teachers_for_cs.get((c, s))

                prof = None
                if preferred_prof is not None:
                    if prof_caps_remaining[preferred_prof, s] >= hours_needed:
                        prof = preferred_prof
                    elif self.ctx.single_teacher_rule:
                        # Con single_teacher_rule il prof è già fissato: non si può cambiare
                        success = False
                        break
                    else:
                        candidates = [
                            p for p in range(self.num_prof)
                            if prof_caps_remaining[p, s] >= hours_needed
                        ]
                        if candidates:
                            prof = random.choice(candidates)
                else:
                    candidates = [
                        p for p in range(self.num_prof)
                        if prof_caps_remaining[p, s] >= hours_needed
                    ]
                    if candidates:
                        prof = random.choice(candidates)

                if prof is None:
                    success = False
                    break
                
                # Posiziona le ore
                hours_placed = 0
                for _ in range(placement_tries):
                    if hours_placed >= hours_needed:
                        break
                    
                    # Scegli giorno e calcola block_size basandosi sul giorno scelto
                    d = random.randrange(self.days)
                    block_size = min(daily_max - day_subject_load[d, c, s],
                                    hours_needed - hours_placed)
                    block_size = max(1, block_size)
                    start = random.randrange(max(1, self.daily_hours - block_size + 1))
                    
                    # Verifica vincoli
                    if self.wed_free and d == 2 and start >= self.last_morning_hour:
                        continue
                    
                    if 0 < self.last_morning_hour < self.daily_hours:
                        if start <= self.last_morning_hour - 1 < start + block_size - 1:
                            continue
                    
                    # Verifica che le celle siano libere e il prof disponibile
                    cells_ok = True
                    for k in range(block_size):
                        h = start + k
                        if h >= self.daily_hours:
                            cells_ok = False
                            break
                        if plan[d, h, c] != 0:
                            cells_ok = False
                            break
                        if not self._is_available(prof, d, h):
                            cells_ok = False
                            break
                        if day_subject_load[d, c, s] + block_size > daily_max:
                            cells_ok = False
                            break
                        # Evita che lo stesso prof insegni 2 materie contemporaneamente
                        if np.any(plan[d, h, :] == prof + 1):
                            cells_ok = False
                            break
                    
                    if not cells_ok:
                        continue
                    
                    # Piazza il blocco
                    for k in range(block_size):
                        h = start + k
                        plan[d, h, c] = prof + 1
                        subject_plan[d, h, c] = s + 1

                    day_subject_load[d, c, s] += block_size
                    hours_placed += block_size
                
                if hours_placed < hours_needed:
                    success = False
                    break
                
                prof_caps_remaining[prof, s] -= hours_needed
                teachers_for_cs[(c, s)] = prof
            
            if success:
                return plan, subject_plan

        return None, None

    def generate(self, time_limit_sec: float = 5.0) -> PlanResult:
        """
        Genera piani per tutte le settimane.
        """
        plans: List[np.ndarray] = []
        subject_plans: List[np.ndarray] = []
        scores: List[float] = []

        for week_idx, required in enumerate(self.ctx.required_hours):
            plan, subj_plan = self._try_generate_week(required, max_attempts=50, placement_tries=500)

            if plan is None:
                # Se fallisce una settimana, il piano intero è fallito
                return PlanResult(plans=[], scores=[], week_labels=self.ctx.week_labels)

            plans.append(plan)
            subject_plans.append(subj_plan)
            scores.append(self._score_plan(plan))

        return PlanResult(plans=plans, scores=scores, week_labels=self.ctx.week_labels, subject_plans=subject_plans)
