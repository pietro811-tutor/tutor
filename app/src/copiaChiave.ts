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

// ---- diagnosi: se la chiave sparisce, qui si vede cosa il browser ha tenuto e cosa no ----
async function idbMetti(chiave: string, valore: unknown): Promise<void> {
  try {
    const db = await apri();
    await new Promise<void>((ok, no) => {
      const t = db.transaction(ARCHIVIO, "readwrite");
      t.objectStore(ARCHIVIO).put(valore, chiave);
      t.oncomplete = () => ok();
      t.onerror = () => no(t.error);
    });
    db.close();
  } catch {
    /* pazienza */
  }
}
async function idbDai<T>(chiave: string): Promise<T | null> {
  try {
    const db = await apri();
    const v = await new Promise<T | null>((ok, no) => {
      const r = db.transaction(ARCHIVIO).objectStore(ARCHIVIO).get(chiave);
      r.onsuccess = () => ok((r.result as T) ?? null);
      r.onerror = () => no(r.error);
    });
    db.close();
    return v;
  } catch {
    return null;
  }
}

const CHIAVE_AVVIO = "tutor:avvio";
const inApp = () => window.matchMedia?.("(display-mode: standalone)").matches ?? false;

/** Segna che l'app si e' aperta con la chiave a posto (in due posti diversi). */
export function segnaAvvio() {
  const v = { t: Date.now(), app: inApp() };
  try {
    localStorage.setItem(CHIAVE_AVVIO, JSON.stringify(v));
  } catch {
    /* pazienza */
  }
  void idbMetti("avvio", v);
}

const quandoFa = (v: { t: number; app: boolean } | null) => {
  if (!v) return "mai visto";
  const min = Math.round((Date.now() - v.t) / 60000);
  const fa = min < 90 ? `${min} min fa` : min < 2880 ? `${Math.round(min / 60)} ore fa` : `${Math.round(min / 1440)} giorni fa`;
  return `${fa} (${v.app ? "app installata" : "pagina del browser"})`;
};

/** Righe di testo da mostrare quando la chiave non si trova: servono a capire perche'. */
export async function diagnosi(): Promise<string[]> {
  const righe: string[] = [];
  let lsOk = false;
  try {
    localStorage.setItem("tutor:prova", "1");
    lsOk = localStorage.getItem("tutor:prova") === "1";
    localStorage.removeItem("tutor:prova");
  } catch {
    /* non disponibile */
  }
  righe.push(`Memoria del sito: ${lsOk ? "ok" : "NON disponibile"}`);
  let voci = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith("tutor:")) voci++;
  } catch {
    /* pazienza */
  }
  righe.push(`Dati dell'app trovati: ${voci}`);
  let avvioLocale: { t: number; app: boolean } | null = null;
  try {
    avvioLocale = JSON.parse(localStorage.getItem(CHIAVE_AVVIO) ?? "null");
  } catch {
    /* pazienza */
  }
  righe.push(`Ultimo avvio riuscito (memoria del sito): ${quandoFa(avvioLocale)}`);
  righe.push(`Ultimo avvio riuscito (copia nascosta): ${quandoFa(await idbDai("avvio"))}`);
  righe.push(`Copia nascosta della chiave: ${(await leggiCopia()) ? "c'è" : "non c'è"}`);
  try {
    righe.push(`Il browser protegge i dati: ${(await navigator.storage?.persisted?.()) ? "sì" : "no"}`);
  } catch {
    /* pazienza */
  }
  righe.push(`Aperta come: ${inApp() ? "app installata" : "pagina del browser"}`);
  righe.push(`Ora: ${new Date().toLocaleString("it-IT")}`);
  return righe;
}

// ---- gestore password del telefono (Brave / Chrome): salva la chiave e la rimette con impronta o PIN ----
type PC = { id: string; password?: string };
const cred = () => (navigator as unknown as { credentials?: CredentialsContainer }).credentials;

export async function ricordaPassword(c: Config): Promise<void> {
  try {
    const PasswordCredentialCtor = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => Credential }).PasswordCredential;
    if (PasswordCredentialCtor && cred()) await cred()!.store(new PasswordCredentialCtor({ id: c.repo, password: c.token, name: "Virgilio" }));
  } catch {
    /* pazienza: ci pensa il modulo di accesso */
  }
}

/** Chiede al telefono la password salvata. silenziosa = senza finestre, all'avvio. */
export async function passwordSalvata(chiediSeServe: boolean): Promise<Config | null> {
  try {
    const opzioni = { password: true, mediation: chiediSeServe ? "optional" : "silent" } as unknown as CredentialRequestOptions;
    const r = (await cred()?.get(opzioni)) as unknown as PC | null | undefined;
    return r?.password && r.id ? { token: r.password, repo: r.id } : null;
  } catch {
    return null;
  }
}
