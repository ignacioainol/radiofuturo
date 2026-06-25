const radio = document.getElementById("radio");
const statusText = document.getElementById("status");
const playBtn = document.getElementById("playBtn");
const nowPlayingText = document.getElementById("nowPlaying");

const STREAM_URL = "https://26663.live.streamtheworld.com/FUTURO_SC";
const METADATA_URL = "http://localhost:3001/metadata";

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

radio.addEventListener("error", () => {
  statusText.innerText = "Error de stream";
});

radio.addEventListener("stalled", () => {
  statusText.innerText = "Reconectando...";
});

radio.addEventListener("waiting", () => {
  statusText.innerText = "Buffering...";
});
