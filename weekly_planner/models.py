# weekly_planner/models.py

from dataclasses import dataclass
from typing import List, Optional
import numpy as np


@dataclass
class PlannerConfig:
    """
    Configurazione di base per il generatore di piani.
    """
    # Struttura temporale
    days: int                  # es. 5 (Lun-Ven)
    daily_hours: int           # es. 6 (ore al giorno)

    # Numeri di entità
    num_professors: int        # n
    num_classes: int           # m

    # H[p, c] = numero di ore settimanali del prof p con la classe c
    hours_matrix: np.ndarray   # shape (n, m), dtype=int

    # Disponibilità dei professori:
    #   - 2D: A[p, d] = True/False
    #   - 3D: A[p, d, s] con s=0 mattina, s=1 pomeriggio
    availability: Optional[np.ndarray] = None  # shape (n, days) or (n, days, 2)

    # Soglia che separa mattino / pomeriggio
    # hour >= last_morning_hour -> considerato pomeriggio
    last_morning_hour: int = 4

    # Se True, nessuna lezione nel mercoledì pomeriggio (giorno indice 2, slot >= last_morning_hour)
    wednesday_afternoon_free: bool = False

    # Nomi (opzionali) per classi e professori
    class_names: Optional[List[str]] = None
    professor_names: Optional[List[str]] = None
    # Nomi opzionali per le ore giornaliere (lunghezza = daily_hours)
    hour_names: Optional[List[str]] = None
    # Seed opzionale per random planner (0..9_999_999_999)
    seed: Optional[int] = None
    # Flag per indicare se un professore è docente di classe (niente limite 2h/dì)
    class_teachers: Optional[List[bool]] = None


@dataclass
class PlanResult:
    """
    Risultato della generazione dei piani.
    """
    plans: List[np.ndarray]    # lista di matrici (days, daily_hours, num_classes)
    scores: List[float]        # valore funzione di ottimizzazione (più basso = meglio)
