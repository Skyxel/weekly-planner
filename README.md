# Weekly Planner – School Timetable Generator

Weekly Planner è un progetto in Python per generare automaticamente piani settimanali scolastici (orari delle lezioni).
Permette di definire professori, classi, ore settimanali richieste e ottenere piani completi, validi, ottimizzati e scaricabili in PDF.
Include un backend FastAPI per l’utilizzo via web e un frontend React opzionale.

---

## 📂 Struttura del progetto

weekly-planner/
weekly_planner/
**init**.py
models.py
planner.py
pdf_export.py
config.py
cli.py
web_backend/
main.py
templates/
web_frontend/
(opzionale per React)
requirements.txt
README.md

---

## 🛠️ Installazione

Clona il repository e installa le dipendenze:

```
git clone https://github.com/<your-username>/weekly-planner.git
cd weekly-planner
pip install -r requirements.txt
```

---

## ▶️ Utilizzo da riga di comando

```
python -m weekly_planner.cli
```

Genera uno o più piani e, se previsto, esporta i PDF.

---

## 🌐 Avvio backend web

```
uvicorn web_backend.main:app --reload
```

Apri nel browser:

```
http://localhost:8000
```

---

## 📄 Licenza

MIT License

---

## ✔️ Note

Questa è una versione iniziale del progetto.
La logica, l’interfaccia web e le funzioni di esportazione PDF verranno ampliate e migliorate progressivamente.
