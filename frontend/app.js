/* JARVIS – Minimal: Neural Orb + Voice */

const micBtn = document.getElementById("mic-btn");
const textInput = document.getElementById("text-input");
const jarvisText = document.getElementById("jarvis-text");
const userText = document.getElementById("user-text");

const SESSION_ID = "sess-" + Math.random().toString(36).slice(2);
let isBusy = false;
let fadeTimer = null;

/* ---------- Neural Orb ---------- */
const orbCanvas = document.getElementById("orb");
const ctx = orbCanvas.getContext("2d");
const DPR = window.devicePixelRatio || 1;
const SIZE = Math.min(window.innerWidth, window.innerHeight) * 0.72;
orbCanvas.width = SIZE * DPR;
orbCanvas.height = SIZE * DPR;
orbCanvas.style.width = SIZE + "px";
orbCanvas.style.height = SIZE + "px";
ctx.scale(DPR, DPR);

const CX = SIZE / 2, CY = SIZE / 2;
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
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
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
    return project3D(n.x*(1+disp/SPHERE_R), n.y*(1+disp/SPHERE_R), n.z*(1+disp/SPHERE_R));
  });

  for (const [a, b, ratio] of connections) {
    const pa = pts[a], pb = pts[b];
    const alpha = (1-ratio) * ((pa.depth+pb.depth)*0.5) * 0.48;
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
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.3+p.depth*0.7).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(p.px, p.py, 0.6+p.depth*2.8, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const pulse = 1 + 0.1 * Math.sin(t * 2.8);
  const glowR = SPHERE_R * 0.28 * cfg.glow * pulse;
  const grd = ctx.createRadialGradient(CX,CY,0,CX,CY,glowR);
  grd.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(CX, CY, glowR, 0, Math.PI*2);
  ctx.fill();

  requestAnimationFrame(drawOrb);
}
requestAnimationFrame(drawOrb);

/* ---------- TTS – maennliche Stimme ---------- */
let germanVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const de = voices.filter(v => v.lang.startsWith("de"));
  germanVoice =
    de.find(v => /markus|luca|yannick|stefan|hans|georg|daniel/i.test(v.name)) ||
    de.find(v => !/anna|sara|marie|julia/i.test(v.name) && de.indexOf(v) > 0) ||
    de[0] || null;
}
pickVoice();
speechSynthesis.onvoiceschanged = pickVoice;

let speechQueue = [];
let speaking = false;

function enqueueSpeech(sentence) {
  if (!sentence.trim()) return;
  speechQueue.push(sentence.trim());
  if (!speaking) playNext();
}

function playNext() {
  if (speechQueue.length === 0) {
    speaking = false;
    orbMode = "idle";
    fadeTimer = setTimeout(() => {
      jarvisText.style.opacity = "0.3";
    }, 5000);
    return;
  }
  speaking = true;
  orbMode = "speaking";
  const utter = new SpeechSynthesisUtterance(speechQueue.shift());
  utter.lang = "de-DE";
  if (germanVoice) utter.voice = germanVoice;
  utter.rate = 1.05;
  utter.pitch = 0.8;
  utter.onend = playNext;
  utter.onerror = playNext;
  speechSynthesis.speak(utter);
}

/* ---------- Chat ---------- */
async function sendMessage(message) {
  if (isBusy || !message.trim()) return;
  isBusy = true;
  clearTimeout(fadeTimer);
  stopListening();
  speechSynthesis.cancel();
  speechQueue = [];
  speaking = false;

  userText.textContent = message;
  jarvisText.textContent = "";
  jarvisText.style.opacity = "1";
  orbMode = "thinking";

  let fullText = "";
  let buffer = "";

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
        if (evt.type === "text") {
          fullText += evt.text;
          jarvisText.textContent = fullText;
          buffer += evt.text;
          const match = buffer.match(/^(.*?[.!?…]+)\s+/s);
          if (match) {
            enqueueSpeech(match[1]);
            buffer = buffer.slice(match[0].length);
          }
        } else if (evt.type === "done") {
          if (buffer.trim()) enqueueSpeech(buffer);
        }
      }
    }
  } catch {
    jarvisText.textContent = "Verbindungsproblem, Sir.";
    enqueueSpeech(jarvisText.textContent);
  } finally {
    isBusy = false;
    if (!speaking) orbMode = "idle";
  }
}

/* ---------- STT ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SR) {
  recognition = new SR();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    let final = "", interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    textInput.value = final || interim;
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("recording");
    if (!isBusy) orbMode = "idle";
    const text = textInput.value.trim();
    if (text) { textInput.value = ""; sendMessage(text); }
  };
  recognition.onerror = () => { listening = false; micBtn.classList.remove("recording"); };
} else {
  micBtn.disabled = true;
}

function startListening() {
  if (!recognition || listening || isBusy) return;
  speechSynthesis.cancel(); speechQueue = []; speaking = false;
  try {
    recognition.start();
    listening = true;
    micBtn.classList.add("recording");
    orbMode = "listening";
  } catch (_) {}
}

function stopListening() {
  if (recognition && listening) recognition.stop();
}

micBtn.addEventListener("click", () => listening ? stopListening() : startListening());

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement !== textInput && !e.repeat) {
    e.preventDefault(); startListening();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && document.activeElement !== textInput) {
    e.preventDefault(); stopListening();
  }
});

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && textInput.value.trim()) {
    const text = textInput.value.trim();
    textInput.value = "";
    sendMessage(text);
  }
});

/* ---------- Start ---------- */
window.addEventListener("load", () => {
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Morgen, Sir." : hour < 18 ? "Tag, Sir." : "Abend, Sir.";
  const msg = greet + " Womit kann ich dienen?";
  jarvisText.textContent = msg;
  const unlock = () => {
    enqueueSpeech(msg);
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
});
