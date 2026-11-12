// Chiede le cose a Claude Code in modalita' automatica ("claude -p").
// Usa il login dell'abbonamento Pro gia' presente sul PC: nessun costo extra.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

const QUI = path.dirname(fileURLToPath(import.meta.url));

/** Ambiente pulito: niente variabili prese da altre sessioni, e un accesso a Claude tutto per Tutor. */
function ambiente(config) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE_|CLAUDECODE)/i.test(k)));
  if (config.claude_config) env.CLAUDE_CONFIG_DIR = path.resolve(QUI, config.claude_config);
  return env;
}

export class ErroreClaude extends Error {
  constructor(messaggio, { limite = false } = {}) {
    super(messaggio);
    this.limite = limite;
  }
}

// Con l'abbonamento Pro, quando la quota è finita Claude Code risponde "Credit balance is too low".
const SEMBRA_LIMITE = /not logged in|please run \/login|credit balance|usage limit|rate limit|limit reached|limit will reset|too many requests|overloaded|429|529/i;

function chiamaUnaVolta({ config, prompt, modello, strumenti, cwd, maxTurni, timeoutMs }) {
  const args = [
    "-p",
    "--model",
    modello,
    "--output-format",
    "json",
    "--max-turns",
    String(maxTurni),
    "--allowedTools",
    strumenti.join(","),
    "--disallowedTools",
    "Bash,Edit,Write,NotebookEdit",
  ];
  return new Promise((ok, ko) => {
    const proc = spawn("claude", args, { cwd, shell: true, windowsHide: true, env: ambiente(config) });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      proc.kill();
      ko(new ErroreClaude("Tempo scaduto"));
    }, timeoutMs);
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", (e) => {
      clearTimeout(timer);
      ko(new ErroreClaude(`Non riesco ad avviare Claude Code: ${e.message}`));
    });
    proc.on("close", () => {
      clearTimeout(timer);
      let dati;
      try {
        dati = JSON.parse(out);
      } catch {
        const testo = (err || out).slice(0, 500);
        return ko(new ErroreClaude(`Risposta non leggibile: ${testo}`, { limite: SEMBRA_LIMITE.test(testo) }));
      }
      if (dati.is_error || dati.subtype !== "success") {
        const testo = String(dati.result ?? dati.subtype ?? "errore");
        return ko(new ErroreClaude(testo.slice(0, 500), { limite: SEMBRA_LIMITE.test(testo) }));
      }
      ok(String(dati.result ?? ""));
    });
    proc.stdin.end(prompt);
  });
}

/**
 * modello: "veloce" (Sonnet) o "profondo" (Opus). Se Opus non e' disponibile, ripiega su Sonnet.
 */
export async function chiediClaude(config, { prompt, modello = "veloce", strumenti = ["Read", "Glob", "Grep"], cwd, maxTurni = 40, timeoutMs = 25 * 60000 }) {
  const nome = config.modelli[modello] ?? modello;
  try {
    return await chiamaUnaVolta({ config, prompt, modello: nome, strumenti, cwd, maxTurni, timeoutMs });
  } catch (e) {
    if (modello === "profondo" && !e.limite && /model|not available|access/i.test(e.message)) {
      log(`Opus non disponibile (${e.message.slice(0, 80)}), uso Sonnet`);
      return chiamaUnaVolta({ config, prompt, modello: config.modelli.veloce, strumenti, cwd, maxTurni, timeoutMs });
    }
    throw e;
  }
}

export function estraiJson(testo) {
  const pulito = testo.replace(/```(?:json)?/g, "");
  const inizio = pulito.indexOf("{");
  const fine = pulito.lastIndexOf("}");
  if (inizio < 0 || fine <= inizio) throw new Error("Nessun JSON nella risposta");
  return JSON.parse(pulito.slice(inizio, fine + 1));
}

/** Come chiediClaude, ma vuole un JSON valido; se non lo e', riprova una volta spiegando l'errore. */
export async function chiediJson(config, opzioni, controlla = () => null) {
  let prompt = opzioni.prompt;
  for (let tentativo = 1; tentativo <= 2; tentativo++) {
    const testo = await chiediClaude(config, { ...opzioni, prompt });
    try {
      const obj = estraiJson(testo);
      const problema = controlla(obj);
      if (!problema) return obj;
      throw new Error(problema);
    } catch (e) {
      if (e instanceof ErroreClaude) throw e;
      log(`JSON non valido (tentativo ${tentativo}): ${e.message}`);
      prompt = `${opzioni.prompt}\n\nATTENZIONE: la risposta precedente non andava bene (${e.message}). Rispondi SOLO con il JSON richiesto, completo e valido.`;
    }
  }
  throw new Error("Claude non ha restituito un JSON valido");
}
