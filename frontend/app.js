/* JARVIS – Frontend-Logik: Neural-Orb, Spracherkennung, Sprachausgabe, Streaming-Chat. */

const stateLabel = document.getElementById("state-label");
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

/* ---------- Neural Orb (Canvas) ---------- */
const orbCanvas = document.getElementById("orb");
const ctx = orbCanvas.getContext("2d");

const DPR = window.devicePixelRatio || 1;
const SIZE = 280;
orbCanvas.width = SIZE * DPR;
orbCanvas.height = SIZE * DPR;
orbCanvas.style.width = SIZE + "px";
orbCanvas.style.height = SIZE + "px";
ctx.scale(DPR, DPR);

const CX = SIZE / 2;
const CY = SIZE / 2;
const SPHERE_R = SIZE * 0.37;
const NODE_COUNT = 160;

const nodes = [];
for (let i = 0; i < NODE_COUNT; i++) {
  const theta = 2 * Math.PI * Math.random();
  const phi = Math.acos(1 - 2 * Math.random());
  nodes.push({
    x: SPHERE_R * Math.sin(phi) * Math.cos(theta),
    y: SPHERE_R * Math.sin(phi) * Math.sin(theta),
    z: SPHERE_R * Math.cos(phi),
    phase: Math.random() * Math.PI * 2,
    freq: 0.4 + Math.random() * 1.3,
  });
}

const MAX_CONN = SPHERE_R * 0.72;
const connections = [];
for (let a = 0; a < NODE_COUNT; a++) {
  for (let b = a + 1; b < NODE_COUNT; b++) {
    const dx = nodes[a].x - nodes[b].x;
    const dy = nodes[a].y - nodes[b].y;
    const dz = nodes[a].z - nodes[b].z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < MAX_CONN) connections.push([a, b, d / MAX_CONN]);
  }
}

let rotY = 0;
const rotX = 0.28;
let orbMode = "idle";

const ORB_CFG = {
  idle:      { speed: 0.003, rgb: [79, 227, 255],  amp: 3,  glow: 1.0 },
  listening: { speed: 0.012, rgb: [255, 182, 72],  amp: 8,  glow: 1.4 },
  thinking:  { speed: 0.020, rgb: [79, 200, 255],  amp: 5,  glow: 1.1 },
  speaking:  { speed: 0.014, rgb: [100, 255, 210], amp: 13, glow: 1.7 },
};

function project3D(x, y, z) {
  const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
  const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
  const y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
  const fov = 500;
  const s = fov / (fov + z2 + SPHERE_R);
  return { px: x1 * s + CX, py: y2 * s + CY, depth: (z2 + SPHERE_R) / (2 * SPHERE_R) };
}

function drawOrb(ts) {
  const t = ts * 0.001;
  const cfg = ORB_CFG[orbMode] || ORB_CFG.idle;
  const [r, g, b] = cfg.rgb;

  ctx.clearRect(0, 0, SIZE, SIZE);
  rotY += cfg.speed;

  const pts = nodes.map(n => {
    const disp = Math.sin(t * n.freq + n.phase) * cfg.amp;
    return project3D(
      n.x * (1 + disp / SPHERE_R),
      n.y * (1 + disp / SPHERE_R),
      n.z * (1 + disp / SPHERE_R)
    );
  });

  for (const [a, b, ratio] of connections) {
    const pa = pts[a], pb = pts[b];
    const alpha = (1 - ratio) * ((pa.depth + pb.depth) * 0.5) * 0.48;
    if (alpha < 0.02) continue;
    ctx.beginPath();
    ctx.moveTo(pa.px, pa.py);
    ctx.lineTo(pb.px, pb.py);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }

  ctx.shadowColor = `rgb(${r},${g},${b})`;
  ctx.shadowBlur = orbMode === "speaking" ? 14 : orbMode === "listening" ? 10 : 5;
  for (const p of pts) {
    const alpha = 0.3 + p.depth * 0.7;
    const size = 0.6 + p.depth * 2.8;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(p.px, p.py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const pulse = 1 + 0.1 * Math.sin(t * 2.8);
  const glowR = SPHERE_R * 0.28 * cfg.glow * pulse;
  const grd = ctx.createRadialGradient(CX, CY, 0, CX, CY, glowR);
  grd.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(CX, CY, glowR, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(drawOrb);
}
requestAnimationFrame(drawOrb);

/* ---------- HUD-Zustand ---------- */
function setState(mode, label) {
  orbMode = mode;
  stateLabel.textContent = label;
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
  const de = voices.filter(v => v.lang.startsWith("de"));
  germanVoice =
    de.find(v => /markus|luca|yannick|stefan|hans|georg|daniel|male/i.test(v.name)) ||
    de.find(v => !/anna|sara|marie|julia|female/i.test(v.name) && de.indexOf(v) > 0) ||
    de.find(v => /google/i.test(v.name)) ||
    de[0] ||
    null;
}
pickVoice();
speechSynthesis.onvoiceschanged = pickVoice;

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
  utter.rate = 1.0;
  utter.pitch = 0.8;
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
  let buffer = "";
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

  recognition.onresult = (e) => {
    let finalText = "";
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
  micBtn.title = "Spracherkennung nicht verfuegbar – bitte Safari nutzen.";
}

function startListening() {
  if (!recognition || listening || isBusy) return;
  speechSynthesis.cancel();
  speechQueue = [];
  speaking = false;
  try {
    recognition.start();
    listening = true;
    micBtn.classList.add("recording");
    setState("listening", "Ich hoere zu …");
  } catch (_) {}
}

function stopListening() {
  if (recognition && listening) recognition.stop();
}

/* ---------- Bedienung ---------- */
micBtn.addEventListener("click", () => (listening ? stopListening() : startListening()));

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
  const msg = greet + " Alle Systeme online. Womit kann ich dienen?";
  addMessage("jarvis", msg);
  const unlock = () => {
    enqueueSpeech(msg);
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
});
