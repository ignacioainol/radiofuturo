const express = require("express");
const https = require("https");

const app = express();

// CORS para todas las rutas
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Icy-Metadata, Range, Content-Type");
  res.header("Access-Control-Expose-Headers", "Icy-MetaInt, Icy-Br, Icy-Description, Icy-Genre, Icy-Name, Icy-Url");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => {
  res.json({ status: "ok", endpoints: ["/metadata", "/stream/:path"] });
});

// Mount de Radio Futuro en la API Now Playing de Triton (la misma fuente que
// usa la web oficial). Más fiable que leer los metadatos ICY del audio, que
// a veces no incrustan el StreamTitle.
const MOUNT = process.env.MOUNT || "FUTURO";

app.get("/metadata", (req, res) => {
  const apiUrl = `https://np.tritondigital.com/public/nowplaying?mountName=${MOUNT}&numberToFetch=1&eventType=track`;

  const apiReq = https.get(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, (apiRes) => {
    let xml = "";
    apiRes.on("data", (chunk) => (xml += chunk));
    apiRes.on("end", () => {
      // Extrae un <property name="..."><![CDATA[...]]></property> del XML
      const pick = (name) => {
        const m = xml.match(new RegExp(`name="${name}"><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`));
        return m ? m[1].trim() : "";
      };

      const song = pick("cue_title");
      const artist = pick("track_artist_name");
      const cover = pick("track_cover_url");
      const title = [artist, song].filter(Boolean).join(" - ");

      if (!res.headersSent) {
        res.json({ title: title || "Sin metadatos", artist, song, cover });
      }
    });
  });

  apiReq.on("error", (err) => {
    console.error("Error consultando Now Playing:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Metadata error" });
    }
  });

  req.on("close", () => apiReq.destroy());
});

app.get("/stream/:path", (req, res) => {
  const targetUrl = `https://26663.live.streamtheworld.com/${req.params.path}`;
  console.log(`Proxying: ${targetUrl}`);

  const options = {
    headers: {
      "Icy-Metadata": "1",
      "User-Agent": "Mozilla/5.0",
      ...(req.headers.range && { "Range": req.headers.range })
    }
  };

  const proxyReq = https.get(targetUrl, options, (proxyRes) => {
    console.log("Stream response status:", proxyRes.statusCode);
    console.log("Stream headers:", proxyRes.headers);

    // Pasar todos los headers del stream al cliente, especialmente los ICY
    Object.keys(proxyRes.headers).forEach((key) => {
      if (key.toLowerCase().startsWith("icy-") || key.toLowerCase() === "content-type") {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });

    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);

    proxyRes.on("error", (err) => {
      if (err.message !== "aborted") {
        console.error("Error en respuesta del stream:", err.message);
      }
    });
  });

  proxyReq.on("error", (err) => {
    console.error("Error en request al stream:", err.message);
    if (!res.headersSent) {
      res.status(500).send("Proxy error");
    }
  });

  // Si el cliente cierra la conexión, cerrar el stream también
  req.on("close", () => {
    proxyReq.destroy();
  });
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`✓ Proxy corriendo en http://localhost:${PORT}`);
  console.log(`✓ Usa: http://localhost:${PORT}/stream/FUTURO_SC`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`✗ Puerto ${PORT} ya está en uso. Intenta con otro puerto.`);
  } else {
    console.error(`✗ Error del servidor:`, err.message);
  }
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("✗ Error no capturado:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("✗ Promise rechazada:", reason);
});