/* JARVIS – Frontend-Logik: Spracherkennung, Sprachausgabe und Streaming-Chat. */

const reactor = document.getElementById("reactor");
const stateLabel = document.getElementById("state-label");
const visualizer = document.getElementById("visualizer");
const transcript = document.getElementById("transcript");
const micBtn = document.getElementById("mic-btn");
const textInput = document.getElementById("text-input");
const muteBtn = document.getElementById("mute-btn");
const resetBtn = document.getElementById("reset-btn");
const clock = document.getElementById("clock");

const SESSION_ID = "sess-" + Math.random().toString(36).slice(2);
let voiceEnabled = true;
let isBusy = false;

/* ---------- Uhr ---------- */
function tickClock() {
  clock.textContent = new Date().toLocaleTimeString("de-DE");
}
setInterval(tickClock, 1000);
tickClock();

/* ---------- HUD-Zustand ---------- */
function setState(mode, label) {
  reactor.className = mode;
  stateLabel.textContent = label;
  visualizer.classList.toggle("active", mode === "listening" || mode === "speaking");
}
setState("idle", "System bereit");

/* ---------- Transkript ---------- */
function addMessage(who, text) {
  const el = document.createElement("div");
  el.className = "msg " + who;
  el.innerHTML = `<span class="who">${who === "user" ? "Sie" : "Jarvis"}</span>`;
  const body = document.createElement("span");
  body.className = "body";
  body.textContent = text;
  el.appendChild(body);
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return body;
}

/* ---------- Sprachausgabe (TTS) ---------- */
let germanVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  germanVoice =
    voices.find((v) => v.lang.startsWith("de") && /google/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("de")) ||
    null;
}
pickVoice();
speechSynthesis.onvoiceschanged = pickVoice;

// Antworten werden satzweise vorgelesen, sobald sie eintreffen.
let speechQueue = [];
let speaking = false;

function enqueueSpeech(sentence) {
  if (!voiceEnabled || !sentence.trim()) return;
  speechQueue.push(sentence.trim());
  if (!speaking) playNext();
}

function playNext() {
  if (speechQueue.length === 0) {
    speaking = false;
    if (!isBusy) setState("idle", "System bereit");
    return;
  }
  speaking = true;
  setState("speaking", "Jarvis spricht");
  const utter = new SpeechSynthesisUtterance(speechQueue.shift());
  utter.lang = "de-DE";
  if (germanVoice) utter.voice = germanVoice;
  utter.rate = 1.05;
  utter.pitch = 1.0;
  utter.onend = playNext;
  utter.onerror = playNext;
  speechSynthesis.speak(utter);
}

/* ---------- Chat-Streaming ---------- */
async function sendMessage(message) {
  if (isBusy || !message.trim()) return;
  isBusy = true;
  stopListening();
  addMessage("user", message);
  setState("thinking", "Verarbeite Anfrage");

  const jarvisBody = addMessage("jarvis", "");
  let buffer = "";       // ungesprochener Rest fuer die Satz-Erkennung
  let spokeAnything = false;

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID, message }),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n\n");
      sseBuffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const evt = JSON.parse(line.slice(6));

        if (evt.type === "status" && evt.status === "searching") {
          setState("thinking", "Recherchiere im Netz");
        } else if (evt.type === "text") {
          jarvisBody.textContent += evt.text;
          buffer += evt.text;
          transcript.scrollTop = transcript.scrollHeight;

          // Vollstaendige Saetze sofort vorlesen.
          const match = buffer.match(/^(.*?[.!?…]+)\s+/s);
          if (match) {
            enqueueSpeech(match[1]);
            spokeAnything = true;
            buffer = buffer.slice(match[0].length);
          }
        } else if (evt.type === "done") {
          if (buffer.trim()) { enqueueSpeech(buffer); spokeAnything = true; }
        }
      }
    }
  } catch (err) {
    jarvisBody.textContent = "Verbindungsproblem, Sir. Ich erreiche das System gerade nicht.";
    enqueueSpeech(jarvisBody.textContent);
  } finally {
    isBusy = false;
    if (!speaking) setState("idle", "System bereit");
  }
}

/* ---------- Spracherkennung (STT) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SR) {
  recognition = new SR();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.continuous = false;

  let finalText = "";
  recognition.onresult = (e) => {
    finalText = "";
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    textInput.value = finalText || interim;
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("recording");
    if (!isBusy && !speaking) setState("idle", "System bereit");
    const text = textInput.value.trim();
    if (text) { textInput.value = ""; sendMessage(text); }
  };
  recognition.onerror = () => { listening = false; micBtn.classList.remove("recording"); };
} else {
  micBtn.disabled = true;
  micBtn.title = "Spracherkennung in diesem Browser nicht verfuegbar – bitte Chrome/Edge nutzen.";
}

function startListening() {
  if (!recognition || listening || isBusy) return;
  // Laufende Sprachausgabe stoppen, damit man JARVIS unterbrechen kann.
  speechSynthesis.cancel();
  speechQueue = [];
  speaking = false;
  try {
    recognition.start();
    listening = true;
    micBtn.classList.add("recording");
    setState("listening", "Ich hoere zu …");
  } catch (_) { /* bereits gestartet */ }
}

function stopListening() {
  if (recognition && listening) recognition.stop();
}

/* ---------- Bedienung ---------- */
micBtn.addEventListener("click", () => (listening ? stopListening() : startListening()));

// Leertaste gedrueckt halten = sprechen (nur wenn nicht im Textfeld).
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement !== textInput && !e.repeat) {
    e.preventDefault();
    startListening();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && document.activeElement !== textInput) {
    e.preventDefault();
    stopListening();
  }
});

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && textInput.value.trim()) {
    const text = textInput.value.trim();
    textInput.value = "";
    sendMessage(text);
  }
});

muteBtn.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  muteBtn.textContent = "Sprache: " + (voiceEnabled ? "An" : "Aus");
  muteBtn.classList.toggle("off", !voiceEnabled);
  if (!voiceEnabled) { speechSynthesis.cancel(); speechQueue = []; speaking = false; }
});

resetBtn.addEventListener("click", async () => {
  speechSynthesis.cancel();
  speechQueue = [];
  speaking = false;
  transcript.innerHTML = "";
  await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: SESSION_ID, message: "" }),
  });
  setState("idle", "System bereit");
});

/* ---------- Begruessung ---------- */
window.addEventListener("load", () => {
  const hour = new Date().getHours();
  const greet =
    hour < 11 ? "Guten Morgen, Sir." :
    hour < 18 ? "Guten Tag, Sir." :
    "Guten Abend, Sir.";
  const msg = greet + " Alle Systeme sind online. Womit kann ich helfen – die Maerkte, die Lage, ein Kunde?";
  addMessage("jarvis", msg);
  // Erste Sprachausgabe erst nach Nutzer-Interaktion erlauben (Browser-Politik).
  const unlock = () => { enqueueSpeech(msg); document.removeEventListener("click", unlock); document.removeEventListener("keydown", unlock); };
  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
});
