const radio = document.getElementById("radio");
const statusText = document.getElementById("status");
const playBtn = document.getElementById("playBtn");
const nowPlayingText = document.getElementById("nowPlaying");
const lyricsEl = document.getElementById("lyrics");
const offsetHint = document.getElementById("offsetHint");
const lyricsPanel = document.getElementById("lyricsPanel");
const lyricsToggle = document.getElementById("lyricsToggle");

// Mostrar / ocultar el sidebar de letra
function setLyricsVisible(visible) {
  lyricsPanel.classList.toggle("collapsed", !visible);
  lyricsToggle.classList.toggle("collapsed", !visible);
  lyricsToggle.textContent = visible ? "›" : "‹";
}

lyricsToggle.addEventListener("click", () => {
  setLyricsVisible(lyricsPanel.classList.contains("collapsed"));
});

// URL con redirect oficial: siempre resuelve a un servidor vivo, en vez de
// fijar un edge concreto (que StreamTheWorld rota y provoca "Reconectando...").
const STREAM_URL =
  "https://playerservices.streamtheworld.com/api/livestream-redirect/FUTURO_SC.mp3";

// En desarrollo local (npx serve) usamos el proxy local; en la TV / empaquetado
// usamos el proxy desplegado en Render.
const isLocal =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal
  ? "http://localhost:3001"
  : "https://futuro-radio-proxy.onrender.com";
const METADATA_URL = API_BASE + "/metadata";
const LYRICS_URL = API_BASE + "/lyrics";

radio.src = STREAM_URL;

// --- Estado ---
let metadataTimer = null;
let currentSongKey = "";
let cueTimeStart = null; // ms epoch en que arrancó el tema en la emisora
let lyricLines = []; // [{ time: segundos, text }]
let activeIndex = -1;
let syncTimer = null;
let lyricsAnchor = 0; // ms en que se cargó la letra (usado en modo demo)

// Si el último tema arrancó hace más de esto, no hay canción sonando ahora
// (programa hablado o publicidad): no mostramos un tema viejo.
const SONG_MAX_AGE_MS = 12 * 60 * 1000;

// Modo demo (?demo=1): carga un tema de ejemplo para ver el karaoke aunque
// la emisora esté en un programa sin música.
const DEMO = new URLSearchParams(location.search).has("demo");
let demoLoaded = false;

// Retardo del stream: lo que oyes va unos segundos por detrás de la emisora.
// 16s es un punto de partida realista (medido en el PC); se calibra en vivo
// con las flechas ← → y se guarda por dispositivo.
let streamDelaySec = 16;
try {
  const saved = parseInt(localStorage.getItem("streamDelaySec"), 10);
  if (!isNaN(saved)) streamDelaySec = saved;
} catch (e) {}

// --- Metadatos (título + cueTimeStart) ---
async function updateNowPlaying() {
  try {
    const res = await fetch(METADATA_URL + "?_=" + Date.now(), { cache: "no-store" });
    const data = await res.json();

    const fresh =
      data.song &&
      data.cueTimeStart &&
      Date.now() - data.cueTimeStart < SONG_MAX_AGE_MS;

    if (fresh) {
      // Hay una canción sonando ahora
      cueTimeStart = data.cueTimeStart;
      nowPlayingText.innerText = "Ahora suena: " + (data.title || "");
      const key = (data.artist || "") + " - " + (data.song || "");
      if (key !== currentSongKey) {
        currentSongKey = key;
        loadLyrics(data.artist || "", data.song || "");
      }
      return;
    }

    // No hay canción ahora (programa hablado / publicidad)
    cueTimeStart = null;
    if (DEMO) {
      if (!demoLoaded) {
        demoLoaded = true;
        currentSongKey = "DEMO";
        nowPlayingText.innerText = "DEMO · The Cult - Lucifer";
        loadLyrics("The Cult", "Lucifer");
      }
    } else {
      nowPlayingText.innerText = "En vivo · sin música ahora";
      if (currentSongKey !== "") {
        currentSongKey = "";
        setLyricsMessage("Esperando la próxima canción…");
      }
    }
  } catch (err) {
    console.error("Metadata error:", err);
  }
}

function startMetadataPolling() {
  if (metadataTimer) return;
  updateNowPlaying();
  metadataTimer = setInterval(updateNowPlaying, 15000);
}

function stopMetadataPolling() {
  clearInterval(metadataTimer);
  metadataTimer = null;
}

// --- Letra ---
async function loadLyrics(artist, song) {
  stopSync();
  lyricLines = [];
  activeIndex = -1;
  lyricsEl.classList.remove("plain");
  setLyricsMessage("Buscando letra...");

  try {
    const url =
      LYRICS_URL +
      "?artist=" +
      encodeURIComponent(artist) +
      "&track=" +
      encodeURIComponent(song) +
      "&_=" +
      Date.now();
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    // Si cambió la canción mientras buscábamos, descartamos esta respuesta
    if (currentSongKey !== artist + " - " + song) return;

    if (data.syncedLyrics) {
      lyricLines = parseLRC(data.syncedLyrics);
      if (lyricLines.length) {
        renderSynced();
        return;
      }
    }
    if (data.plainLyrics) {
      renderPlain(data.plainLyrics);
      return;
    }
    setLyricsMessage("Letra no disponible");
  } catch (err) {
    console.error("Lyrics error:", err);
    setLyricsMessage("No se pudo cargar la letra");
  }
}

// Convierte LRC ("[mm:ss.xx] texto") en [{ time, text }]
function parseLRC(lrc) {
  const out = [];
  lrc.split("\n").forEach((line) => {
    const tags = line.match(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g);
    if (!tags) return;
    const text = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "").trim();
    tags.forEach((t) => {
      const m = t.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/);
      if (m) {
        const time =
          parseInt(m[1], 10) * 60 +
          parseInt(m[2], 10) +
          (m[3] ? parseFloat("0." + m[3]) : 0);
        out.push({ time: time, text: text });
      }
    });
  });
  out.sort((a, b) => a.time - b.time);
  return out;
}

function renderSynced() {
  lyricsEl.classList.remove("plain");
  lyricsEl.innerHTML = "";
  lyricLines.forEach((l) => {
    const div = document.createElement("div");
    div.className = "line";
    div.textContent = l.text || "♪"; // ♪ para líneas instrumentales
    lyricsEl.appendChild(div);
  });
  lyricsEl.scrollTop = 0;
  // En demo arrancamos 3s antes de la primera línea para no esperar la intro
  lyricsAnchor =
    DEMO && lyricLines.length
      ? Date.now() - Math.max(0, lyricLines[0].time - 3) * 1000
      : Date.now();
  startSync();
}

function renderPlain(text) {
  stopSync();
  lyricsEl.classList.add("plain");
  lyricsEl.innerHTML = "";
  text.split("\n").forEach((t) => {
    const div = document.createElement("div");
    div.className = "line";
    div.textContent = t || " ";
    lyricsEl.appendChild(div);
  });
  lyricsEl.scrollTop = 0;
}

function setLyricsMessage(msg) {
  stopSync();
  lyricsEl.classList.remove("plain");
  lyricsEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = "lyrics-message";
  div.textContent = msg;
  lyricsEl.appendChild(div);
}

// --- Sincronización karaoke ---
function startSync() {
  stopSync();
  syncTimer = setInterval(tickSync, 250);
  tickSync();
}

function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

// Posición dentro del tema (segundos). Usa cueTimeStart real si es plausible;
// si el feed está parado/sin dato, se ancla al momento en que cargó la letra.
function songPositionSec() {
  if (cueTimeStart) return (Date.now() - cueTimeStart) / 1000 - streamDelaySec;
  return (Date.now() - lyricsAnchor) / 1000; // modo demo (anclado a la carga)
}

function tickSync() {
  if (!lyricLines.length) return;

  const pos = songPositionSec();

  let idx = -1;
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].time <= pos) idx = i;
    else break;
  }

  if (idx === activeIndex) return;
  activeIndex = idx;

  const nodes = lyricsEl.querySelectorAll(".line");
  nodes.forEach((n, i) => {
    n.classList.toggle("active", i === idx);
    n.classList.toggle("past", i < idx);
  });

  if (idx >= 0 && nodes[idx]) {
    const target =
      nodes[idx].offsetTop - lyricsEl.clientHeight / 2 + nodes[idx].clientHeight / 2;
    smoothScrollTo(lyricsEl, target, 400);
  }
}

function smoothScrollTo(el, to, duration) {
  const start = el.scrollTop;
  const change = to - start;
  const t0 = Date.now();
  function step() {
    const t = Math.min(1, (Date.now() - t0) / duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
    el.scrollTop = start + change * ease;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// --- Calibración del offset con las flechas ← → (↑ ↓ = pasos de 5s) ---
function flashOffset() {
  offsetHint.textContent = "retraso " + streamDelaySec + "s";
  offsetHint.classList.add("show");
  try {
    localStorage.setItem("streamDelaySec", streamDelaySec);
  } catch (e) {}
  clearTimeout(flashOffset._t);
  flashOffset._t = setTimeout(() => offsetHint.classList.remove("show"), 2500);
}

function adjustDelay(delta) {
  streamDelaySec = Math.max(0, streamDelaySec + delta);
  flashOffset();
}

document.addEventListener("keydown", (e) => {
  const code = e.keyCode;
  if (e.key === "ArrowLeft" || code === 37) adjustDelay(1); // letra adelantada -> más retraso
  else if (e.key === "ArrowRight" || code === 39) adjustDelay(-1); // letra atrasada -> menos retraso
  else if (e.key === "ArrowUp" || code === 38) adjustDelay(5); // salto grueso
  else if (e.key === "ArrowDown" || code === 40) adjustDelay(-5);
  else return;
  e.preventDefault();
});

// --- Controles de reproducción ---
playBtn.addEventListener("click", async () => {
  if (!radio.paused) {
    radio.pause();
    return;
  }
  try {
    await radio.play();
    statusText.innerText = "Reproduciendo";
  } catch (err) {
    statusText.innerText = "Error";
    console.error("Play error:", err);
  }
});

radio.addEventListener("play", () => {
  playBtn.textContent = "⏸ Pause";
  startMetadataPolling();
  if (lyricLines.length) startSync();
});

radio.addEventListener("pause", () => {
  playBtn.textContent = "▶ Play";
  statusText.innerText = "Detenido";
  stopMetadataPolling();
  stopSync();
});

radio.addEventListener("playing", () => {
  statusText.innerText = "Reproduciendo";
});

radio.addEventListener("error", () => {
  const codes = {
    1: "abortado",
    2: "error de red",
    3: "error de decodificación",
    4: "formato no soportado"
  };
  const code = radio.error ? radio.error.code : 0;
  statusText.innerText = "Error de stream (" + (codes[code] || code) + ")";
  console.error("Audio error:", radio.error);
});

radio.addEventListener("stalled", () => {
  statusText.innerText = "Reconectando...";
});

radio.addEventListener("waiting", () => {
  statusText.innerText = "Buffering...";
});
