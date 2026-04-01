## Flusso attuale (UI)

1) **Dati iniziali**  
   - Numeri di giorni, ore, prof, classi, materie e opzione pomeriggio libero.

2) **Nomenclatura**  
   - Nomi di prof, classi, materie, giorni, ore.  
   - Scarica/carica JSON: `nomenclatura.json`.

3) **Ore per materia/classe**  
   - Tabella materie (righe) × classi (colonne) con stile identico a “Limiti”: celle vuote valgono 0.  
   - Colonna “Settimana A/B”: se selezionata la materia si sdoppia in input A e B per ogni classe e nel totale riga mostra i due valori (A/B).  
   - Colonna “Totale”: mostra la somma per materia (A e B se presenti).  
   - Il flag `generateBothWeeks` viene calcolato automaticamente: è attivo se almeno una materia ha A/B.  
   - Scarica/carica JSON: `ore_materie_classi.json`.  
   - Stato salvato in `subjectClassHours`.

4) **Assegnazione ore/materie (per docente)**  
   - Per ogni prof si possono aggiungere N materie (pulsante “+ Aggiungi materia”), ciascuna con ore totali.  
   - Card “Copertura ore per materia” mostra ore disponibili (prof) / ore richieste (tabella Ore); blocca l’avanzamento se manca copertura.  
   - Scarica/carica JSON: `assegnazioni.json`.  
   - Stato salvato in `subjectAssignments`.

5) **Limiti giornalieri (materia × classe)**  
   - Tabella materie × classi per indicare il numero massimo di ore al giorno per materia/classe (default 2).  
   - Flag salvato: `aggregateHoursRule` (cerca di aggregare al massimo consentito).  
   - Stato salvato in `subjectDailyMax`.

6) **Preferenze**  
   - Checkbox “Preferisci un solo docente per materia/classe” (salvato in `singleTeacherRule`).  
   - Tabella prof × classi con checkbox di preferenza (dà priorità a quel prof su quella classe).  
   - Stato salvato in `preferences`.

7) **Disponibilità**  
   - Matrice disponibilità prof × giorni (mattina/pomeriggio).  
   - Scarica/carica JSON: `disponibilita.json`.

8) **Genera piano**  
   - UI e PDF come prima. **Nota:** il generatore/back-end usa ancora la matrice prof×classe (`hours_matrix`) del vecchio step “Ore”. La nuova matrice materia×classe non è ancora collegata al planner.

## Stato di integrazione

- **Nuovi dati raccolti**:  
  - `subjectAssignments` (prof → elenco materie + ore totali).  
  - `subjectClassHours` (materia → classi, con supporto Settimana A/B).  
  - `generateBothWeeks` (derivato automaticamente se esiste almeno una materia A/B).  
  - `subjectDailyMax` (limite ore/giorno per materia-classe) + regole `aggregateHoursRule` e `singleTeacherRule`.  
  - `preferences` (prof → classi, preferenze di abbinamento).  
  - Persistenza/URL-share aggiornata per includere questi nuovi campi.

- **Non ancora implementato**:  
  - Mappare `subjectAssignments` + `subjectClassHours` (A/B incluse) per costruire la matrice prof×classe per il solver.  
  - Adeguare il back-end (API / generatori) a lavorare per materia o a trasformare automaticamente i dati per docente.  
  - Usare le preferenze di classe e le ore materia/classe nel solver/PDF.  
  - Gestire la doppia pianificazione Settimana A/B: materie senza A/B devono produrre orari identici nelle due settimane; le materie A/B possono differire solo nelle ore specifiche per ciascuna settimana.

## Prossimi passi consigliati

1. Definire come derivare la matrice prof×classe (o un nuovo modello) combinando `subjectAssignments`, `subjectClassHours`, disponibilità e preferenze di classe.  
2. Aggiornare il back-end per accettare i nuovi dati (o aggiungere un layer di trasformazione front-end) prima di rimuovere definitivamente la vecchia matrice prof×classe.  
3. Aggiungere la pagina “Preferenze classe” dei professori, se richiesto.  
4. Integrare la settimana A/B anche nel solver sfruttando `generateBothWeeks` e la separazione delle ore A/B.  
5. Aggiornare la validazione e i PDF per includere materie/variazioni settimanali quando il modello sarà allineato.
