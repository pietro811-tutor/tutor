// Seconda copia della chiave di accesso in IndexedDB: se il browser svuota il localStorage
// (succede con alcune impostazioni di pulizia) la chiave si ripristina da qui.
import type { Config } from "./stato";

const DB = "tutor-chiave";
const ARCHIVIO = "k";

function apri(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ARCHIVIO);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

export async function salvaCopia(c: Config | null): Promise<void> {
  try {
    const db = await apri();
    await new Promise<void>((ok, no) => {
      const t = db.transaction(ARCHIVIO, "readwrite");
      if (c) t.objectStore(ARCHIVIO).put(c, "config");
      else t.objectStore(ARCHIVIO).delete("config");
      t.oncomplete = () => ok();
      t.onerror = () => no(t.error);
    });
    db.close();
  } catch {
    /* pazienza */
  }
}

export async function leggiCopia(): Promise<Config | null> {
  try {
    const db = await apri();
    const c = await new Promise<Config | null>((ok, no) => {
      const r = db.transaction(ARCHIVIO).objectStore(ARCHIVIO).get("config");
      r.onsuccess = () => ok((r.result as Config) ?? null);
      r.onerror = () => no(r.error);
    });
    db.close();
    return c?.token && c?.repo ? c : null;
  } catch {
    return null;
  }
}
