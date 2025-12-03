"""Validazione dei parametri e delle matrici prima della generazione piani.

Fornisce una funzione `validate_config` che ritorna una lista di stringhe
contenenti gli errori riscontrati. Lista vuota => tutto valido.
"""
from __future__ import annotations

from typing import List

import numpy as np

from .models import PlannerConfig


def validate_config(config: PlannerConfig) -> List[str]:
    errors: List[str] = []

    # Giorni
    if not isinstance(config.days, int) or config.days < 1 or config.days > 7:
        errors.append("Il numero di giorni deve essere tra 1 e 7.")

    # Ore giornaliere
    if not isinstance(config.daily_hours, int) or config.daily_hours < 1:
        errors.append("Le ore giornaliere devono essere >= 1.")

    # Ultima ora di mattina (separatore pranzo)
    if (
        not isinstance(config.last_morning_hour, int)
        or config.last_morning_hour < 1
        or config.last_morning_hour > config.daily_hours
    ):
        errors.append(
            "`last_morning_hour` deve essere compreso tra 1 e le ore giornaliere."
        )

    # Mercoledì pomeriggio libero richiede almeno 3 giorni e ore pomeridiane
    if config.wednesday_afternoon_free:
        if config.days < 3:
            errors.append(
                "Mercoledì pomeriggio libero attivato ma i giorni totali sono < 3."
            )
        if config.last_morning_hour >= config.daily_hours:
            errors.append(
                "Mercoledì pomeriggio libero attivato ma non esistono ore pomeridiane."
            )

    # Nomi
    if config.class_names is not None:
        if config.num_classes != len(config.class_names):
            errors.append(
                "Il numero di nomi classi non corrisponde al numero di classi."
            )
        if any(not n or not n.strip() for n in config.class_names):
            errors.append("Esistono nomi classi vuoti/non validi.")
    if config.professor_names is not None:
        if config.num_professors != len(config.professor_names):
            errors.append(
                "Il numero di nomi professori non corrisponde al numero di professori."
            )
        if any(not n or not n.strip() for n in config.professor_names):
            errors.append("Esistono nomi professori vuoti/non validi.")

    # Nomi ore (opzionale)
    if config.hour_names is not None:
        if len(config.hour_names) != config.daily_hours:
            errors.append(
                "Il numero di nomi ore non corrisponde al numero di ore giornaliere."
            )
        elif any(not h or not h.strip() for h in config.hour_names):
            errors.append("Esistono nomi ora vuoti/non validi.")

    # Matrice ore
    H = np.array(config.hours_matrix, dtype=int)
    if H.shape != (config.num_professors, config.num_classes):
        errors.append("Dimensioni di hours_matrix non coerenti.")
    if np.any(H < 0):
        errors.append("La matrice delle ore contiene valori negativi.")

    # Disponibilità
    if config.availability is not None:
        D = np.array(config.availability, dtype=bool)
        if D.ndim == 2:
            if D.shape != (config.num_professors, config.days):
                errors.append("Dimensioni di availability non coerenti.")
        elif D.ndim == 3:
            if D.shape != (config.num_professors, config.days, 2):
                errors.append("Dimensioni di availability non coerenti.")
        else:
            errors.append("Struttura della availability non valida.")

    # Vincoli di capacità elementari
    # (al massimo 2 ore/giorno per (prof,classe) => H[p,c] <= 2*days)
    for p in range(config.num_professors):
        for c in range(config.num_classes):
            if H[p, c] > 2 * config.days:
                errors.append(
                    f"Ore richieste troppo alte per prof {p+1}/classe {c+1}: {H[p,c]} > 2*giorni"
                )

    # Totale ore per professore / classe non può superare slot disponibili
    max_slots = config.days * config.daily_hours
    prof_tot = H.sum(axis=1)
    class_tot = H.sum(axis=0)
    for p, tot in enumerate(prof_tot, start=1):
        if tot > max_slots:
            errors.append(
                f"Ore totali richieste per prof {p} ({tot}) superano gli slot disponibili ({max_slots})."
            )
    for c, tot in enumerate(class_tot, start=1):
        if tot > max_slots:
            errors.append(
                f"Ore totali richieste per classe {c} ({tot}) superano gli slot disponibili ({max_slots})."
            )

    return errors
