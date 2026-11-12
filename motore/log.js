import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "log.txt");

export function log(messaggio) {
  const riga = `[${new Date().toLocaleString("it-IT")}] ${messaggio}`;
  console.log(riga);
  try {
    if (fs.existsSync(FILE) && fs.statSync(FILE).size > 1e6) fs.renameSync(FILE, FILE + ".vecchio");
    fs.appendFileSync(FILE, riga + "\n");
  } catch {
    /* il log non deve mai fermare il motore */
  }
}
