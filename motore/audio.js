// Gli audio delle schede: il PC legge la "pillola" di ogni scheda con una voce italiana gratuita (Kokoro)
// e la salva come mp3 in esami/<materia>/audio/. Non usa Claude: costa solo un po' di PC.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { leggiJson, scriviJson, percorsi } from "./compiti.js";
import { log } from "./log.js";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const VOCI = path.resolve(QUI, "..", "voci");
const PYTHON = path.join(VOCI, "ve", "Scripts", "python.exe");
const elenco = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []);

/** Toglie il "trucco" grafico del testo (markdown, frecce) perché la voce lo legga bene. */
export function perLaVoce(t = "") {
  return String(t)
    .replace(/[#*_`>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*[→⇒]\s*/g, ", ")
    .replace(/\s*\/\s*/g, " o ")
    .replace(/\(([^)]{0,80})\)/g, ", $1, ")
    .replace(/\s+/g, " ")
    .trim();
}

export function disponibile() {
  return fs.existsSync(PYTHON) && fs.existsSync(path.join(VOCI, "modelli", "kokoro-v1.0.onnx"));
}

/** Le schede che non hanno ancora l'audio (o hanno l'audio di una versione vecchia). */
export function audioMancanti(radice, esame, voce, velocita) {
  const p = percorsi(radice, esame.slug);
  const dirAudio = path.join(radice, "esami", esame.slug, "audio");
  const lavori = [];
  for (const f of elenco(p.schede).filter((f) => f.endsWith(".json"))) {
    const s = leggiJson(path.join(p.schede, f));
    if (!s?.id || !(s.pillola || s.semplice)) continue;
    const meta = leggiJson(path.join(dirAudio, `${s.id}.json`));
    const mp3 = path.join(dirAudio, `${s.id}.mp3`);
    if (meta?.aggiornata === s.aggiornata && meta?.voce === voce && meta?.velocita === velocita && fs.existsSync(mp3)) continue;
    lavori.push({ id: s.id, aggiornata: s.aggiornata, testo: `${perLaVoce(s.titolo)}.
[pausa]
${perLaVoce(s.pillola || s.semplice)}`, out: mp3, meta: path.join(dirAudio, `${s.id}.json`) });
  }
  return lavori;
}

/** Genera gli audio di una lista di lavori. Ritorna quanti ne ha fatti. */
export function generaAudio(lavori, voce, velocita) {
  return new Promise((ok, no) => {
    const file = path.join(VOCI, "lavori.tmp.json");
    fs.writeFileSync(file, JSON.stringify(lavori.map(({ testo, out }) => ({ testo, out }))), "utf8");
    const proc = spawn(PYTHON, ["-I", path.join(VOCI, "genera.py"), file, voce, String(velocita)], { cwd: VOCI, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let fatti = 0;
    let errori = "";
    proc.stdout.on("data", (d) => {
      for (const riga of String(d).split(/\r?\n/).filter(Boolean)) {
        const l = lavori.find((x) => riga.endsWith(x.out) || riga === `fatto ${x.out}`);
        if (l && riga.startsWith("fatto")) {
          scriviJson(l.meta, { id: l.id, aggiornata: l.aggiornata, voce, velocita, creato: new Date().toISOString() });
          fatti++;
        }
      }
    });
    proc.stderr.on("data", (d) => (errori += d));
    proc.on("close", (codice) => {
      fs.rmSync(file, { force: true });
      if (codice !== 0 && fatti === 0) no(new Error(errori.slice(-300) || `genera.py codice ${codice}`));
      else ok(fatti);
    });
  });
}
