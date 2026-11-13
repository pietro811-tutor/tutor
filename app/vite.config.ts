import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Solo in sviluppo: l'app legge e scrive la cartella ../dati invece di GitHub,
// cosi' si puo' provare tutto sul PC insieme al motore.
function archivioLocale(): Plugin {
  const radice = path.resolve(__dirname, process.env.TUTOR_DATI ?? "../dati");
  const dentro = (p: string) => {
    const pieno = path.resolve(radice, p);
    if (!pieno.startsWith(radice + path.sep)) throw new Error("percorso non valido");
    return pieno;
  };
  const elenca = (dir: string, out: { path: string; sha: string; size: number }[]) => {
    if (!fs.existsSync(dir)) return;
    for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
      if (voce.name.startsWith(".")) continue;
      const pieno = path.join(dir, voce.name);
      if (voce.isDirectory()) elenca(pieno, out);
      else {
        const dati = fs.readFileSync(pieno);
        out.push({
          path: path.relative(radice, pieno).split(path.sep).join("/"),
          sha: crypto.createHash("sha1").update(dati).digest("hex"),
          size: dati.length,
        });
      }
    }
  };
  return {
    name: "archivio-locale",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/dev-archivio", (req, res) => {
        try {
          const url = new URL(req.url ?? "", "http://x");
          const p = url.searchParams.get("path");
          if (req.method === "GET" && !p) {
            const out: { path: string; sha: string; size: number }[] = [];
            elenca(radice, out);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(out));
          } else if (req.method === "GET" && p) {
            const f = dentro(p);
            if (!fs.existsSync(f)) {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.end(fs.readFileSync(f));
          } else if (req.method === "PUT" && p) {
            const pezzi: Buffer[] = [];
            req.on("data", (c) => pezzi.push(c));
            req.on("end", () => {
              const f = dentro(p);
              fs.mkdirSync(path.dirname(f), { recursive: true });
              fs.writeFileSync(f, Buffer.from(Buffer.concat(pezzi).toString("utf8"), "base64"));
              res.end("ok");
            });
          } else {
            res.statusCode = 400;
            res.end();
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/tutor/" : "/",
  plugins: [
    react(),
    archivioLocale(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icona.svg"],
      manifest: {
        name: "Tutor - Virgilio",
        short_name: "Tutor",
        description: "Virgilio, il tuo tutor per gli esami",
        lang: "it",
        theme_color: "#2f6b4f",
        background_color: "#fbf6ee",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icona-192.png", sizes: "192x192", type: "image/png" },
          { src: "icona-512.png", sizes: "512x512", type: "image/png" },
          { src: "icona-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        // la versione nuova prende il posto della vecchia da sola, senza dover aggiornare la pagina a mano
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
