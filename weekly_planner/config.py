# weekly_planner/config.py

import numpy as np

from .models import PlannerConfig


def example_config() -> PlannerConfig:
    """
    Config di esempio per testare il planner.
    """
    days = 5
    daily_hours = 6
    num_professors = 3
    num_classes = 2

    # H[p, c] = numero di ore settimanali del prof p con la classe c
    H = np.array([
        [4, 3],  # prof 1
        [2, 3],  # prof 2
        [3, 2],  # prof 3
    ], dtype=int)

    availability = np.ones((num_professors, days), dtype=bool)

    return PlannerConfig(
        days=days,
        daily_hours=daily_hours,
        num_professors=num_professors,
        num_classes=num_classes,
        hours_matrix=H,
        availability=availability,
        last_morning_hour=3,
        wednesday_afternoon_free=True,  # es. mercoledì pomeriggio libero
        class_names=["1A", "1B"],
        professor_names=["Prof A", "Prof B", "Prof C"],
    )
