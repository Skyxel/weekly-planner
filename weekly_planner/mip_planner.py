# weekly_planner/mip_planner.py

from __future__ import annotations

from typing import List, Tuple

import numpy as np
import pulp

from .models import PlannerConfig, PlanResult


class MIPWeeklyPlanner:
    """
    Planner basato su MIP con PuLP (CBC solver).

    Vincoli:
      - ore totali H[p, c]
      - disponibilità professori
      - nessuna sovrapposizione prof/classe
      - mercoledì pomeriggio libero (se attivo)
      - max 2 ore al giorno per (prof, classe)
      - nessun blocco di 2 ore a cavallo tra mattina e pomeriggio
      - per una data (classe, prof, giorno) non sono ammesse
        2 ore NON adiacenti:
          ⇒ in pratica, con max 2 ore/dì:
             - 0 ore
             - 1 ora
             - 2 ore consecutive soltanto
        quindi la stessa classe NON può avere un professore
        lo stesso giorno in due ore diverse non di fila.

    Funzione obiettivo (anti-buche):
      - minimizza il numero di segmenti di lavoro per professore/giorno
        (giornate più compatte, meno buchi)
      - piccola penalità per le lezioni all'ultima ora della giornata.
    """

    def __init__(self, config: PlannerConfig):
        self.config = config

        self.days = config.days
        self.daily_hours = config.daily_hours
        self.n = config.num_professors
        self.m = config.num_classes
        self.H = np.array(config.hours_matrix, dtype=int)

        if config.availability is None:
            self.A = np.ones((self.n, self.days, 2), dtype=bool)
        else:
            A = np.array(config.availability, dtype=bool)
            if A.ndim == 2:
                A = np.repeat(A[:, :, None], 2, axis=2)
            self.A = A

        self.last_morning_hour = config.last_morning_hour
        self.wed_free = config.wednesday_afternoon_free

    def _is_available(self, prof: int, day: int, hour: int) -> bool:
        slot = 0 if hour < self.last_morning_hour else 1
        return bool(self.A[prof, day, slot])

    def solve(self, time_limit_sec: int | None = 60) -> PlanResult:
        """
        Costruisce e risolve il modello MIP con PuLP.
        """
        D = self.days
        H = self.daily_hours
        M = self.m
        N = self.n

        prob = pulp.LpProblem("WeeklyTimetable", pulp.LpMinimize)

        # -----------------------------------------------------------
        # Variabili principali: x[d,h,c,p] ∈ {0,1}
        # -----------------------------------------------------------
        x_index: List[Tuple[int, int, int, int]] = [
            (d, h, c, p)
            for d in range(D)
            for h in range(H)
            for c in range(M)
            for p in range(N)
        ]
        x = pulp.LpVariable.dicts(
            "x",
            x_index,
            lowBound=0,
            upBound=1,
            cat=pulp.LpBinary,
        )

        # -----------------------------------------------------------
        # 1) Ore totali per prof / classe
        # -----------------------------------------------------------
        for p in range(N):
            for c in range(M):
                vars_list = [
                    x[(d, h, c, p)]
                    for d in range(D)
                    for h in range(H)
                ]
                required_hours = int(self.H[p, c])
                prob += (
                    pulp.lpSum(vars_list) == required_hours,
                    f"Hours_p{p}_c{c}",
                )

        # -----------------------------------------------------------
        # 2) Una classe ha al massimo un prof per slot
        # -----------------------------------------------------------
        for d in range(D):
            for h in range(H):
                for c in range(M):
                    prob += (
                        pulp.lpSum(x[(d, h, c, p)] for p in range(N)) <= 1,
                        f"ClassOneProf_d{d}_h{h}_c{c}",
                    )

        # -----------------------------------------------------------
        # 3) Un prof non può essere in due classi nello stesso slot
        # -----------------------------------------------------------
        for d in range(D):
            for h in range(H):
                for p in range(N):
                    prob += (
                        pulp.lpSum(x[(d, h, c, p)] for c in range(M)) <= 1,
                        f"ProfOneClass_d{d}_h{h}_p{p}",
                    )

        # -----------------------------------------------------------
        # 4) Disponibilità dei professori
        # -----------------------------------------------------------
        for p in range(N):
            for d in range(D):
                for h in range(H):
                    if not self._is_available(p, d, h):
                        for c in range(M):
                            prob += (
                                x[(d, h, c, p)] == 0,
                                f"Unavailable_p{p}_d{d}_h{h}_c{c}",
                            )

        # -----------------------------------------------------------
        # 5) Mercoledì pomeriggio libero (se attivo)
        # -----------------------------------------------------------
        if self.wed_free and D > 2:
            wed = 2  # giorno 2 = mercoledì (0-based)
            for h in range(self.last_morning_hour, H):
                for c in range(M):
                    for p in range(N):
                        prob += (
                            x[(wed, h, c, p)] == 0,
                            f"WedFree_d{wed}_h{h}_c{c}_p{p}",
                        )

        # -----------------------------------------------------------
        # 6) Max 2 ore al giorno per (prof, classe)
        # -----------------------------------------------------------
        for d in range(D):
            for p in range(N):
                for c in range(M):
                    prob += (
                        pulp.lpSum(x[(d, h, c, p)] for h in range(H)) <= 2,
                        f"Max2Hours_d{d}_p{p}_c{c}",
                    )

        # -----------------------------------------------------------
        # 6b) Per (prof, classe, giorno) le eventuali 2 ore
        #     devono essere consecutive:
        #
        #     vietiamo che per lo stesso (d,p,c) ci siano due ore
        #     NON adiacenti (differenza >= 2).
        #
        #     Con il vincolo precedente (max 2 ore/dì) questo implica:
        #       - 0 ore
        #       - 1 ora
        #       - 2 ore consecutive soltanto.
        # -----------------------------------------------------------
        for d in range(D):
            for p in range(N):
                for c in range(M):
                    for h1 in range(H):
                        for h2 in range(h1 + 2, H):
                            prob += (
                                x[(d, h1, c, p)] + x[(d, h2, c, p)] <= 1,
                                f"ConsecutiveBlock_d{d}_p{p}_c{c}_h{h1}_{h2}",
                            )

        # -----------------------------------------------------------
        # 7) Nessun blocco di 2 ore che attraversi mattina/pomeriggio
        #    (cioè non permettere (L-1, L) entrambe a 1)
        # -----------------------------------------------------------
        L = self.last_morning_hour
        if 0 < L < H:
            for d in range(D):
                for c in range(M):
                    for p in range(N):
                        prob += (
                            x[(d, L - 1, c, p)] + x[(d, L, c, p)] <= 1,
                            f"NoCrossLunchBlock_d{d}_c{c}_p{p}",
                        )

        # -----------------------------------------------------------
        # Variabili ausiliarie per l'obiettivo anti-buche
        # -----------------------------------------------------------
        # z[d,h,p] ∈ {0,1} = 1 se il prof p lavora in (d,h) (con qualunque classe)
        z_index: List[Tuple[int, int, int]] = [
            (d, h, p)
            for d in range(D)
            for h in range(H)
            for p in range(N)
        ]
        z = pulp.LpVariable.dicts(
            "z",
            z_index,
            lowBound=0,
            upBound=1,
            cat=pulp.LpBinary,
        )

        # s[d,h,p] ∈ {0,1} = 1 se (d,h) è l'inizio di un segmento di lavoro
        s_index: List[Tuple[int, int, int]] = [
            (d, h, p)
            for d in range(D)
            for h in range(H)
            for p in range(N)
        ]
        s = pulp.LpVariable.dicts(
            "s",
            s_index,
            lowBound=0,
            upBound=1,
            cat=pulp.LpBinary,
        )

        # Legare z a x:
        # dato che sum_c x <= 1, possiamo imporre:
        #   z[d,h,p] = sum_c x[d,h,c,p]
        for d in range(D):
            for h in range(H):
                for p in range(N):
                    prob += (
                        pulp.lpSum(x[(d, h, c, p)] for c in range(M)) - z[(d, h, p)] == 0,
                        f"Def_z_d{d}_h{h}_p{p}",
                    )

        # Definizione di s (inizio segmento):
        # h = 0: s[d,0,p] = z[d,0,p]
        # h > 0: s[d,h,p] >= z[d,h,p] - z[d,h-1,p], s[d,h,p] <= z[d,h,p]
        for d in range(D):
            for p in range(N):
                # h = 0
                prob += (
                    s[(d, 0, p)] >= z[(d, 0, p)],
                    f"StartSeg_h0_d{d}_p{p}",
                )
                prob += (
                    s[(d, 0, p)] <= z[(d, 0, p)],
                    f"StartSegUpper_h0_d{d}_p{p}",
                )
                # h > 0
                for h in range(1, H):
                    prob += (
                        s[(d, h, p)] >= z[(d, h, p)] - z[(d, h - 1, p)],
                        f"StartSeg_d{d}_h{h}_p{p}",
                    )
                    prob += (
                        s[(d, h, p)] <= z[(d, h, p)],
                        f"StartSegUpper_d{d}_h{h}_p{p}",
                    )

        # -----------------------------------------------------------
        # Funzione obiettivo:
        #   w_gap * (numero segmenti) + w_last * (lezioni ultima ora)
        # -----------------------------------------------------------
        w_gap = 10.0
        w_last = 1.0

        # numero segmenti = sum s[d,h,p]
        gap_terms = [
            s[(d, h, p)]
            for d in range(D)
            for h in range(H)
            for p in range(N)
        ]

        # lezioni all'ultima ora
        last_hour = H - 1
        last_terms = [
            x[(d, last_hour, c, p)]
            for d in range(D)
            for c in range(M)
            for p in range(N)
        ]

        prob += (
            w_gap * pulp.lpSum(gap_terms) + w_last * pulp.lpSum(last_terms),
            "MinimizeGapsAndLastHour",
        )

        # -----------------------------------------------------------
        # Risoluzione
        # -----------------------------------------------------------
        if time_limit_sec is not None:
            solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=time_limit_sec)
        else:
            solver = pulp.PULP_CBC_CMD(msg=False)

        prob.solve(solver)

        status = pulp.LpStatus[prob.status]
        if status not in ("Optimal", "Feasible"):
            return PlanResult(plans=[], scores=[])

        # Ricostruisci P[d,h,c] = id_prof (1..N) o 0
        P = np.zeros((D, H, M), dtype=int)
        for d in range(D):
            for h in range(H):
                for c in range(M):
                    for p in range(N):
                        val = pulp.value(x[(d, h, c, p)])
                        if val is not None and val > 0.5:
                            P[d, h, c] = p + 1
                            break

        objective_value = float(pulp.value(prob.objective))

        return PlanResult(plans=[P], scores=[objective_value])
