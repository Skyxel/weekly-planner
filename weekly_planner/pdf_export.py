# weekly_planner/pdf_export.py

import io
import math
from typing import List, Optional

import numpy as np
import matplotlib.pyplot as plt

from .models import PlannerConfig, PlanResult


DAY_LABELS = ["Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi"]


def _ensure_names(length: int, custom: Optional[List[str]], prefix: str) -> List[str]:
    """
    Se l'utente non ha fornito nomi, crea nomi di default.
    """
    if custom is not None and len(custom) == length:
        return custom
    return [f"{prefix} {i + 1}" for i in range(length)]


def render_classes_pdf(
    result: PlanResult,
    config: PlannerConfig,
    plan_index: int = 0,
) -> bytes:
    """
    Genera un PDF con i piani orari per ogni classe.

    Usa result.plans[plan_index], che è una matrice P[day, hour, class].
    """
    if not result.plans:
        raise ValueError("Nessun piano disponibile per generare il PDF.")

    P = result.plans[plan_index]
    days = config.days
    daily_hours = config.daily_hours
    m = config.num_classes

    class_names = _ensure_names(m, config.class_names, "Classe")
    professor_names = _ensure_names(config.num_professors, config.professor_names, "Prof")

    ncols = min(2, m)
    nrows = math.ceil(m / ncols)

    fig, axes = plt.subplots(nrows=nrows, ncols=ncols, figsize=(6 * ncols, 3.5 * nrows))
    fig.suptitle("Piani orari per classi", fontsize=16, fontweight="bold")

    axes = np.array(axes).reshape(-1)

    for c in range(m):
        ax = axes[c]

        data = []
        for h in range(daily_hours):
            row = []
            for d in range(days):
                prof_id = P[d, h, c]
                if prof_id == 0:
                    row.append("-")
                else:
                    row.append(professor_names[int(prof_id) - 1])
            data.append(row)

        col_labels = DAY_LABELS[:days]
        if config.hour_names is not None and len(config.hour_names) == daily_hours:
            row_labels = config.hour_names
        else:
            row_labels = [f"Ora {h + 1}" for h in range(daily_hours)]

        # Aggiunto pad per aumentare lo spazio fra titolo e tabella
        ax.set_title(f"Classe {class_names[c]}", fontweight="bold", pad=18)
        ax.axis("off")
        table = ax.table(
            cellText=data,
            colLabels=col_labels,
            rowLabels=row_labels,
            cellLoc="center",
            loc="center",
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1.2, 1.5)

    for i in range(m, len(axes)):
        axes[i].axis("off")

    # Maggiore spazio verticale tra i piani (subplots)
    buf = io.BytesIO()
    fig.tight_layout(rect=[0, 0, 1, 0.95])  # aumenta il gap tra le tabelle
    plt.savefig(buf, format="pdf")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def render_professors_pdf(
    result: PlanResult,
    config: PlannerConfig,
    plan_index: int = 0,
) -> bytes:
    """
    Genera un PDF con i piani orari per ogni professore.

    In ogni cella mettiamo il nome della classe (se il prof insegna
    in quello slot) o '-'.
    """
    if not result.plans:
        raise ValueError("Nessun piano disponibile per generare il PDF.")

    P = result.plans[plan_index]
    days = config.days
    daily_hours = config.daily_hours
    m = config.num_classes
    n = config.num_professors

    class_names = _ensure_names(m, config.class_names, "Classe")
    professor_names = _ensure_names(n, config.professor_names, "Prof")

    ncols = min(2, n)
    nrows = math.ceil(n / ncols)

    fig, axes = plt.subplots(nrows=nrows, ncols=ncols, figsize=(6 * ncols, 3.5 * nrows))
    fig.suptitle("Piani orari per professori", fontsize=16, fontweight="bold")

    axes = np.array(axes).reshape(-1)

    for p in range(n):
        ax = axes[p]

        data = []
        for h in range(daily_hours):
            row = []
            for d in range(days):
                classes_here = []
                for c in range(m):
                    if P[d, h, c] == p + 1:
                        classes_here.append(class_names[c])
                if not classes_here:
                    row.append("-")
                else:
                    row.append(", ".join(classes_here))
            data.append(row)

        col_labels = DAY_LABELS[:days]
        if config.hour_names is not None and len(config.hour_names) == daily_hours:
            row_labels = config.hour_names
        else:
            row_labels = [f"Ora {h + 1}" for h in range(daily_hours)]

        # Aggiunto pad per aumentare lo spazio fra titolo e tabella
        ax.set_title(f"Professore/essa {professor_names[p]}", fontweight="bold", pad=18)
        ax.axis("off")
        table = ax.table(
            cellText=data,
            colLabels=col_labels,
            rowLabels=row_labels,
            cellLoc="center",
            loc="center",
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1.2, 1.5)

    for i in range(n, len(axes)):
        axes[i].axis("off")

    # Maggiore spazio verticale tra i piani (subplots)
    buf = io.BytesIO()
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    plt.savefig(buf, format="pdf")
    plt.close(fig)
    buf.seek(0)
    return buf.read()
