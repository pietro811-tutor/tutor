// Il motore di Virgilio. Gira sul PC, controlla l'archivio ogni pochi secondi e:
//  - risponde subito alle richieste dal telefono (valutare una ripetizione, la penna);
//  - nel frattempo, con calma, legge i materiali nuovi e scrive programma e schede.
//
// Avvio:  node motore.js            (usa GitHub)
//         node motore.js --locale   (prove sul PC, senza GitHub)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { creaArchivio } from "./archivio.js";
import { log } from "./log.js";
import { audioMancanti, disponibile as vociPronte, generaAudio, scriviLezioni } from "./audio.js";
import {
  costruisciProgramma,
  costruisciScheda,
  leggiJson,
  leggiMateriale,
  confrontaProgramma,
  penna,
  domanda,
  rispondiRicorrente,
  percorsi,
  scriviJson,
  valutaRipetizione,
} from "./compiti.js";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(QUI, "config.json"), "utf8"));
// impostazioni di questo PC (non pubblicate)
const fileLocale = path.join(QUI, "config.locale.json");
if (fs.existsSync(fileLocale)) Object.assign(config, JSON.parse(fs.readFileSync(fileLocale, "utf8")));
if (process.argv.includes("--locale")) config.modalita = "locale";
const argDati = process.argv.indexOf("--dati");
if (argDati > 0) config.dati = path.resolve(process.argv[argDati + 1]);
const argAudio = process.argv.indexOf("--audio");
if (argAudio > 0) config.audio_pc = path.resolve(process.argv[argAudio + 1]);
const radice = path.resolve(QUI, config.dati);
const cartellaAudioPc = path.resolve(QUI, config.audio_pc);
const archivio = creaArchivio(config, radice);

const ESTENSIONI_AUDIO = [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".wma", ".flac", ".mp4"];
const PAUSA_LIMITE_MS = 20 * 60000;
const dormi = (ms) => new Promise((ok) => setTimeout(ok, ms));
const elenco = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
const uguali = (a = [], b = []) => [...a].sort().join("|") === [...b].sort().join("|");

let pausaFino = 0;
const fallimenti = new Map(); // compito -> { volte, finoA }

function inPausa() {
  return Date.now() < pausaFino;
}
function mettiInPausa(motivo) {
  pausaFino = Date.now() + PAUSA_LIMITE_MS;
  log(`Limite dell'abbonamento raggiunto (${motivo.slice(0, 120)}). Riposo 20 minuti e riprendo da solo.`);
}
/** "Pausa" decisa da te dall'app (pausa.json, scritto solo dal telefono): ferma il lavoro di fondo, le domande dal vivo continuano. */
function pausaDellUtente() {
  return leggiJson(path.join(radice, "pausa.json"), {})?.attiva === true;
}

/**
 * Il limite "scrivi solo N schede", deciso da te quando premi Riprendi (nel file pausa.json, scritto dal telefono).
 * Ogni volta che premi Riprendi il file cambia: il conteggio riparte da capo.
 */
let versionePausa = null;
let schedeRimaste = null; // null = nessun limite
let limiteRaggiunto = false;
function aggiornaLimite() {
  const p = leggiJson(path.join(radice, "pausa.json"), {});
  if (p.aggiornata !== versionePausa) {
    versionePausa = p.aggiornata ?? "";
    const n = Number(p.limite_schede);
    schedeRimaste = n > 0 ? n : null;
    limiteRaggiunto = false;
  }
}

/** Dice all'app cosa sta facendo il motore (motore.json, scritto solo da qui). Riscrive solo se cambia, o ogni 10 minuti come "sono vivo". */
let ultimoStato = { stato: "", cosa: "", quando: 0 };
let inizioLavoro = null; // quando e' cominciato il lavoro in corso
let audioDaFare = 0; // quanti audio mancano ancora
const durateSchede = []; // quanti secondi ci sono voluti per le ultime schede: serve a stimare quanto manca
const mediaSecondi = () => (durateSchede.length ? Math.round(durateSchede.reduce((a, b) => a + b, 0) / durateSchede.length) : null);
// all'avvio riparto dalla media dell'altra volta
{
  const prima = leggiJson(path.join(radice, "motore.json"), {})?.media_secondi;
  if (prima) durateSchede.push(prima);
}

function scriviStato() {
  if (!ultimoStato.stato) return;
  const media = mediaSecondi();
  scriviJson(path.join(radice, "motore.json"), {
    stato: ultimoStato.stato,
    cosa: ultimoStato.cosa,
    aggiornato: new Date().toISOString(),
    ...(ultimoStato.stato === "lavora" && inizioLavoro ? { inizio: inizioLavoro } : {}),
    ...(media ? { media_secondi: media } : {}),
    audio_da_fare: audioDaFare,
    ...(schedeRimaste !== null ? { schede_rimaste: Math.max(0, schedeRimaste) } : {}),
  });
}

async function segnalaStato(stato, cosa = "") {
  const cambiato = stato !== ultimoStato.stato || cosa !== ultimoStato.cosa;
  if (!cambiato && Date.now() - ultimoStato.quando < 10 * 60000) return;
  ultimoStato = { stato, cosa, quando: Date.now() };
  scriviStato();
  await archivio.pubblica("Stato del motore").catch(() => {});
}

function puoRiprovare(chiave) {
  const f = fallimenti.get(chiave);
  return !f || Date.now() > f.finoA;
}
function segnaFallimento(chiave) {
  const f = fallimenti.get(chiave) ?? { volte: 0, finoA: 0 };
  f.volte++;
  f.finoA = f.volte >= 3 ? Date.now() + 6 * 3600e3 : 0;
  fallimenti.set(chiave, f);
}

// ---------- cosa c'e' da fare ----------

function esami() {
  return elenco(path.join(radice, "esami"))
    .map((slug) => leggiJson(path.join(radice, "esami", slug, "esame.json")))
    .filter(Boolean);
}

function richiesteInAttesa() {
  const dir = path.join(radice, "richieste");
  return elenco(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leggiJson(path.join(dir, f)))
    .filter((r) => {
      if (!r?.id) return false;
      const risposta = leggiJson(path.join(radice, "risposte", `${r.id}.json`));
      if (!risposta) return true;
      // ripresa dopo un crash: "in corso" da troppo tempo
      return risposta.stato === "in_corso" && Date.now() - new Date(risposta.aggiornata).getTime() > 30 * 60000;
    })
    .sort((a, b) => a.creata.localeCompare(b.creata));
}

/** Gli audio lunghi arrivano dal telefono a pezzi (<file>.p001, .p002...): quando ci sono tutti li rimetto insieme. */
function ricomponiPezzi(p, m) {
  const finale = path.join(p.materiali, m.file);
  if (!m.parti || fs.existsSync(finale)) return;
  const pezzi = Array.from({ length: m.parti }, (_, i) => path.join(p.materiali, `${m.file}.p${String(i + 1).padStart(3, "0")}`));
  if (!pezzi.every((x) => fs.existsSync(x))) return; // ne manca ancora qualcuno (il git non e' ancora aggiornato)
  const tmp = finale + ".tmp";
  fs.writeFileSync(tmp, "");
  for (const x of pezzi) fs.appendFileSync(tmp, fs.readFileSync(x));
  fs.renameSync(tmp, finale);
  log(`Rimesso insieme l'audio "${m.nome}" da ${m.parti} pezzi`);
}

function materialiDaLeggere(esame) {
  const p = percorsi(radice, esame.slug);
  // "parziale" = il testo c'è ma manca ancora l'indice: va ripreso
  const fatti = new Set(
    elenco(p.testi)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => !leggiJson(path.join(p.testi, f))?.parziale)
      .map((f) => f.replace(/\.json$/, "")),
  );
  const lista = elenco(p.materiali)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leggiJson(path.join(p.materiali, f)))
    .filter((m) => m?.id && !fatti.has(m.id) && (ricomponiPezzi(p, m), fs.existsSync(path.join(p.materiali, m.file))))
    .sort((a, b) => a.caricato.localeCompare(b.caricato))
    .map((m) => ({ ...m, percorsoFile: path.join(p.materiali, m.file) }));
  // audio lasciati direttamente sul PC: Tutor\audio-lezioni\<esame>\
  const dirPc = path.join(cartellaAudioPc, esame.slug);
  for (const f of elenco(dirPc).filter((f) => ESTENSIONI_AUDIO.includes(path.extname(f).toLowerCase()))) {
    const id = "pc-" + f.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!fatti.has(id)) lista.push({ id, nome: f, tipo: "audio", percorsoFile: path.join(dirPc, f) });
  }
  return lista;
}

function idLetti(esame) {
  const p = percorsi(radice, esame.slug);
  return elenco(p.testi)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leggiJson(path.join(p.testi, f)))
    .filter((t) => t && !t.errore && t.indice?.length)
    .map((t) => t.id);
}

/** Il prossimo lavoro "con calma", oppure null. */
function prossimoLavoro() {
  for (const esame of esami()) {
    const daLeggere = materialiDaLeggere(esame).filter((m) => puoRiprovare("m:" + m.id));
    if (daLeggere.length) {
      const m = daLeggere[0];
      return { chiave: "m:" + m.id, descrizione: `Letto: ${m.nome}`, fai: () => leggiMateriale(config, radice, esame, m) };
    }
    const p = percorsi(radice, esame.slug);
    const letti = idLetti(esame);
    const programma = leggiJson(p.programma);
    if (letti.length && (!programma || !uguali(programma.basato_su, letti)) && puoRiprovare("p:" + esame.slug)) {
      return { chiave: "p:" + esame.slug, descrizione: "Programma aggiornato", fai: () => costruisciProgramma(config, radice, esame, letti) };
    }
    // il programma ufficiale incollato dallo studente: confronto con i materiali (una chiamata sola, poi si rifa' solo se cambia qualcosa)
    const sillabo = leggiJson(path.join(radice, "esami", esame.slug, "programma-ufficiale.json"));
    if (sillabo?.testo?.trim() && programma) {
      const cop = leggiJson(path.join(radice, "esami", esame.slug, "copertura.json"));
      if ((cop?.sillabo_aggiornato !== sillabo.aggiornato || cop?.programma_aggiornato !== programma.aggiornato) && puoRiprovare("c:" + esame.slug)) {
        return { chiave: "c:" + esame.slug, descrizione: "Confronto con il programma ufficiale", fai: () => confrontaProgramma(config, radice, esame, sillabo, programma, letti) };
      }
    }
    if (programma) {
      // prima le schede dei più chiesti all'esame, poi i normali, poi i meno chiesti; le stelle decise dallo studente (progressi.json) contano di più
      const sue = leggiJson(path.join(radice, "progressi.json"), {})?.stelle ?? {};
      const stelle = (x) => sue[x.id] ?? x.importanza;
      for (const a of [...programma.argomenti].sort((x, y) => stelle(y) - stelle(x) || x.ordine - y.ordine)) {
        const scheda = leggiJson(path.join(p.schede, `${a.id}.json`));
        if ((!scheda || !uguali(scheda.basata_su, a.fonti)) && puoRiprovare("s:" + a.id)) {
          return { chiave: "s:" + a.id, descrizione: `Scheda: ${a.titolo}`, fai: () => costruisciScheda(config, radice, esame, a, programma) };
        }
      }
    }
  }
  return null;
}

// ---------- i due giri ----------

const GESTORI = { valuta_ripetizione: valutaRipetizione, penna, domanda, risposta_ricorrente: rispondiRicorrente };

async function rispondi(richiesta) {
  const file = path.join(radice, "risposte", `${richiesta.id}.json`);
  const gestore = GESTORI[richiesta.tipo];
  if (!gestore) {
    scriviJson(file, { id: richiesta.id, stato: "errore", aggiornata: new Date().toISOString(), errore: "Richiesta sconosciuta" });
    return archivio.pubblica("Richiesta sconosciuta");
  }
  log(`Richiesta dal telefono: ${richiesta.tipo}`);
  scriviJson(file, { id: richiesta.id, stato: "in_corso", aggiornata: new Date().toISOString() });
  await archivio.pubblica(`Virgilio ci pensa: ${richiesta.tipo}`);
  try {
    const output = await gestore(config, radice, richiesta);
    scriviJson(file, { id: richiesta.id, stato: "fatta", aggiornata: new Date().toISOString(), output });
    log(`Risposta pronta: ${richiesta.tipo}`);
  } catch (e) {
    if (e.limite) {
      fs.rmSync(file, { force: true }); // la riprendo dopo la pausa
      mettiInPausa(e.message);
    } else {
      log(`Errore nella richiesta ${richiesta.id}: ${e.message}`);
      scriviJson(file, { id: richiesta.id, stato: "errore", aggiornata: new Date().toISOString(), errore: "Non ci sono riuscito, riprova tra poco." });
    }
  }
  await archivio.pubblica(`Risposta: ${richiesta.tipo}`);
}

async function giroRichieste() {
  for (;;) {
    try {
      await archivio.aggiorna();
      if (!inPausa()) for (const r of richiesteInAttesa()) {
        await rispondi(r);
        if (inPausa()) break;
      }
    } catch (e) {
      log(`Errore nel giro richieste: ${e.message}`);
    }
    await dormi(config.intervallo_secondi * 1000);
  }
}

async function giroDiFondo() {
  for (;;) {
    let lavoro = null;
    try {
      aggiornaLimite();
      if (pausaDellUtente()) {
        await segnalaStato("pausa");
        await dormi(10000);
        continue;
      }
      if (limiteRaggiunto) {
        await segnalaStato("pausa", "limite_schede");
        await dormi(10000);
        continue;
      }
      if (inPausa()) {
        await segnalaStato("limite");
        await dormi(15000);
        continue;
      }
      lavoro = prossimoLavoro();
      if (!lavoro) {
        await segnalaStato("libero");
        await dormi(15000);
        continue;
      }
      inizioLavoro = new Date().toISOString();
      const t0 = Date.now();
      await segnalaStato("lavora", lavoro.descrizione);
      await lavoro.fai();
      fallimenti.delete(lavoro.chiave);
      if (lavoro.chiave.startsWith("s:")) {
        durateSchede.push(Math.round((Date.now() - t0) / 1000));
        if (durateSchede.length > 8) durateSchede.shift();
        if (schedeRimaste !== null) {
          schedeRimaste--;
          if (schedeRimaste <= 0) {
            limiteRaggiunto = true;
            log("Ho scritto le schede che mi hai chiesto: mi fermo finché non riprendi tu.");
          }
        }
      }
      await archivio.pubblica(lavoro.descrizione);
    } catch (e) {
      if (e.limite) mettiInPausa(e.message);
      else {
        log(`Errore (${lavoro?.descrizione ?? "?"}): ${e.message}`);
        if (lavoro) segnaFallimento(lavoro.chiave);
      }
      await dormi(5000);
    }
  }
}

/** Gli audio delle schede (voce gratuita sul PC, niente Claude): non si ferma con la pausa, e' solo lavoro del PC. */
async function giroAudio() {
  const voci = config.voce?.elenco ?? ["if_sara"]; // si fanno prima tutte le schede con la prima voce, poi con la seconda
  const velocita = config.voce?.velocita ?? 0.8;
  if (config.audio_attivo === false) return log("Audio fermi (audio_attivo: false in config.locale.json).");
  if (!vociPronte(voci[0])) return log("Voci non installate (cartella voci): salto gli audio.");
  for (;;) {
    try {
      if (esami().map((e) => scriviLezioni(radice, e)).some((n) => n > 0)) await archivio.pubblica("Piani delle lezioni");
      let voce = voci[0];
      let lavori = [];
      for (const v of voci) {
        voce = v;
        lavori = esami().flatMap((e) => audioMancanti(radice, e, v, velocita));
        if (lavori.length) break;
      }
      if (lavori.length) {
        log(`Audio da fare (${voce}): ${lavori.length}`);
        if (lavori.length !== audioDaFare) {
          audioDaFare = lavori.length;
          scriviStato(); // lo pubblica il passaggio qui sotto
        }
        const fatti = await generaAudio(lavori.slice(0, voce === "chatterbox" ? 2 : 24), voce, velocita);
        log(`Audio pronti: ${fatti}`);
        await archivio.pubblica("Audio delle schede");
        continue;
      }
      if (audioDaFare !== 0) {
        audioDaFare = 0; // tutti gli audio sono pronti
        scriviStato();
        await archivio.pubblica("Stato del motore");
      }
    } catch (e) {
      log(`Errore negli audio: ${e.message}`);
      await dormi(10 * 60000);
    }
    await dormi(60000);
  }
}

log(`Virgilio è sveglio (${config.modalita === "locale" ? "prova sul PC" : "collegato a GitHub"}). Dati in ${radice}`);
if (!fs.existsSync(radice)) {
  log("La cartella dati non esiste: controlla config.json");
  process.exit(1);
}
fs.mkdirSync(path.join(cartellaAudioPc, "anatomia-patologica"), { recursive: true });
giroRichieste();
giroDiFondo();
giroAudio();
