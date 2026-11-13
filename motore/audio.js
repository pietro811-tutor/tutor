// Gli audio delle schede: il PC legge le parti di ogni scheda (riassunto, schema, dettaglio) con una voce italiana
// gratuita (Kokoro) e le salva come mp3 in esami/<materia>/audio/. Non usa Claude: usa la scheda video (o il processore).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { leggiJson, scriviJson, percorsi } from "./compiti.js";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const VOCI = path.resolve(QUI, "..", "voci");
const PYTHON_GPU = path.join(VOCI, "ve-gpu", "Scripts", "python.exe");
const PYTHON_CPU = path.join(VOCI, "ve", "Scripts", "python.exe");
const PYTHON = fs.existsSync(PYTHON_GPU) ? PYTHON_GPU : PYTHON_CPU;
const PYTHON_CB = path.join(VOCI, "ve-cb", "Scripts", "python.exe");
const PYTHON_EDGE = path.join(VOCI, "ve-edge", "Scripts", "python.exe");
const ESEGUI = (voce) => (voce === "elsa" ? { python: PYTHON_EDGE, script: "genera_edge.py" } : voce === "chatterbox" ? { python: PYTHON_CB, script: "genera_cb.py" } : { python: PYTHON, script: "genera.py" });
const elenco = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []);

/** Toglie il "trucco" grafico del testo (markdown, frecce) perché la voce lo legga bene. */
export function perLaVoce(t = "") {
  return String(t)
    .replace(/[#*_`>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s*[→⇒]\s*/g, ", ")
    .replace(/\s*\/\s*/g, " o ")
    .replace(/\(([^)]{0,80})\)/g, ", $1, ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Testo lungo a righe: ogni riga diventa una frase, i titoli finiscono con il punto. */
function perLaVoceRighe(t = "") {
  return String(t)
    .split(/\n+/)
    .map((r) => perLaVoce(r))
    .filter((r) => /\w/.test(r))
    .map((r) => (/[.!?:;]$/.test(r) ? r : r + "."))
    .join("\n[pausa]\n");
}

export function disponibile(voce = "") {
  if (voce === "elsa") return fs.existsSync(PYTHON_EDGE);
  if (voce === "chatterbox") return fs.existsSync(PYTHON_CB);
  return fs.existsSync(PYTHON) && fs.existsSync(path.join(VOCI, "modelli", "kokoro-v1.0.onnx"));
}

/** Le parti di una scheda che si possono leggere: [{ suffisso, testo }]. */
function partiDellaScheda(s) {
  const parti = [];
  const titolo = perLaVoce(s.titolo);
  // niente audio del riassunto ("pillola"): lo studente non lo vuole
  if (Array.isArray(s.schema) && s.schema.length) {
    const voci = s.schema.map((x) => perLaVoce(`${x.voce}: ${x.testo}`)).join("\n[pausa]\n");
    parti.push({ suffisso: "--schema", testo: `${titolo}. Lo schema.\n[pausa]\n${voci}` });
  }
  if (s.dettaglio) parti.push({ suffisso: "--dettaglio", testo: `${titolo}. Il dettaglio.\n[pausa]\n${perLaVoceRighe(s.dettaglio)}` });
  return parti;
}

/** Gli audio che mancano (o sono di una versione vecchia della scheda / con altra voce o velocità). */
export function audioMancanti(radice, esame, voce, velocita) {
  const p = percorsi(radice, esame.slug);
  const dirAudio = path.join(radice, "esami", esame.slug, "audio");
  const lavori = [];
  for (const f of elenco(p.schede).filter((f) => f.endsWith(".json"))) {
    const s = leggiJson(path.join(p.schede, f));
    if (!s?.id) continue;
    for (const parte of partiDellaScheda(s)) {
      const nome = `${s.id}${parte.suffisso}.${voce}`;
      const meta = leggiJson(path.join(dirAudio, `${nome}.json`));
      const mp3 = path.join(dirAudio, `${nome}.mp3`);
      if (meta?.aggiornata === s.aggiornata && meta?.voce === voce && meta?.velocita === velocita && fs.existsSync(mp3) && fs.existsSync(mp3.replace(/.mp3$/, ".tempi.json"))) continue;
      lavori.push({ id: s.id + parte.suffisso, aggiornata: s.aggiornata, testo: parte.testo, out: mp3, meta: path.join(dirAudio, `${nome}.json`) });
    }
  }
  const tipo = (l) => (l.id.endsWith("--dettaglio") ? 2 : l.id.endsWith("--schema") ? 1 : 0);
  return lavori.map((l, i) => ({ l, i })).sort((a, b) => tipo(a.l) - tipo(b.l) || a.i - b.i).map((x) => x.l);
}

/** Genera gli audio di una lista di lavori. Ritorna quanti ne ha fatti. */
export function generaAudio(lavori, voce, velocita) {
  return new Promise((ok, no) => {
    const file = path.join(VOCI, "lavori.tmp.json");
    fs.writeFileSync(file, JSON.stringify(lavori.map(({ testo, out }) => ({ testo, out }))), "utf8");
    const { python, script } = ESEGUI(voce);
    const proc = spawn(python, ["-I", path.join(VOCI, script), file, voce, String(velocita)], { cwd: VOCI, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let fatti = 0;
    let errori = "";
    proc.stdout.on("data", (d) => {
      for (const riga of String(d).split(/\r?\n/).filter(Boolean)) {
        if (riga.startsWith("motore:")) continue;
        const l = lavori.find((x) => riga === `fatto ${x.out}`);
        if (l) {
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
