# J.A.R.V.I.S.

Ein sprachgesteuerter Assistent im Stil von Iron Mans JARVIS – mit futuristischem
HUD-Interface, Arc-Reactor-Animation, deutscher Sprachein- und -ausgabe und einem
KI-Gehirn auf Basis von **Claude (Opus 4.8)**. JARVIS kann ganz normal mit dir
reden und holt sich für aktuelle Themen – **Aktienmarkt, Börse, Politik, News** –
live Informationen über die Web-Suche.

Gebaut für den Vertriebsalltag: über die Märkte reden, die Lage einordnen, gute
Gesprächsthemen für Kunden finden.

---

## Funktionen

- 🎙️ **Sprache zuerst** – per Mikrofon reden, JARVIS antwortet laut (deutsche TTS). Tippen geht zusätzlich.
- 🧠 **Claude Opus 4.8** als natürlicher Gesprächspartner mit Gedächtnis im Gespräch.
- 🌐 **Live-Web-Suche** für aktuelle Kurse, Schlagzeilen und politische Lage.
- ⚡ **Streaming** – JARVIS spricht los, sobald die ersten Sätze stehen.
- 🛰️ **Iron-Man-HUD** – Arc Reactor, rotierende Ringe, Audio-Visualizer, Statusanzeige.

---

## Schnellstart

Voraussetzungen: **Python 3.10+** und ein **Anthropic API-Key**.

```bash
# 1. Ins Backend wechseln
cd backend

# 2. (Empfohlen) virtuelle Umgebung
python3 -m venv .venv && source .venv/bin/activate

# 3. Abhängigkeiten installieren
pip install -r requirements.txt

# 4. API-Key hinterlegen
cp .env.example .env
#   -> .env öffnen und ANTHROPIC_API_KEY eintragen

# 5. Starten
uvicorn main:app --reload --port 8000
```

Dann im Browser **http://localhost:8000** öffnen.

> **Wichtig für die Sprache:** Spracherkennung (Mikrofon) funktioniert am besten in
> **Chrome** oder **Edge**. Beim ersten Klick fragt der Browser nach der
> Mikrofon-Erlaubnis. Die Sprachausgabe wird aus Browser-Gründen erst nach der
> ersten Interaktion (Klick/Taste) aktiv.

---

## Bedienung

| Aktion | So geht's |
|---|---|
| Sprechen | **Mikrofon-Button** klicken, oder **Leertaste** gedrückt halten |
| Tippen | Ins Textfeld schreiben und **Enter** |
| JARVIS unterbrechen | Einfach wieder zu sprechen anfangen |
| Stimme aus/an | Button **SPRACHE** |
| Gespräch zurücksetzen | Button **RESET** |

---

## Aufbau

```
Jarvis/
├── backend/
│   ├── main.py            # FastAPI: Claude-API + Web-Suche, SSE-Streaming
│   ├── requirements.txt
│   └── .env.example       # Vorlage für den API-Key
└── frontend/
    ├── index.html         # HUD-Struktur
    ├── style.css          # Iron-Man-Look (Arc Reactor, Ringe, Gitter)
    └── app.js             # Spracherkennung, Sprachausgabe, Streaming-Chat
```

Das Frontend wird direkt vom FastAPI-Server unter `/` ausgeliefert – kein
separater Webserver nötig.

---

## Anpassen

- **Persönlichkeit / Verhalten:** `build_system_prompt()` in `backend/main.py`.
- **Anrede, Tonfall, Themen-Fokus:** dort im Systemprompt anpassen.
- **Aussehen:** Farben über die CSS-Variablen oben in `frontend/style.css`
  (`--cyan`, `--amber`, …).

---

## Hinweis

JARVIS gibt keine verbindliche Anlageberatung – er bespricht Märkte, Nachrichten
und Einschätzungen als Gesprächspartner.
