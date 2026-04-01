# Esempio JSON per tutte le pagine

Scenario unico e coerente per provare il caricamento dati in UI:
- 5 giorni (lun–ven), 6 ore al giorno (5 mattina + 1 pomeriggio libero il mercoledì).
- 3 docenti, 2 classi (1A, 1B), 3 materie.
- Scienze usa settimana A/B per mostrare il caso alternato.

Ordine consigliato di caricamento (usa i pulsanti "Carica JSON" di ogni step):
1. Step 1 – Dati iniziali: `dati_iniziali.json`
2. Step 2 – Nomenclatura: `nomenclatura.json`
3. Step 3 – Ore per materia/classe: `ore_materie_classi.json`
4. Step 4 – Assegnazioni docenti/materie: `assegnazioni.json`
5. Step Disponibilità: `disponibilita.json` (dopo aver caricato le assegnazioni)

I file sono pensati per essere consistenti tra loro: numeri di giorni/prof/classi/materie coincidono e le ore assegnate coprono le richieste.

## Scenario complesso A/B (10 classi, 10 docenti, 6 materie)

- 5 giorni, 8 ore al giorno (4 mattina + 4 pomeriggio, mercoledì pomeriggio libero).
- 10 classi (1A–5B), 10 docenti; alcuni docenti gestiscono più materie e lavorano al 60–80%.
- 6 materie, con Scienze e Tecnologia/Arte che usano settimana A/B su alcune classi.

Ordine di caricamento:
1. Step 1 – Dati iniziali: `dati_iniziali_complex.json`
2. Step 2 – Nomenclatura: `nomenclatura_complex.json`
3. Step 3 – Ore per materia/classe: `ore_materie_classi_complex.json`
4. Step 4 – Assegnazioni docenti/materie: `assegnazioni_complex.json`
5. Step Disponibilità: `disponibilita_complex.json` (dopo aver caricato le assegnazioni)

Se preferisci un payload unico per l'API planner, usa `last_request_response_complex.json` dal file completo.
