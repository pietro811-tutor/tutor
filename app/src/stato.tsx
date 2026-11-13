import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArchivioGitHub, ArchivioLocale, fileInBase64, testoInBase64, type Archivio, type VoceAlbero } from "./archivio";
import { domandaConGemini, leggiChiaveGemini, pennaConGemini, valutaConGemini } from "./gemini";
import type {
  Esame,
  Lezione,
  ProgrammaUfficiale,
  Copertura,
  StatoMotore,
  MaterialeMeta,
  Programma,
  Progressi,
  Richiesta,
  Risposta,
  Scheda,
  TipoRichiesta,
} from "./tipi";

// ---------- configurazione e cache sul telefono ----------

export interface Config {
  token: string;
  repo: string;
}

import { salvaCopia } from "./copiaChiave";
import type { FraseTempo } from "./evidenzia";

const CHIAVE_CONFIG = "tutor:config";
const CHIAVE_CACHE = "tutor:cache";
const CHIAVE_PROGRESSI = "tutor:progressi";
const CHIAVE_MATERIA = "tutor:materia"; // la materia scelta: si riapre sempre quella
const CHIAVE_INPUT = "tutor:input-richieste"; // per poter chiedere a Gemini se il PC e' spento

/** Dopo quanto, senza segni dal PC, si chiede a Gemini. */
export const ATTESA_PC_MS = 30000;

function leggiLocale<T>(chiave: string): T | null {
  try {
    const v = localStorage.getItem(chiave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function scriviLocale(chiave: string, valore: unknown) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    /* memoria piena: pazienza, si rilegge dall'archivio */
  }
}

export const leggiConfig = () => leggiLocale<Config>(CHIAVE_CONFIG);
export const salvaConfig = (c: Config | null) => {
  void salvaCopia(c);
  if (c) scriviLocale(CHIAVE_CONFIG, c);
  else localStorage.removeItem(CHIAVE_CONFIG);
};

function creaArchivio(config: Config | null): Archivio | null {
  if (config) return new ArchivioGitHub(config.token, config.repo);
  if (import.meta.env.DEV) return new ArchivioLocale();
  return null;
}

export const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const oggi = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-GG

function progressiVuoti(): Progressi {
  return { aggiornato: "", nome: "", argomenti: {}, carte: {}, checkin: {}, giorni_studio: [], richieste: [] };
}

// ---------- stato dell'app ----------

export interface StatoMateriale {
  stato: "letto" | "errore";
  titolo?: string;
  avvisi?: string[];
  errore?: string;
}

export interface MaterialeVisto extends MaterialeMeta {
  stato: "attesa" | "letto" | "errore";
  titolo?: string;
  avvisi?: string[];
}

interface Dati {
  pronto: boolean;
  errore?: string;
  sincronizzando: boolean;
  esame?: Esame; // la materia che stai studiando adesso
  esami: Esame[]; // tutte le tue materie
  inPausa: boolean; // pausa decisa da te: il PC non fa lavori nuovi
  motore?: StatoMotore;
  programma?: Programma;
  schede: Record<string, Scheda>;
  materiali: MaterialeVisto[];
  risposte: Record<string, Risposta>;
  progressi: Progressi;
  audio: Record<string, Record<string, string>>; // audio pronti: scheda -> voce -> versione
  lezioni: Record<string, Lezione>; // i piani delle lezioni guidate
  sillabo?: ProgrammaUfficiale; // il programma ufficiale dell'esame, incollato da te
  copertura?: Copertura; // cosa copri e cosa manca rispetto al programma ufficiale
}

interface Azioni {
  /** L'audio della scheda (scaricato una volta, poi resta sul telefono). Ritorna un indirizzo da dare a <audio>. */
  caricaAudio(id: string, voce: string): Promise<string | null>;
  /** Quando comincia ogni frase dell'audio (per evidenziarla mentre la voce la legge). */
  caricaTempi(id: string, voce: string): Promise<FraseTempo[] | null>;
  sincronizza(): Promise<void>;
  aggiornaProgressi(fn: (p: Progressi) => void): void;
  inviaRichiesta(tipo: TipoRichiesta, input: Record<string, unknown>, extra?: { argomento?: string; testo?: string }): Promise<string>;
  caricaFile(file: Blob, nome: string, tipo: MaterialeMeta["tipo"], gruppo?: string): Promise<void>;
  salvaEsame(e: Esame): Promise<void>;
  salvaSillabo(testo: string): Promise<void>;
  scegliMateria(slug: string): void;
  impostaPausa(attiva: boolean): Promise<void>;
  cambiaStelle(argomento: string, stelle: 1 | 2 | 3 | null): void; // null = torna a quelle di Virgilio
  creaMateria(nome: string, tipo: Esame["tipo"], data?: string): Promise<string>;
  aspettaRisposta(id: string, ogniMs?: number): () => void;
}

const Contesto = createContext<(Dati & Azioni) | null>(null);

export function useDati() {
  const c = useContext(Contesto);
  if (!c) throw new Error("useDati fuori da ProviderDati");
  return c;
}

export function ProviderDati({ config, children }: { config: Config | null; children: ReactNode }) {
  const archivio = useMemo(() => creaArchivio(config), [config]);
  const [dati, setDati] = useState<Dati>(() => ({
    pronto: false,
    sincronizzando: false,
    esami: [],
    inPausa: false,
    schede: {},
    materiali: [],
    risposte: {},
    audio: {},
    lezioni: {},
    progressi: leggiLocale<Progressi>(CHIAVE_PROGRESSI) ?? progressiVuoti(),
  }));
  const progressiRef = useRef(dati.progressi);
  const materiaRef = useRef<string | null>(leggiLocale<string>(CHIAVE_MATERIA));
  const albero = useRef<VoceAlbero[]>([]);
  const timerSalva = useRef<number | undefined>(undefined);

  // legge un file JSON usando la cache del telefono quando non e' cambiato
  const leggiJson = useCallback(
    async <T,>(path: string): Promise<T | null> => {
      if (!archivio) return null;
      const voce = albero.current.find((v) => v.path === path);
      if (!voce) return null;
      const cache = leggiLocale<Record<string, { sha: string; testo: string }>>(CHIAVE_CACHE) ?? {};
      if (cache[path]?.sha === voce.sha) return JSON.parse(cache[path].testo) as T;
      const testo = await archivio.leggiTesto(path);
      if (testo == null) return null;
      cache[path] = { sha: voce.sha, testo };
      scriviLocale(CHIAVE_CACHE, cache);
      return JSON.parse(testo) as T;
    },
    [archivio],
  );

  const salvaProgressiRemoto = useCallback(async () => {
    if (!archivio) return;
    const p = progressiRef.current;
    await archivio.scrivi("progressi.json", testoInBase64(JSON.stringify(p, null, 1)), "Progressi");
  }, [archivio]);

  const aggiornaProgressi = useCallback(
    (fn: (p: Progressi) => void) => {
      const copia: Progressi = structuredClone(progressiRef.current);
      fn(copia);
      copia.aggiornato = new Date().toISOString();
      if (!copia.giorni_studio.includes(oggi())) copia.giorni_studio.push(oggi());
      progressiRef.current = copia;
      scriviLocale(CHIAVE_PROGRESSI, copia);
      setDati((d) => ({ ...d, progressi: copia }));
      window.clearTimeout(timerSalva.current);
      timerSalva.current = window.setTimeout(() => salvaProgressiRemoto().catch(() => {}), 15000);
    },
    [salvaProgressiRemoto],
  );

  const sincronizza = useCallback(async () => {
    if (!archivio) return;
    setDati((d) => ({ ...d, sincronizzando: true }));
    const voluta = materiaRef.current;
    try {
      albero.current = await archivio.albero();
      const percorsi = albero.current.map((v) => v.path);

      // tutte le materie; si apre quella scelta l'ultima volta
      const esami: Esame[] = [];
      for (const p of percorsi.filter((p) => /^esami\/[^/]+\/esame\.json$/.test(p))) {
        const e = await leggiJson<Esame>(p);
        if (e) esami.push(e);
      }
      esami.sort((a, b) => a.nome.localeCompare(b.nome, "it"));
      const esame = esami.find((e) => e.slug === materiaRef.current) ?? esami[0] ?? null;
      const base = esame ? `esami/${esame.slug}` : "";

      const programma = esame ? await leggiJson<Programma>(`${base}/programma.json`) : null;

      const schede: Record<string, Scheda> = {};
      for (const p of percorsi.filter((p) => p.startsWith(`${base}/schede/`) && p.endsWith(".json"))) {
        const s = await leggiJson<Scheda>(p);
        if (s) schede[s.id] = s;
      }

      const lezioni: Record<string, Lezione> = {};
      for (const p of percorsi.filter((p) => p.startsWith(`${base}/lezioni/`) && p.endsWith(".json"))) {
        const l = await leggiJson<Lezione>(p);
        if (l?.id) lezioni[l.id] = l;
      }

      const sillabo = esame ? await leggiJson<ProgrammaUfficiale>(`${base}/programma-ufficiale.json`) : null;
      const copertura = esame ? await leggiJson<Copertura>(`${base}/copertura.json`) : null;

      const audio: Record<string, Record<string, string>> = {};
      for (const v of albero.current)
        if (v.path.startsWith(`${base}/audio/`) && v.path.endsWith(".mp3")) {
          const [id, voce] = [...v.path.split("/").pop()!.replace(/\.mp3$/, "").split(/\.(?=[^.]+$)/)];
          if (id && voce) (audio[id] ??= {})[voce] = v.sha;
        }

      const statoMateriali = (esame && (await leggiJson<Record<string, StatoMateriale>>(`${base}/stato-materiali.json`))) || {};
      const materiali: MaterialeVisto[] = [];
      for (const p of percorsi.filter((p) => p.startsWith(`${base}/materiali/`) && p.endsWith(".json"))) {
        const m = await leggiJson<MaterialeMeta>(p);
        if (!m) continue;
        const s = statoMateriali[m.id];
        materiali.push({ ...m, stato: s?.stato ?? "attesa", titolo: s?.titolo, avvisi: s?.avvisi });
      }
      // anche gli audio messi direttamente sul PC
      for (const [id, s] of Object.entries(statoMateriali)) {
        if (!materiali.some((m) => m.id === id))
          materiali.push({ id, nome: s.titolo ?? id, tipo: "audio", file: "", caricato: "", stato: s.stato, titolo: s.titolo, avvisi: s.avvisi });
      }
      materiali.sort((a, b) => (b.caricato || "").localeCompare(a.caricato || ""));

      // progressi: vince la copia piu' recente
      const remoti = await leggiJson<Progressi>("progressi.json");
      if (remoti && remoti.aggiornato > (progressiRef.current.aggiornato || "")) {
        progressiRef.current = { ...progressiVuoti(), ...remoti };
        scriviLocale(CHIAVE_PROGRESSI, progressiRef.current);
      }

      const pausa = await leggiJson<{ attiva: boolean }>("pausa.json");
      const motore = await leggiJson<StatoMotore>("motore.json");

      const risposte: Record<string, Risposta> = {};
      for (const r of progressiRef.current.richieste) {
        const ris = await leggiJson<Risposta>(`risposte/${r.id}.json`);
        if (ris) risposte[r.id] = ris;
      }

      if (materiaRef.current !== voluta) return; // nel frattempo hai cambiato materia: ci pensa il giro nuovo
      setDati((d) => ({
        ...d,
        pronto: true,
        errore: undefined,
        sincronizzando: false,
        esame: esame ?? undefined,
        esami,
        inPausa: pausa?.attiva === true,
        motore: motore ?? undefined,
        programma: programma ?? undefined,
        schede,
        audio,
        lezioni,
        sillabo: sillabo ?? undefined,
        copertura: copertura ?? undefined,
        materiali,
        risposte,
        progressi: progressiRef.current,
      }));
    } catch (e) {
      setDati((d) => ({ ...d, pronto: true, sincronizzando: false, errore: e instanceof Error ? e.message : String(e) }));
    }
  }, [archivio, leggiJson]);

  const inviaRichiesta = useCallback<Azioni["inviaRichiesta"]>(
    async (tipo, input, extra) => {
      if (!archivio) throw new Error("Archivio non configurato");
      const id = nuovoId();
      const r: Richiesta = { id, tipo, esame: dati.esame?.slug ?? "", creata: new Date().toISOString(), input };
      await archivio.scrivi(`richieste/${id}.json`, testoInBase64(JSON.stringify(r, null, 1)), `Richiesta: ${tipo}`);
      const inputs = leggiLocale<Record<string, Richiesta>>(CHIAVE_INPUT) ?? {};
      inputs[id] = r;
      // ne tengo solo le ultime 30
      scriviLocale(CHIAVE_INPUT, Object.fromEntries(Object.entries(inputs).slice(-30)));
      aggiornaProgressi((p) => {
        p.richieste.push({ id, tipo, creata: r.creata, ...extra });
      });
      return id;
    },
    [archivio, dati.esame, aggiornaProgressi],
  );

  // per la riserva Gemini servono le schede piu' recenti
  const schedeRef = useRef(dati.schede);
  schedeRef.current = dati.schede;
  const programmaRef = useRef(dati.programma);
  programmaRef.current = dati.programma;
  const geminiInCorso = useRef(new Set<string>());

  /** Il PC non risponde: il telefono chiede a Gemini e salva la risposta come farebbe il motore. */
  const rispondiConGemini = useCallback(
    async (id: string) => {
      const chiave = leggiChiaveGemini();
      const richiesta = (leggiLocale<Record<string, Richiesta>>(CHIAVE_INPUT) ?? {})[id];
      if (!archivio || !chiave || !richiesta || geminiInCorso.current.has(id)) return;
      const input = richiesta.input as { argomento?: string; testo?: string; domanda?: string | null; trascrizione?: string; passaggio?: string };
      const scheda = input.argomento ? schedeRef.current[input.argomento] : undefined;
      if (!scheda && richiesta.tipo !== "domanda") return;
      geminiInCorso.current.add(id);
      const segna = (r: Risposta) => setDati((d) => ({ ...d, risposte: { ...d.risposte, [id]: r } }));
      segna({ id, stato: "in_corso", aggiornata: new Date().toISOString(), da: "gemini" });
      try {
        const output =
          richiesta.tipo === "domanda"
            ? await domandaConGemini(chiave, {
                domanda: input.domanda ?? "",
                passaggio: input.passaggio,
                scheda,
                argomenti: (programmaRef.current?.argomenti ?? []).map((a) => a.titolo),
              })
            : richiesta.tipo === "penna"
            ? await pennaConGemini(chiave, scheda!, input.testo ?? "")
            : await valutaConGemini(
                chiave,
                scheda!,
                { domanda: input.domanda, trascrizione: input.trascrizione ?? "" },
                (progressiRef.current.argomenti[input.argomento ?? ""]?.ripetizioni ?? []).map((r) => r.voto),
              );
        const risposta: Risposta = { id, stato: "fatta", aggiornata: new Date().toISOString(), output, da: "gemini" };
        segna(risposta);
        // la salvo nell'archivio: cosi' il PC, quando si accende, non la rifa'
        await archivio.scrivi(`risposte/${id}.json`, testoInBase64(JSON.stringify(risposta, null, 1)), "Risposta di Gemini").catch(() => {});
      } catch (e) {
        segna({ id, stato: "errore", aggiornata: new Date().toISOString(), errore: e instanceof Error ? e.message : String(e), da: "gemini" });
      } finally {
        geminiInCorso.current.delete(id);
      }
    },
    [archivio],
  );

  const aspettaRisposta = useCallback<Azioni["aspettaRisposta"]>(
    (id, ogniMs = 4000) => {
      let fermo = false;
      const inizio = Date.now();
      let geminiChiesto = false;
      const giro = async () => {
        if (fermo || !archivio) return;
        try {
          const testo = await archivio.leggiTesto(`risposte/${id}.json`);
          if (testo) {
            const r = JSON.parse(testo) as Risposta;
            setDati((d) => ({ ...d, risposte: { ...d.risposte, [id]: r } }));
            if (r.stato !== "in_corso") return;
          } else if (!geminiChiesto && Date.now() - inizio > ATTESA_PC_MS && leggiChiaveGemini()) {
            // nessun segno dal PC: rispondo con Gemini, ma continuo a guardare se il PC si sveglia
            geminiChiesto = true;
            rispondiConGemini(id);
          }
        } catch {
          /* rete assente: riprovo */
        }
        if (!fermo) window.setTimeout(giro, ogniMs);
      };
      giro();
      return () => {
        fermo = true;
      };
    },
    [archivio, rispondiConGemini],
  );

  const caricaFile = useCallback<Azioni["caricaFile"]>(
    async (file, nome, tipo, gruppo) => {
      if (!archivio || !dati.esame) throw new Error("Prima serve l'esame");
      const id = nuovoId();
      const est = (nome.split(".").pop() || (tipo === "foto" ? "jpg" : "bin")).toLowerCase();
      const base = `esami/${dati.esame.slug}/materiali`;
      await archivio.scrivi(`${base}/${id}.${est}`, await fileInBase64(file), `Materiale: ${nome}`);
      const meta: MaterialeMeta = { id, nome, tipo, file: `${id}.${est}`, gruppo, caricato: new Date().toISOString() };
      await archivio.scrivi(`${base}/${id}.json`, testoInBase64(JSON.stringify(meta, null, 1)), `Materiale: ${nome}`);
      setDati((d) => ({ ...d, materiali: [{ ...meta, stato: "attesa" }, ...d.materiali] }));
    },
    [archivio, dati.esame],
  );

  const salvaEsame = useCallback<Azioni["salvaEsame"]>(
    async (e) => {
      if (!archivio) return;
      await archivio.scrivi(`esami/${e.slug}/esame.json`, testoInBase64(JSON.stringify(e, null, 1)), "Esame");
      setDati((d) => ({ ...d, esame: e, esami: [...d.esami.filter((x) => x.slug !== e.slug), e].sort((a, b) => a.nome.localeCompare(b.nome, "it")) }));
    },
    [archivio],
  );

  const salvaSillabo = useCallback<Azioni["salvaSillabo"]>(
    async (testo) => {
      if (!archivio || !dati.esame) return;
      const s: ProgrammaUfficiale = { testo: testo.trim(), aggiornato: new Date().toISOString() };
      await archivio.scrivi(`esami/${dati.esame.slug}/programma-ufficiale.json`, testoInBase64(JSON.stringify(s, null, 1)), "Programma ufficiale dell'esame");
      setDati((d) => ({ ...d, sillabo: s }));
    },
    [archivio, dati.esame],
  );

  const impostaPausa = useCallback<Azioni["impostaPausa"]>(
    async (attiva) => {
      if (!archivio) return;
      const prima = dati.inPausa;
      setDati((d) => ({ ...d, inPausa: attiva }));
      try {
        await archivio.scrivi("pausa.json", testoInBase64(JSON.stringify({ attiva, aggiornata: new Date().toISOString() }, null, 1)), attiva ? "Pausa" : "Si riprende");
      } catch (e) {
        setDati((d) => ({ ...d, inPausa: prima }));
        throw e;
      }
    },
    [archivio, dati.inPausa],
  );

  const scegliMateria = useCallback<Azioni["scegliMateria"]>(
    (slug) => {
      materiaRef.current = slug;
      scriviLocale(CHIAVE_MATERIA, slug);
      // svuoto subito, poi carico la materia nuova
      setDati((d) => ({ ...d, pronto: false, esame: d.esami.find((e) => e.slug === slug), programma: undefined, schede: {}, materiali: [] }));
      sincronizza();
    },
    [sincronizza],
  );

  const creaMateria = useCallback<Azioni["creaMateria"]>(
    async (nome, tipo, data) => {
      const radiceSlug =
        nome
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "materia";
      let slug = radiceSlug;
      for (let n = 2; dati.esami.some((e) => e.slug === slug); n++) slug = `${radiceSlug}-${n}`;
      await salvaEsame({ slug, nome: nome.trim(), tipo, ...(data ? { data_esame: data } : {}) });
      scegliMateria(slug);
      return slug;
    },
    [dati.esami, salvaEsame, scegliMateria],
  );

  useEffect(() => {
    sincronizza();
    const ogniMinuto = window.setInterval(sincronizza, 60000);
    const alRitorno = () => {
      if (document.visibilityState === "visible") sincronizza();
      else salvaProgressiRemoto().catch(() => {});
    };
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      window.clearInterval(ogniMinuto);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [sincronizza, salvaProgressiRemoto]);

  const cambiaStelle = useCallback<Azioni["cambiaStelle"]>(
    (argomento, stelle) => {
      aggiornaProgressi((p) => {
        p.stelle ??= {};
        if (stelle == null) delete p.stelle[argomento];
        else p.stelle[argomento] = stelle;
      });
    },
    [aggiornaProgressi],
  );

  // le stelle decise da te contano più di quelle di Virgilio, ovunque
  const programmaTuo = useMemo(() => {
    const mie = dati.progressi.stelle;
    if (!dati.programma || !mie || !Object.keys(mie).length) return dati.programma;
    return {
      ...dati.programma,
      argomenti: dati.programma.argomenti.map((a) =>
        mie[a.id] && mie[a.id] !== a.importanza ? { ...a, importanza: mie[a.id], importanza_virgilio: a.importanza } : a,
      ),
    };
  }, [dati.programma, dati.progressi.stelle]);

  // l'audio si scarica una volta sola e resta nella memoria del telefono (anche senza rete)
  const caricaAudio = useCallback<Azioni["caricaAudio"]>(
    async (id, voce) => {
      const sha = dati.audio[id]?.[voce];
      if (!archivio || !dati.esame || !sha) return null;
      const chiave = `https://audio.locale/${dati.esame.slug}/${id}.${voce}/${sha}`;
      try {
        const cache = await caches.open("tutor-audio");
        let r = await cache.match(chiave);
        if (!r) {
          const blob = await archivio.leggiBinario(`esami/${dati.esame.slug}/audio/${id}.${voce}.mp3`);
          if (!blob) return null;
          for (const k of await cache.keys()) if (k.url.startsWith(`https://audio.locale/${dati.esame.slug}/${id}.${voce}/`)) await cache.delete(k);
          await cache.put(chiave, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
          r = await cache.match(chiave);
        }
        return r ? URL.createObjectURL(await r.blob()) : null;
      } catch {
        // niente cache: scarico e basta
        const blob = await archivio.leggiBinario(`esami/${dati.esame.slug}/audio/${id}.${voce}.mp3`).catch(() => null);
        return blob ? URL.createObjectURL(blob) : null;
      }
    },
    [archivio, dati.audio, dati.esame],
  );

  const caricaTempi = useCallback<Azioni["caricaTempi"]>(
    async (id, voce) => (dati.esame ? await leggiJson<FraseTempo[]>(`esami/${dati.esame.slug}/audio/${id}.${voce}.tempi.json`).catch(() => null) : null),
    [leggiJson, dati.esame],
  );

  const valore = useMemo(
    () => ({ ...dati, programma: programmaTuo, salvaSillabo, caricaAudio, caricaTempi, cambiaStelle, sincronizza, aggiornaProgressi, inviaRichiesta, caricaFile, salvaEsame, scegliMateria, creaMateria, impostaPausa, aspettaRisposta }),
    [dati, programmaTuo, salvaSillabo, caricaAudio, caricaTempi, cambiaStelle, sincronizza, aggiornaProgressi, inviaRichiesta, caricaFile, salvaEsame, scegliMateria, creaMateria, impostaPausa, aspettaRisposta],
  );
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}
