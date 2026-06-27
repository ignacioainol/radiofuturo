const radio = document.getElementById("radio");
const statusText = document.getElementById("status");
const playBtn = document.getElementById("playBtn");
const nowPlayingText = document.getElementById("nowPlaying");

// URL con redirect oficial: siempre resuelve a un servidor vivo, en vez de
// fijar un edge concreto (que StreamTheWorld rota y provoca "Reconectando...").
const STREAM_URL =
  "https://playerservices.streamtheworld.com/api/livestream-redirect/FUTURO_SC.mp3";

// En desarrollo local (npx serve) usamos el proxy local; en la TV / empaquetado
// usamos el proxy desplegado en Render.
const isLocal =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";
const METADATA_URL = isLocal
  ? "http://localhost:3001/metadata"
  : "https://futuro-radio-proxy.onrender.com/metadata";

radio.src = STREAM_URL;

let metadataTimer = null;

async function updateNowPlaying() {
  try {
    const res = await fetch(METADATA_URL);
    const data = await res.json();
    if (data.title) {
      nowPlayingText.innerText = "Ahora suena: " + data.title;
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
});

radio.addEventListener("pause", () => {
  playBtn.textContent = "▶ Play";
  statusText.innerText = "Detenido";
  stopMetadataPolling();
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
