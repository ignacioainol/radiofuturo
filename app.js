const radio = document.getElementById("radio");
const statusText = document.getElementById("status");
const playBtn = document.getElementById("playBtn");
const nowPlayingText = document.getElementById("nowPlaying");
const lyricsEl = document.getElementById("lyrics");
const offsetHint = document.getElementById("offsetHint");

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

// Retardo del stream: lo que oyes va unos segundos por detrás de la emisora.
// Se calibra en vivo con las flechas ← → del control.
let streamDelaySec = 8;

// --- Metadatos (título + cueTimeStart) ---
async function updateNowPlaying() {
  try {
    const res = await fetch(METADATA_URL);
    const data = await res.json();

    if (data.title) {
      nowPlayingText.innerText = "Ahora suena: " + data.title;
    }
    cueTimeStart = data.cueTimeStart || null;

    const key = (data.artist || "") + " - " + (data.song || "");
    if (data.song && key !== currentSongKey) {
      currentSongKey = key;
      loadLyrics(data.artist || "", data.song || "");
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
      encodeURIComponent(song);
    const res = await fetch(url);
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

function tickSync() {
  if (!cueTimeStart || !lyricLines.length) return;

  const pos = (Date.now() - cueTimeStart) / 1000 - streamDelaySec;

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

// --- Calibración del offset con las flechas ← → del control ---
function flashOffset() {
  offsetHint.textContent = "offset " + streamDelaySec + "s";
  offsetHint.classList.add("show");
  clearTimeout(flashOffset._t);
  flashOffset._t = setTimeout(() => offsetHint.classList.remove("show"), 1500);
}

document.addEventListener("keydown", (e) => {
  const code = e.keyCode;
  if (e.key === "ArrowLeft" || code === 37) {
    streamDelaySec += 1; // letra adelantada -> más retraso
    flashOffset();
  } else if (e.key === "ArrowRight" || code === 39) {
    streamDelaySec = Math.max(0, streamDelaySec - 1); // letra atrasada -> menos retraso
    flashOffset();
  }
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
