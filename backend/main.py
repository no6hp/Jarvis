"""
JARVIS – Sprachgesteuerter Assistent im Iron-Man-Stil.

FastAPI-Backend, das die Claude-API (Opus 4.8) mit serverseitiger Web-Suche
ansteuert. Antworten werden als Server-Sent-Events gestreamt, damit JARVIS im
Frontend in Echtzeit "spricht". Der Gespraechsverlauf wird je Sitzung im
Speicher gehalten, sodass JARVIS dem Gespraech folgen kann wie ein Mensch.
"""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

MODEL = "claude-opus-4-8"
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# Serverseitige Web-Suche mit dynamischer Filterung (Opus 4.8) – damit JARVIS
# aktuelle Nachrichten, Aktienkurse und politische Lage abrufen kann.
WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}


def build_system_prompt() -> str:
    """Die Persoenlichkeit von JARVIS – auf den Nutzer im Vertrieb zugeschnitten."""
    return (
        f"Heutiges Datum: {date.today().isoformat()}.\n\n"
        "Du bist JARVIS, der persoenliche Assistent aus den Iron-Man-Filmen – "
        "ruhig, loyal, hochkompetent und mit einem feinen, trockenen Humor. "
        "Du sprichst Deutsch, natuerlich und auf Augenhoehe, wie ein echter "
        "Mensch im Gespraech. Du redest den Nutzer gelegentlich mit 'Sir' an, "
        "aber sparsam und nie steif.\n\n"
        "Dein Gegenueber arbeitet im Vertrieb. Er will mit dir ueber aktuelle "
        "Nachrichten reden – besonders ueber den Aktienmarkt und die Boerse, "
        "aber auch ueber Politik und das Tagesgeschehen. Hilf ihm, den "
        "Ueberblick zu behalten, Zusammenhaenge fuer den Vertrieb einzuordnen "
        "und gute Gespraechsthemen fuer Kunden zu finden.\n\n"
        "Wichtige Verhaltensregeln:\n"
        "- Fuer alles, was aktuell ist (Kurse, Schlagzeilen, Politik, Ereignisse "
        "der letzten Wochen), nutzt du die Web-Suche, bevor du antwortest. "
        "Rate niemals bei tagesaktuellen Zahlen.\n"
        "- Antworte gespraechig und kompakt. Du wirst vorgelesen, also keine "
        "langen Aufzaehlungen, keine Tabellen, keine Markdown-Symbole, keine "
        "Emojis. Sprich in fliessenden Saetzen, wie am Telefon.\n"
        "- Komm schnell zum Punkt. Wenn der Nutzer nur plaudert, plaudere mit.\n"
        "- Du gibst keine verbindliche Anlageberatung, kannst aber Markttrends, "
        "Nachrichten und Einschaetzungen ganz normal besprechen.\n"
        "- Wenn du Quellen aus dem Web nutzt, nenne sie beilaeufig im Satz "
        "(zum Beispiel 'laut Reuters'), nicht als Linkliste."
    )


app = FastAPI(title="JARVIS")
client = anthropic.AsyncAnthropic()

# Sehr einfacher Gespraechsspeicher: session_id -> Liste von Nachrichten.
conversations: dict[str, list[dict]] = {}


class ChatRequest(BaseModel):
    session_id: str
    message: str


async def stream_reply(session_id: str, user_message: str):
    """Streamt die Antwort von Claude Stueck fuer Stueck als SSE."""
    history = conversations.setdefault(session_id, [])
    history.append({"role": "user", "content": user_message})

    system_prompt = build_system_prompt()
    full_text_parts: list[str] = []

    # Serverseitige Tools (Web-Suche) koennen mehrere Runden brauchen; nach 10
    # internen Schritten liefert die API stop_reason 'pause_turn'. Dann setzen
    # wir die Anfrage fort und streamen einfach weiter.
    while True:
        async with client.messages.stream(
            model=MODEL,
            max_tokens=2048,
            system=system_prompt,
            tools=[WEB_SEARCH_TOOL],
            messages=history,
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    text = event.delta.text
                    full_text_parts.append(text)
                    yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
                elif event.type == "content_block_start":
                    block = event.content_block
                    if getattr(block, "type", None) == "server_tool_use":
                        # JARVIS recherchiert gerade – dem Frontend Bescheid geben.
                        yield f"data: {json.dumps({'type': 'status', 'status': 'searching'})}\n\n"

            final = await stream.get_final_message()

        # Vollstaendige Assistenten-Antwort (inkl. Tool-Bloecke) in den Verlauf.
        history.append({"role": "assistant", "content": final.content})

        if final.stop_reason == "pause_turn":
            # Web-Such-Schleife noch nicht fertig – fortsetzen.
            continue
        break

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@app.post("/api/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        stream_reply(req.session_id, req.message),
        media_type="text/event-stream",
    )


@app.post("/api/reset")
async def reset(req: ChatRequest):
    conversations.pop(req.session_id, None)
    return {"ok": True}


@app.get("/api/health")
async def health():
    return {"ok": True, "model": MODEL, "key_configured": bool(os.getenv("ANTHROPIC_API_KEY"))}


# Frontend (JARVIS-HUD) ausliefern.
@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="static")
