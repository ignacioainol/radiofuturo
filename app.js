const radio = document.getElementById("radio");
const statusText = document.getElementById("status");
const playBtn = document.getElementById("playBtn");

const STREAM_URL =
  "https://26663.live.streamtheworld.com/FUTURO_SC";

radio.src = STREAM_URL;

playBtn.addEventListener("click", async () => {
  try {
    await radio.play();
    statusText.innerText = "Reproduciendo";
  } catch (err) {
    statusText.innerText = "Error";
    console.error(err);
  }
});

radio.addEventListener("error", () => {
  statusText.innerText = "Error de stream";
});

radio.addEventListener("stalled", () => {
  statusText.innerText = "Reconectando...";
  reconnect();
});

radio.addEventListener("waiting", () => {
  statusText.innerText = "Buffering...";
});

function reconnect() {
  radio.pause();

  setTimeout(() => {
    radio.src = STREAM_URL + "?t=" + Date.now();
    radio.load();

    radio.play().catch(console.error);
  }, 3000);
}