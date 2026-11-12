// Tiene la cartella dati del PC allineata con l'archivio privato su GitHub.
// In modalita' "locale" (prove sul PC) non usa GitHub.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

const QUI = path.dirname(fileURLToPath(import.meta.url));

const esegui = promisify(execFile);

export function creaArchivio(config, radice) {
  if (config.modalita === "locale") {
    return { radice, aggiorna: async () => true, pubblica: async () => {} };
  }

  // L'accesso a GitHub di Tutor sta in una cartella a parte: non usa mai l'account GitHub attivo sul PC.
  const ambienteGh = { ...process.env };
  if (config.gh_config) ambienteGh.GH_CONFIG_DIR = path.resolve(QUI, config.gh_config);

  const git = async (...args) => {
    const chiave = Buffer.from(`x-access-token:${await leggiToken()}`).toString("base64");
    const prefisso = ["-c", "credential.helper=", "-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${chiave}`];
    return esegui("git", [...prefisso, ...args], { cwd: radice, windowsHide: true, maxBuffer: 50e6 });
  };
  let token = null;
  let etag = null;
  let coda = Promise.resolve();

  async function leggiToken() {
    if (!token) token = (await esegui("gh", ["auth", "token"], { windowsHide: true, env: ambienteGh })).stdout.trim();
    return token;
  }

  /** Scarica le novita' solo se su GitHub e' cambiato qualcosa (controllo leggero). */
  async function aggiorna() {
    try {
      const r = await fetch(`https://api.github.com/repos/${config.repo}/commits/main`, {
        headers: {
          Authorization: `Bearer ${await leggiToken()}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(etag ? { "If-None-Match": etag } : {}),
        },
      });
      if (r.status === 304) return false;
      if (!r.ok) {
        log(`GitHub risponde ${r.status}`);
        return false;
      }
      etag = r.headers.get("etag");
      await serializza(() => git("pull", "--rebase", "--autostash", "-q"));
      return true;
    } catch (e) {
      log(`Non riesco ad aggiornare: ${e.message}`);
      return false;
    }
  }

  // una pubblicazione alla volta
  function serializza(fn) {
    const giro = coda.then(fn, fn);
    coda = giro.catch(() => {});
    return giro;
  }

  async function pubblica(messaggio) {
    return serializza(async () => {
      await git("add", "-A");
      const { stdout } = await git("status", "--porcelain");
      if (!stdout.trim()) return;
      await git("commit", "-q", "-m", messaggio);
      for (let tentativo = 1; tentativo <= 4; tentativo++) {
        try {
          await git("push", "-q");
          return;
        } catch {
          await git("pull", "--rebase", "--autostash", "-q").catch(() => {});
        }
      }
      log("Non riesco a pubblicare, riprovo al prossimo giro");
    });
  }

  return { radice, aggiorna, pubblica };
}
