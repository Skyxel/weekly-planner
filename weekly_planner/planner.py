# weekly_planner/planner.py

from __future__ import annotations

from typing import List
import random
import time

import numpy as np

from .models import PlannerConfig, PlanResult


class WeeklyPlanner:
    """
    Planner base che genera piani in modo random ma rispettando:
      - ore richieste H[p, c]
      - disponibilità dei professori
      - nessuna sovrapposizione prof/classe
      - eventuale mercoledì pomeriggio libero
      - per ogni (prof, classe):
          * le ore sono aggregate in blocchi da 2 ore consecutive
            nello stesso giorno finché possibile
          * se il totale H[p,c] è dispari, rimane al massimo 1 ora singola
      - per ogni (prof, classe, giorno): 0, 1 o 2 ore
      - se ci sono 2 ore nello stesso giorno per (prof,classe),
        sono sempre consecutive (per costruzione)
      - nessun blocco di 2 ore a cavallo tra mattina e pomeriggio

    L'ottimizzazione cerca di:
      - ridurre le ore buche per professore
      - rendere le giornate più compatte possibile
    """

    def __init__(self, config: PlannerConfig):
        self.config = config

        self.days = config.days
        self.daily_hours = config.daily_hours
        self.n = config.num_professors
        self.m = config.num_classes
        self.H = np.array(config.hours_matrix, dtype=int)

        if config.availability is None:
            self.D = np.ones((self.n, self.days, 2), dtype=bool)
        else:
            D = np.array(config.availability, dtype=bool)
            if D.ndim == 2:
                D = np.repeat(D[:, :, None], 2, axis=2)
            self.D = D

        self.last_morning_hour = config.last_morning_hour
        self.wednesday_afternoon_free = config.wednesday_afternoon_free

    # ------------------------------------------------------------------
    # Controllo validità
    # ------------------------------------------------------------------

    def _is_available(self, prof: int, day: int, hour: int) -> bool:
        slot = 0 if hour < self.last_morning_hour else 1
        return bool(self.D[prof, day, slot])

    def _control(self, P: np.ndarray, show_error: bool = False) -> bool:
        """
        Controlla se il piano P rispetta H[p, c] (ore totali).
        P ha shape (days, daily_hours, m).
        """
        valid = True

        for c in range(self.m):
            for p in range(self.n):
                count = np.count_nonzero(P[:, :, c] == p + 1)
                if count != self.H[p, c]:
                    valid = False
                    if show_error:
                        print(
                            f"Errore per prof {p} con classe {c}: "
                            f"atteso {self.H[p, c]}, trovato {count}"
                        )

        return valid

    # ------------------------------------------------------------------
    # Funzione di costo: buche e compattezza per professore
    # ------------------------------------------------------------------

    def _optimization_value(self, P: np.ndarray) -> float:
        """
        Funzione di ottimizzazione:

        - penalizza le ore buche per professore
        - penalizza giornate molto spezzate
        - piccola penalità per attraversare la pausa pranzo

        Più basso è meglio.
        """
        opt = 0.0

        # pesi
        weight_gap = 1.0
        weight_segments = 0.01
        weight_lunch_cross = 0.0001

        for p in range(self.n):
            for d in range(self.days):
                if not self.D[p, d].any():
                    continue

                # vettore z[h] = 1 se il prof p ha lezione a quell'ora in quel giorno
                z = np.array(
                    [np.any(P[d, h, :] == p + 1) for h in range(self.daily_hours)],
                    dtype=int,
                )

                if z.sum() <= 1:
                    continue  # nessuna buca possibile

                # individua ore effettivamente lavorate
                hours = np.where(z == 1)[0]
                first = hours[0]
                last = hours[-1]

                # penalizza buche interne (slot tra first e last con z=0)
                gaps = 0
                for h in range(first, last + 1):
                    if z[h] == 0:
                        gaps += 1
                opt += weight_gap * gaps

                # penalizza numero di segmenti (blocchi contigui di lavoro)
                segments = 1
                for i in range(1, len(hours)):
                    if hours[i] > hours[i - 1] + 1:
                        segments += 1
                if segments > 1:
                    opt += weight_segments * (segments - 1)

                # penalità per attraversare pausa pranzo
                for i in range(1, len(hours)):
                    h_prev = hours[i - 1]
                    h_curr = hours[i]
                    if h_prev < self.last_morning_hour <= h_curr:
                        opt += weight_lunch_cross

        return opt

    # ------------------------------------------------------------------
    # Generazione base dei piani
    # ------------------------------------------------------------------

    def _generate_single_plan_basic(
        self,
        max_attempts: int = 100000000000,
    ) -> np.ndarray | None:
        """
        Genera un singolo piano P (days, daily_hours, m) in modo random,
        rispettando:
          - ore richieste H[p, c]
          - disponibilità D[p, day]
          - un professore non può essere in due classi nello stesso slot
          - mercoledì pomeriggio libero (se attivo)
          - per ogni (prof, classe):
              * ore aggregate in blocchi da 2 ore consecutive
                finché possibile
              * al massimo 1 ora singola (se H[p,c] è dispari)
          - per (prof, classe, giorno): 0, 1 o 2 ore
          - nessun blocco di 2 ore che attraversi mattina/pomeriggio
        """
        P = np.zeros((self.days, self.daily_hours, self.m), dtype=int)

        # Costruzione dei "blocchi di lezione":
        #   - blocchi da 2 ore
        #   - eventualmente un blocco da 1 ora
        # per ogni coppia (prof, classe).
        #
        # Ogni blocco è una tupla (prof, classe, size) con size in {1, 2}.
        blocks: List[tuple[int, int, int]] = []
        for p in range(self.n):
            for c in range(self.m):
                total_hours = int(self.H[p, c])
                if total_hours <= 0:
                    continue

                num_pairs = total_hours // 2
                remainder = total_hours % 2

                for _ in range(num_pairs):
                    blocks.append((p, c, 2))
                if remainder == 1:
                    blocks.append((p, c, 1))

        random.shuffle(blocks)

        attempts = 0

        for (prof, cls, size) in blocks:
            placed = False

            for _ in range(300):  # tentativi per blocco
                day = random.randrange(self.days)

                # mercoledì pomeriggio libero: valida sia per blocchi da 1 che da 2
                if self.wednesday_afternoon_free and day == 2:
                    # se qualsiasi ora del blocco cade nel pomeriggio, salta
                    if size == 1:
                        # per ora singola, controlliamo l'ora dopo
                        pass
                    else:
                        # per un blocco da 2 ore, se qualsiasi ora cade nel pomeriggio -> scartiamo giorno
                        # (semplifichiamo, così evitiamo complessità)
                        # useremo il controllo sull'ora più avanti, quindi qui non facciamo nulla
                        pass

                if size == 1:
                    # blocco da 1 ora
                    hour = random.randrange(self.daily_hours)

                    # mercoledì pomeriggio libero per la singola ora
                    if (
                        self.wednesday_afternoon_free
                        and day == 2
                        and hour >= self.last_morning_hour
                    ):
                        continue

                    # disponibilità prof
                    if not self._is_available(prof, day, hour):
                        continue

                    # slot per quella classe deve essere libero
                    if P[day, hour, cls] != 0:
                        continue

                    # prof non può avere lezione contemporaneamente in un'altra classe
                    if np.any(P[day, hour, :] == prof + 1):
                        continue

                    # max 2 ore al giorno per (prof, classe)
                    if np.count_nonzero(P[day, :, cls] == prof + 1) >= 2:
                        continue

                    # ok, assegniamo la singola ora
                    P[day, hour, cls] = prof + 1
                    placed = True
                    break

                else:
                    # blocco da 2 ore consecutive
                    # scegliamo un'ora di inizio tale che hour+1 sia valido
                    if self.daily_hours < 2:
                        # impossibile piazzare un blocco da 2
                        break

                    start_hour = random.randrange(self.daily_hours - 1)
                    h1 = start_hour
                    h2 = start_hour + 1

                    # nessun blocco di 2 ore che attraversi mattina/pomeriggio
                    if (
                        self.last_morning_hour > 0
                        and self.last_morning_hour < self.daily_hours
                        and h1 == self.last_morning_hour - 1
                        and h2 == self.last_morning_hour
                    ):
                        continue

                    # mercoledì pomeriggio libero per blocco da 2
                    if self.wednesday_afternoon_free and day == 2:
                        if h1 >= self.last_morning_hour or h2 >= self.last_morning_hour:
                            continue

                    # disponibilità prof (stesso giorno per entrambe le ore)
                    if not (self._is_available(prof, day, h1) and self._is_available(prof, day, h2)):
                        continue

                    # slot per quella classe devono essere liberi
                    if P[day, h1, cls] != 0 or P[day, h2, cls] != 0:
                        continue

                    # prof non può avere lezione contemporaneamente in un'altra classe
                    if np.any(P[day, h1, :] == prof + 1) or np.any(
                        P[day, h2, :] == prof + 1
                    ):
                        continue

                    # per questo (prof,classe,giorno) non devono esserci già ore
                    # (altrimenti superiamo le 2 ore/giorno o rompiamo i blocchi)
                    if np.count_nonzero(P[day, :, cls] == prof + 1) > 0:
                        continue

                    # ok, assegniamo il blocco da 2 ore consecutive
                    P[day, h1, cls] = prof + 1
                    P[day, h2, cls] = prof + 1
                    placed = True
                    break

            if not placed:
                attempts += 1
                if attempts > max_attempts:
                    return None

        return P

    def generate_plans_basic(
        self,
        num_variants: int = 3,
        max_global_tries: int = 50,
        show_progress: bool = False,
        seed: int | None = None,
    ) -> PlanResult:
        """
        Genera alcuni piani con l'algoritmo base random.
        Ritorna i migliori ordinati per score crescente.
        """
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)
        plans: List[np.ndarray] = []
        scores: List[float] = []

        tries = 0
        while len(plans) < num_variants and tries < max_global_tries:
            tries += 1
            if show_progress:
                print(f"Generazione piano {len(plans) + 1} (tentativo {tries})...")

            P = self._generate_single_plan_basic()
            if P is None:
                continue

            if not self._control(P, show_error=False):
                continue

            score = self._optimization_value(P)
            plans.append(P)
            scores.append(score)

        if not plans:
            return PlanResult(plans=[], scores=[])

        order = np.argsort(np.array(scores))
        plans_sorted = [plans[i] for i in order]
        scores_sorted = [float(scores[i]) for i in order]

        return PlanResult(plans=plans_sorted, scores=scores_sorted)

    def generate_until_time(
        self,
        target_score: float = 0.1,
        time_limit_sec: float = 10.0,
        show_progress: bool = False,
    ) -> PlanResult:
        """
        Tenta piani random finché non trova uno score abbastanza buono
        o fino a time_limit_sec. Ritorna sempre il migliore trovato.
        """
        start = time.perf_counter()
        best_plan: np.ndarray | None = None
        best_score: float = float("inf")
        attempts = 0

        while time.perf_counter() - start < time_limit_sec:
            attempts += 1
            P = self._generate_single_plan_basic()
            if P is None:
                continue
            if not self._control(P, show_error=False):
                continue

            score = self._optimization_value(P)
            if score < best_score:
                best_score = score
                best_plan = P
                if show_progress:
                    print(f"[random] nuovo best score {best_score:.4f} (tentativo {attempts})")
                if best_score <= target_score:
                    break

        if best_plan is None:
            return PlanResult(plans=[], scores=[])

        return PlanResult(plans=[best_plan], scores=[best_score])
