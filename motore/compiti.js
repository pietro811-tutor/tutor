// Cosa sa fare Virgilio. Ogni compito legge file dall'archivio dati,
// chiede a Claude e scrive il risultato come file JSON.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chiediJson } from "./chiedi-claude.js";
import { log } from "./log.js";

const esegui = promisify(execFile);

export const VIRGILIO = `Sei Virgilio, il tutor personale di uno studente universitario che prepara un esame orale.
Carattere: caldo, incoraggiante, un po' ironico con garbo; parli al "noi" ("facciamo", "vediamo"); sei esigente quando valuti
ma non fai mai sentire in colpa. Scrivi in italiano semplice e chiaro, frasi brevi.
Regola d'oro: Lo studente deve portare all'esame quello che c'e' nei SUOI materiali (lezioni del professore, libro, appunti).
Resta fedele ai materiali; se aggiungi qualcosa che non c'e', dillo chiaramente. Non inventare mai.`;

const ora = () => new Date().toISOString();

// ---------- file ----------

export function leggiJson(file, predefinito = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return predefinito;
  }
}

export function scriviJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), "utf8");
  fs.renameSync(tmp, file);
}

export const cartellaLavoro = () => {
  const dir = path.join(os.tmpdir(), "tutor-motore");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const percorsi = (radice, slug) => {
  const base = path.join(radice, "esami", slug);
  return {
    base,
    esame: path.join(base, "esame.json"),
    materiali: path.join(base, "materiali"),
    testi: path.join(base, "testi"),
    schede: path.join(base, "schede"),
    programma: path.join(base, "programma.json"),
    statoMateriali: path.join(base, "stato-materiali.json"),
    termini: path.join(base, "termini.txt"),
  };
};

function aggiornaStatoMateriale(p, id, valore) {
  const stato = leggiJson(p.statoMateriali, {});
  stato[id] = valore;
  scriviJson(p.statoMateriali, stato);
}

const formatoIndice = `"indice": [{"titolo": "argomento trattato", "sintesi": "1-2 frasi", "dove": "pagina o minuto, se lo sai"}]`;

// ---------- 1. leggere un materiale ----------

async function trascriviAudio(config, fileAudio, esame, p) {
  const lavoro = path.join(cartellaLavoro(), "audio-" + Date.now());
  fs.mkdirSync(lavoro, { recursive: true });
  const copia = path.join(lavoro, path.basename(fileAudio));
  fs.copyFileSync(fileAudio, copia);
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), config.trascrivi);
  const args = [script, copia, "--materia", esame.nome, "--modo", "leggero"];
  if (fs.existsSync(p.termini)) args.push("--termini", p.termini);
  log(`Trascrivo l'audio ${path.basename(fileAudio)}…`);
  await esegui(config.whisper_python, args, { windowsHide: true, maxBuffer: 50e6, timeout: 4 * 3600e3 });
  const json = leggiJson(copia.replace(/\.[^.]+$/, "_trascrizione.json"));
  fs.rmSync(lavoro, { recursive: true, force: true });
  if (!json) throw new Error("La trascrizione non ha prodotto risultati");
  const orario = (s) => new Date(s * 1000).toISOString().slice(11, 19);
  return json.segmenti.map((s) => `[${orario(s.inizio)}] ${s.testo}`).join("\n");
}

async function testoDaPdf(file) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const { text } = await extractText(pdf, { mergePages: false });
  const pagine = Array.isArray(text) ? text : [text];
  return { pagine: pagine.length, testo: pagine.map((t, i) => `[Pagina ${i + 1}]\n${t.trim()}`).join("\n\n"), caratteri: pagine.join("").length };
}

async function testoDaDocx(file) {
  const m = await import("mammoth");
  const mammoth = m.default ?? m;
  return (await mammoth.extractRawText({ path: file })).value.replace(/\n{3,}/g, "\n\n");
}

/** Salva il testo con righe corte: chi lo legge a pezzi (offset/limit) non perde nulla sulle righe lunghe. */
function scriviTestoLeggibile(file, testo) {
  const righe = [];
  for (const riga of String(testo).split("\n")) {
    let r = riga;
    while (r.length > 400) {
      let taglio = r.lastIndexOf(" ", 400);
      if (taglio < 200) taglio = 400;
      righe.push(r.slice(0, taglio));
      r = r.slice(taglio).trimStart();
    }
    righe.push(r);
  }
  fs.writeFileSync(file, righe.join("\n"), "utf8");
}

/** Legge un materiale e ne fa testo + indice. */
export async function leggiMateriale(config, radice, esame, materiale) {
  const p = percorsi(radice, esame.slug);
  const file = materiale.percorsoFile;
  const fileTesto = path.join(p.testi, `${materiale.id}.json`);
  const fileTxt = path.join(p.testi, `${materiale.id}.txt`);
  log(`Leggo ${materiale.tipo}: ${materiale.nome}`);
  try {
    let risultato;
    if (materiale.tipo === "foto") {
      risultato = await chiediJson(
        config,
        {
          cwd: radice,
          modello: "veloce",
          prompt: `Leggi l'immagine ${file} : è una foto fatta col telefono dallo studente per l'esame di ${esame.nome} (pagina di libro, slide o appunti, anche scritti a mano).
1) Trascrivi FEDELMENTE tutto il testo, nell'ordine di lettura. Usa il markdown: titoli con ##, elenchi con -, tabelle in markdown.
   Descrivi brevemente figure e schemi tra parentesi quadre: [Figura: ...]. Segna con [?] le parole che non riesci a leggere.
2) Dai un titolo e l'indice degli argomenti trattati.
3) In "avvisi" segnala problemi della foto (sfocata, tagliata, riflessi, pagina storta) solo se ci sono.
Rispondi SOLO con JSON: {"titolo": "...", "testo": "...", ${formatoIndice}, "avvisi": []}`,
        },
        (o) => (typeof o.testo === "string" && Array.isArray(o.indice) ? null : "mancano testo o indice"),
      );
    } else {
      let testo = null;
      const avvisi = [];
      const prima = leggiJson(fileTesto);
      if (prima?.parziale && prima.testo) testo = prima.testo; // ripresa dopo un'interruzione: non rifaccio la parte lunga
      const est = path.extname(file).toLowerCase();
      if (testo) {
        /* già estratto */
      } else if (materiale.tipo === "audio") testo = await trascriviAudio(config, file, esame, p);
      else if (est === ".pdf") {
        const pdf = await testoDaPdf(file);
        testo = pdf.testo;
        if (pdf.caratteri / Math.max(1, pdf.pagine) < 150) {
          // PDF fatto di immagini (scansione): lo faccio leggere a Claude
          avvisi.push("PDF scansionato: l'ho letto pagina per pagina, controlla le parti con [?].");
          testo = await leggiPdfScansionato(config, radice, file, pdf.pagine, esame);
        }
      } else if ([".txt", ".md"].includes(est)) testo = fs.readFileSync(file, "utf8");
      else if (est === ".docx") testo = await testoDaDocx(file);
      else throw new Error("Formato non supportato: salvalo come PDF o Word (.docx) e ricaricalo.");

      // salvo subito il testo ("parziale": se si interrompe, riparte da qui), poi chiedo l'indice leggendo il file
      scriviJson(fileTesto, { id: materiale.id, elaborato: ora(), titolo: materiale.nome, testo, indice: [], parziale: true });
      scriviTestoLeggibile(fileTxt, testo);
      const meta = await chiediJson(
        config,
        {
          cwd: radice,
          modello: "veloce",
          prompt: `Leggi tutto il file ${fileTxt} (testo semplice; se è lungo leggilo a pezzi con offset e limit, fino all'ultima riga). È ${
            materiale.tipo === "audio" ? "la trascrizione automatica di una lezione (righe con [ora:minuti:secondi])" : "un documento"
          } per l'esame di ${esame.nome}.
Dai un titolo breve e l'indice di TUTTI gli argomenti trattati, in ordine. In "dove" metti ${materiale.tipo === "audio" ? "il minuto di inizio (es. 00:23:40)" : "la pagina"}.
Se è una lezione, nella sintesi segnala quando il professore insiste su qualcosa ("lo chiedo sempre", "importante").
In "avvisi" metti problemi evidenti (trascrizione pessima, parti mancanti), solo se ci sono.
Rispondi SOLO con JSON: {"titolo": "...", ${formatoIndice}, "avvisi": []}`,
        },
        (o) => (Array.isArray(o.indice) ? null : "manca l'indice"),
      );
      risultato = { ...meta, testo, avvisi: [...avvisi, ...(meta.avvisi ?? [])] };
    }
    scriviTestoLeggibile(fileTxt, risultato.testo);
    scriviJson(fileTesto, {
      id: materiale.id,
      elaborato: ora(),
      titolo: risultato.titolo || materiale.nome,
      testo: risultato.testo,
      indice: risultato.indice,
      avvisi: risultato.avvisi ?? [],
    });
    aggiornaStatoMateriale(p, materiale.id, { stato: "letto", titolo: risultato.titolo || materiale.nome, avvisi: risultato.avvisi ?? [] });
  } catch (e) {
    if (e.limite) throw e;
    log(`Errore leggendo ${materiale.nome}: ${e.message}`);
    scriviJson(fileTesto, { id: materiale.id, elaborato: ora(), titolo: materiale.nome, testo: "", indice: [], errore: e.message });
    aggiornaStatoMateriale(p, materiale.id, { stato: "errore", titolo: materiale.nome, avvisi: [e.message] });
  }
}

async function leggiPdfScansionato(config, radice, file, pagine, esame) {
  const parti = [];
  for (let da = 1; da <= Math.min(pagine, 300); da += 10) {
    const a = Math.min(pagine, da + 9);
    const r = await chiediJson(config, {
      cwd: radice,
      modello: "veloce",
      prompt: `Leggi le pagine ${da}-${a} del PDF ${file} (esame di ${esame.nome}) e trascrivi fedelmente il testo, in markdown,
mettendo all'inizio di ogni pagina "[Pagina N]". Segna con [?] le parole illeggibili, descrivi le figure tra [Figura: ...].
Rispondi SOLO con JSON: {"testo": "..."}`,
    });
    parti.push(r.testo ?? "");
  }
  return parti.join("\n\n");
}

// ---------- 2. il programma (gli argomenti) ----------

export async function costruisciProgramma(config, radice, esame, idLetti) {
  const p = percorsi(radice, esame.slug);
  const indici = idLetti.map((id) => {
    const t = leggiJson(path.join(p.testi, `${id}.json`), {});
    return { materiale: id, titolo: t.titolo, indice: t.indice };
  });
  const fileIndici = path.join(cartellaLavoro(), `indici-${esame.slug}.json`);
  fs.writeFileSync(fileIndici, JSON.stringify(indici, null, 1));
  const vecchio = leggiJson(p.programma);
  const fileVecchio = path.join(cartellaLavoro(), `programma-vecchio-${esame.slug}.json`);
  fs.writeFileSync(fileVecchio, JSON.stringify(vecchio?.argomenti ?? [], null, 1));

  log(`Costruisco il programma da ${idLetti.length} materiali…`);
  const r = await chiediJson(
    config,
    {
      cwd: radice,
      modello: "profondo",
      prompt: `${VIRGILIO}

Prepariamo il programma di studio per l'esame ${esame.tipo} di ${esame.nome}.
Leggi ${fileIndici} : per ogni materiale dello studente c'è l'indice degli argomenti trattati.
Leggi anche ${fileVecchio} : è il programma attuale (può essere vuoto).

Dividi tutto in ARGOMENTI DA STUDIARE, come li chiederebbe il professore all'orale:
- ogni argomento si studia in 30-60 minuti; unisci i pezzi dello stesso argomento che vengono da materiali diversi;
- ordinali in modo didattico: prima le basi, poi gli argomenti che le usano;
- "importanza" = QUANTO VIENE CHIESTO ALL'ESAME:
  3 = tra i più chiesti (argomento centrale, il professore ci insiste o dice "questo lo chiedo", compare nelle domande dei colleghi),
  2 = normale, 1 = chiesto raramente (di contorno, citato di passaggio).
  Sii selettivo: il 3 va solo a circa un quarto degli argomenti, l'1 a quelli davvero marginali;
- "fonti": gli id di TUTTI i materiali che ne parlano, anche se ripetono le stesse cose (poi vengono confrontati e fusi in un'unica scheda);
- "sintesi": una frase che dica di cosa si tratta;
- MANTIENI gli "id" degli argomenti già presenti nel programma attuale quando l'argomento è lo stesso;
  per quelli nuovi usa un id breve in minuscolo con trattini (es. "necrosi-coagulativa").
Rispondi SOLO con JSON: {"argomenti": [{"id": "...", "titolo": "...", "ordine": 1, "importanza": 2, "sintesi": "...", "fonti": ["..."]}]}`,
    },
    (o) => (Array.isArray(o.argomenti) && o.argomenti.length && o.argomenti.every((a) => a.id && a.titolo && Array.isArray(a.fonti)) ? null : "argomenti incompleti"),
  );
  const visti = new Set();
  const argomenti = r.argomenti
    .filter((a) => !visti.has(a.id) && visti.add(a.id))
    .map((a, i) => ({
      id: String(a.id),
      titolo: String(a.titolo),
      ordine: Number(a.ordine) || i + 1,
      importanza: [1, 2, 3].includes(Number(a.importanza)) ? Number(a.importanza) : 2,
      sintesi: String(a.sintesi ?? ""),
      fonti: a.fonti.map(String).filter((f) => idLetti.includes(f)),
    }));
  scriviJson(p.programma, { aggiornato: ora(), basato_su: [...idLetti].sort(), argomenti });
  log(`Programma pronto: ${argomenti.length} argomenti`);
}

// ---------- 3. la scheda di un argomento ----------

/** Tiene "ricerca" e "fonte_web" solo se ci sono davvero. Con soloRicerca restituisce solo quei due campi. */
function conRicerca(v, soloRicerca = false) {
  const extra = {};
  if (typeof v.ricerca === "string" && v.ricerca.trim()) extra.ricerca = v.ricerca.trim();
  if (v.fonte_web && typeof v.fonte_web.titolo === "string") extra.fonte_web = { titolo: v.fonte_web.titolo, url: typeof v.fonte_web.url === "string" ? v.fonte_web.url : undefined };
  if (soloRicerca) return extra;
  const { ricerca, fonte_web, ...resto } = v;
  return { ...resto, ...extra };
}

export async function costruisciScheda(config, radice, esame, argomento, programma) {
  const p = percorsi(radice, esame.slug);
  const fileScheda = path.join(p.schede, `${argomento.id}.json`);
  const vecchia = leggiJson(fileScheda);
  const fonti = argomento.fonti.map((id) => path.join(p.testi, `${id}.txt`)).filter((f) => fs.existsSync(f));
  const altri = programma.argomenti.filter((a) => a.id !== argomento.id).map((a) => `${a.id}: ${a.titolo}`).join("\n");

  log(`Scrivo la scheda: ${argomento.titolo}`);
  const s = await chiediJson(
    config,
    {
      cwd: radice,
      modello: config.modello_schede ?? "veloce",
      strumenti: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"], // il web serve solo a controllare dubbi e contrasti
      maxTurni: 70,
      prompt: `${VIRGILIO}

Scriviamo la scheda di studio dell'argomento "${argomento.titolo}" per l'esame ${esame.tipo} di ${esame.nome}.
(${argomento.sintesi})

Leggi con attenzione questi materiali dello studente (testo semplice, con [Pagina N] o [ore:minuti:secondi] per indicare dove sei).
Se sono lunghi non leggerli tutti: cerca con Grep le parole dell'argomento e leggi con offset e limit le parti che lo riguardano, comprese quelle vicine:
${fonti.map((f) => "- " + f).join("\n") || "- (nessun materiale: usa le conoscenze mediche standard e segnalalo nelle verifiche)"}

Le trascrizioni delle lezioni sono automatiche: correggi i termini sentiti male, ma NON cambiare il senso di quello che dice il professore.

INTEGRAZIONE DEI MATERIALI (la funzione più importante): lo stesso argomento compare spesso in più materiali (lezioni diverse, sbobine di colleghi,
PDF rifatti, foto). Prima di scrivere:
- leggi TUTTE le parti che riguardano l'argomento in OGNI materiale elencato (usa Grep con più parole chiave per ciascuno, anche sinonimi e termini vicini);
- confronta i passaggi: se dicono la STESSA cosa, tieni UNA sola versione (la più chiara e completa) e scarta l'altra;
  se si sovrappongono solo in parte, tieni il pezzo comune una volta sola e aggiungi quello che c'è in uno solo;
  se un materiale ha dettagli che gli altri non hanno, integrali nel punto giusto del discorso;
- se due materiali si CONTRADDICONO, non scegliere in silenzio: tieni la versione del professore e segnala il contrasto;
- il "dettaglio" deve essere UN testo unico, ordinato e senza ripetizioni, che contiene tutto quello che sta nei materiali: nessun concetto in meno;
- compila "integrazione" come resoconto onesto di ciò che hai fatto: per ogni gruppo di passaggi, di che tipo era e da quali materiali veniva.

CONTROLLO DEI DUBBI: per ogni "dubbio" (nelle verifiche) e per ogni "contrasto" (nell'integrazione) fai una ricerca sul web con WebSearch
(fonti mediche affidabili: Robbins e altri libri di testo, classificazioni WHO, società scientifiche, articoli di revisione; al massimo 4 ricerche per scheda).
Poi scrivi in "ricerca" cosa hai trovato, in una o due frasi chiare: chi ha ragione e perché (es. "Il professore ha ragione: il carcinoma adenoideo cistico
è di consistenza dura; 'molliccia' nella sbobina è un errore"), e in "fonte_web" la fonte (titolo e url).
Nel "dettaglio" usa la versione giusta; se il professore ha detto diversamente, ricordalo con una nota breve, perché all'orale conta anche lui.

La scheda segue le 5 tappe del metodo:
1. "semplice": 3-5 righe per capire SUBITO il concetto, senza paroloni. "analogia": un paragone di vita quotidiana (facoltativo).
2. "schema": lo scheletro da usare all'orale. Per una malattia/lesione usa le voci: Definizione, Cause (eziologia), Meccanismo (patogenesi),
   Aspetto macroscopico, Aspetto microscopico, Clinica, Complicanze e prognosi. Per altri argomenti scegli voci adatte. Ogni voce: poche righe, essenziali.
3. "dettaglio": il contenuto completo dai materiali, in markdown (## titoletti, elenchi con -, **grassetto** per le parole da dire all'esame).
4. "verifiche": controlla i concetti dei materiali.
   - "ok": concetto importante verificato e corretto;
   - "dubbio": nei materiali c'è qualcosa che sembra sbagliato o impreciso (errore del professore o della trascrizione): spiega cosa e indica dove (minuto/pagina);
   - "integrazione": qualcosa di importante che manca nei materiali e che aggiungi tu (dillo chiaramente).
   Metti tutti i dubbi che trovi, 1-3 "ok" sui punti chiave, e le integrazioni solo se servono davvero.
5. "domande": 6-12 domande. "veloce" = domanda breve con risposta di 1-2 righe (diventano flashcard);
   "esame" = come la farebbe il professore all'orale, con la risposta ben fatta (5-10 righe, nell'ordine dello schema).
   Se dai materiali capisci come interroga il professore, imita il suo stile.

Inoltre:
- "parole_chiave": 5-12 termini importanti che compaiono nel testo della scheda. Per ognuno "spiegazione": un approfondimento chiaro di 5-10 righe
  (cosa è, perché conta, un esempio), e "all_esame": come potrebbe chiederlo il professore.
- "pillola": un ripasso da ASCOLTARE di circa un minuto: frasi brevi, schematico, le parole chiave ripetute. Niente simboli, niente elenchi: testo parlato.
- "collegamenti": id di altri argomenti collegati, scelti da questa lista:
${altri || "(nessuno)"}
- "fonti": da quali materiali e dove (minuto o pagina).
- "integrazione": il resoconto della fusione dei materiali: una voce per ogni gruppo di passaggi, con
  "tipo" = "doppione" (stessa cosa in più materiali: ne hai tenuta una sola versione), "integrato" (materiali diversi si completano: li hai uniti)
  o "contrasto" (si contraddicono); "testo" = di cosa si tratta e cosa hai fatto, in una o due frasi;
  "materiali" = gli id dei materiali coinvolti. Se c'è un solo materiale, lascia la lista vuota.

Rispondi SOLO con JSON:
{"titolo": "...", "semplice": "...", "analogia": "...", "schema": [{"voce": "...", "testo": "..."}], "dettaglio": "...",
 "parole_chiave": [{"termine": "...", "spiegazione": "...", "all_esame": "..."}],
 "verifiche": [{"tipo": "ok|dubbio|integrazione", "testo": "...", "fonte": "...", "ricerca": "solo per i dubbi", "fonte_web": {"titolo": "...", "url": "..."}}],
 "domande": [{"domanda": "...", "risposta": "...", "tipo": "veloce|esame"}],
 "collegamenti": ["..."], "fonti": [{"materiale": "...", "dove": "..."}],
 "integrazione": [{"tipo": "doppione|integrato|contrasto", "testo": "...", "materiali": ["..."], "ricerca": "solo per i contrasti", "fonte_web": {"titolo": "...", "url": "..."}}], "pillola": "..."}`,
    },
    (o) =>
      typeof o.semplice === "string" && Array.isArray(o.schema) && typeof o.dettaglio === "string" && Array.isArray(o.domande) && o.domande.length
        ? null
        : "mancano parti della scheda",
  );

  // tengo gli stessi id per le domande uguali, cosi' il ripasso non riparte da zero
  const idVecchi = new Map((vecchia?.domande ?? []).map((d) => [d.domanda.trim().toLowerCase(), d.id]));
  let n = Math.max(0, ...(vecchia?.domande ?? []).map((d) => Number(String(d.id).replace(/\D/g, "")) || 0));
  const domande = s.domande.map((d) => ({
    id: idVecchi.get(String(d.domanda).trim().toLowerCase()) ?? `d${++n}`,
    domanda: String(d.domanda),
    risposta: String(d.risposta),
    tipo: d.tipo === "esame" ? "esame" : "veloce",
  }));
  const titoli = Object.fromEntries(argomento.fonti.map((id) => [id, leggiJson(path.join(p.testi, `${id}.json`), {}).titolo]));

  scriviJson(fileScheda, {
    id: argomento.id,
    titolo: s.titolo || argomento.titolo,
    aggiornata: ora(),
    basata_su: [...argomento.fonti].sort(),
    semplice: s.semplice,
    analogia: s.analogia || undefined,
    schema: s.schema.map((v) => ({ voce: String(v.voce), testo: String(v.testo) })),
    dettaglio: s.dettaglio,
    parole_chiave: (s.parole_chiave ?? []).filter((k) => k.termine && k.spiegazione),
    verifiche: (s.verifiche ?? []).filter((v) => ["ok", "dubbio", "integrazione"].includes(v.tipo)).map((v) => conRicerca(v)),
    domande,
    collegamenti: (s.collegamenti ?? []).filter((c) => programma.argomenti.some((a) => a.id === c)),
    fonti: (s.fonti ?? []).map((f) => ({ materiale: titoli[f.materiale] ?? String(f.materiale ?? ""), dove: f.dove })),
    integrazione: (s.integrazione ?? [])
      .filter((x) => ["doppione", "integrato", "contrasto"].includes(x.tipo) && x.testo)
      .map((x) => ({
        tipo: x.tipo,
        testo: String(x.testo),
        materiali: (Array.isArray(x.materiali) ? x.materiali : []).map((m) => {
          const id = String(m).replace(/^.*[\\/]/, "").replace(/\.(txt|json)$/, "");
          return titoli[id] ?? id;
        }),
        ...conRicerca(x, true),
      })),
    pillola: s.pillola ?? "",
  });
}

// ---------- 4. richieste dal telefono ----------

export async function valutaRipetizione(config, radice, richiesta) {
  const p = percorsi(radice, richiesta.esame);
  const { argomento, titolo, domanda, trascrizione } = richiesta.input;
  const fileScheda = path.join(p.schede, `${argomento}.json`);
  const progressi = leggiJson(path.join(radice, "progressi.json"), {});
  const precedenti = (progressi.argomenti?.[argomento]?.ripetizioni ?? []).map((r) => r.voto).join(", ");

  return chiediJson(
    config,
    {
      cwd: radice,
      modello: "veloce",
      maxTurni: 10,
      prompt: `${VIRGILIO}

Lo studente sta ripetendo ad alta voce l'argomento "${titolo}" come all'orale. Leggi la scheda ${fileScheda} : è il riferimento di quello che deve sapere.
${domanda ? `Stava rispondendo a questa domanda: "${domanda}"` : "Doveva esporre l'argomento in generale."}
${precedenti ? `Voti delle volte precedenti su questo argomento: ${precedenti}.` : ""}

Ecco cosa ha detto (trascrizione automatica dal telefono: può contenere parole sentite male, interpretale dal contesto e non penalizzarle):
"""
${trascrizione}
"""

Valutalo come un buon professore, giusto ed esigente ma umano:
- "voto": da 18 a 30 (come all'università; se è proprio insufficiente usa 15-17);
- "giudizio": 2-4 frasi sincere su com'è andata (ordine logico, completezza, linguaggio tecnico);
- "punti": i punti chiave della scheda${domanda ? " pertinenti alla domanda" : ""}, ognuno con esito "detto", "sbagliato" o "mancante" e una breve "nota" se serve;
- "dillo_meglio": 1-4 frasi che ha detto in modo impreciso, riscritte come andrebbero dette all'esame;
- "domanda_successiva": la domanda che farebbe ora il professore per approfondire o per colmare una lacuna;
- "incoraggiamento": una frase calda e concreta da Virgilio.
Rispondi SOLO con JSON: {"voto": 26, "giudizio": "...", "punti": [{"punto": "...", "esito": "detto", "nota": "..."}], "dillo_meglio": ["..."], "domanda_successiva": "...", "incoraggiamento": "..."}`,
    },
    (o) => (Number.isFinite(Number(o.voto)) && Array.isArray(o.punti) ? null : "manca voto o punti"),
  ).then((o) => ({ ...o, voto: Math.round(Number(o.voto)), dillo_meglio: o.dillo_meglio ?? [] }));
}

export async function penna(config, radice, richiesta) {
  const p = percorsi(radice, richiesta.esame);
  const { argomento, titolo, testo } = richiesta.input;
  const fileScheda = path.join(p.schede, `${argomento}.json`);
  return chiediJson(
    config,
    {
      cwd: radice,
      modello: "veloce",
      strumenti: ["Read", "Grep", "WebSearch", "WebFetch"],
      maxTurni: 20,
      prompt: `${VIRGILIO}

Mentre studia l'argomento "${titolo}", Lo studente ha selezionato questo passaggio e vuole saperne di più:
"""
${testo}
"""
Leggi la scheda ${fileScheda} per il contesto. Poi fai una ricerca approfondita sul passaggio (puoi cercare sul web: preferisci fonti mediche affidabili,
libri di testo, società scientifiche, articoli di revisione). Poi spiegaglielo in modo SEMPLICE:
- "breve": 2 righe per capire subito;
- "approfondimento": 10-15 righe chiare e schematiche (markdown con - per gli elenchi e **grassetto** per i termini chiave), non troppo tecniche;
- "all_esame": come potrebbe chiederlo il professore all'orale e cosa rispondere;
- "nei_tuoi_materiali": true se quello che spieghi è già coerente con la scheda e i materiali, false se aggiungi cose nuove;
- "fonti": le fonti che hai usato (titolo e url).
Rispondi SOLO con JSON: {"breve": "...", "approfondimento": "...", "all_esame": "...", "nei_tuoi_materiali": true, "fonti": [{"titolo": "...", "url": "..."}]}`,
    },
    (o) => (o.breve && o.approfondimento ? null : "manca la spiegazione"),
  );
}

/** Una domanda libera: su un passaggio della scheda (dalla penna) o su qualsiasi cosa (da "Chiedi a Virgilio"). */
export async function domanda(config, radice, richiesta) {
  const p = percorsi(radice, richiesta.esame);
  const { argomento, titolo, passaggio, domanda: testo } = richiesta.input;
  const fileScheda = argomento ? path.join(p.schede, `${argomento}.json`) : null;
  const contesto = [
    passaggio ? `Mentre studiava "${titolo}" ha selezionato questo passaggio: «${passaggio}»` : "",
    fileScheda && fs.existsSync(fileScheda) ? `La scheda dell'argomento è ${fileScheda} : leggila per il contesto.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return chiediJson(
    config,
    {
      cwd: radice,
      modello: "veloce",
      strumenti: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
      maxTurni: 25,
      prompt: `${VIRGILIO}

Lo studente ti fa una domanda.
${contesto}
La domanda è:
"""
${testo}
"""

Dove trovi le sue cose (esame ${richiesta.esame}):
- ${p.programma} : il programma, con gli argomenti e da quali materiali vengono ("fonti");
- ${p.statoMateriali} : l'elenco dei materiali caricati, con i titoli;
- ${p.testi} : il testo di ogni materiale (file .txt; cercaci dentro con Grep, poi leggi con offset e limit);
- ${p.schede} : le schede già scritte.

Come rispondere:
- Se la domanda riguarda i suoi materiali (es. "ho caricato qualcosa su...?", "cosa ha detto il professore su...?"), cerca PRIMA lì e rispondi con precisione:
  quali materiali, dove (pagina o minuto), e in quale argomento del programma è finito.
- Se è un dubbio di contenuto, rispondi prima con quello che c'è nei suoi materiali; se non basta o è poco chiaro, cerca sul web
  (fonti mediche affidabili) e dillo chiaramente.
- Rispondi in modo semplice e diretto, come un tutor che parla: prima la risposta in una o due frasi, poi, se serve, la spiegazione.
- "risposta": markdown semplice (- per gli elenchi, **grassetto** per i termini chiave), al massimo 15 righe;
- "nei_tuoi_materiali": true se la risposta viene dai suoi materiali, false se hai dovuto aggiungere cose da fuori;
- "materiali": i titoli dei suoi materiali che hai usato (anche vuoto);
- "fonti": le fonti esterne usate (titolo e url), vuoto se non ne hai usate.
Rispondi SOLO con JSON: {"risposta": "...", "nei_tuoi_materiali": true, "materiali": ["..."], "fonti": [{"titolo": "...", "url": "..."}]}`,
    },
    (o) => (typeof o.risposta === "string" && o.risposta.trim() ? null : "manca la risposta"),
  );
}

/** Confronta il programma ufficiale dell'esame (incollato dallo studente) con quello che i materiali coprono. */
export async function confrontaProgramma(config, radice, esame, sillabo, programma, idLetti) {
  const p = percorsi(radice, esame.slug);
  const fileSillabo = path.join(cartellaLavoro(), `sillabo-${esame.slug}.txt`);
  fs.writeFileSync(fileSillabo, sillabo.testo);
  const fileArgomenti = path.join(cartellaLavoro(), `argomenti-${esame.slug}.json`);
  fs.writeFileSync(fileArgomenti, JSON.stringify(programma.argomenti.map((a) => ({ id: a.id, titolo: a.titolo, sintesi: a.sintesi, materiali: a.fonti })), null, 1));
  const indici = idLetti.map((id) => {
    const t = leggiJson(path.join(p.testi, `${id}.json`), {});
    return { materiale: id, titolo: t.titolo, indice: t.indice };
  });
  const fileIndici = path.join(cartellaLavoro(), `indici-confronto-${esame.slug}.json`);
  fs.writeFileSync(fileIndici, JSON.stringify(indici, null, 1));

  log("Confronto il programma ufficiale con i materiali…");
  const r = await chiediJson(
    config,
    {
      cwd: radice,
      modello: "veloce",
      prompt: `${VIRGILIO}

Lo studente ha incollato il PROGRAMMA UFFICIALE dell'esame ${esame.tipo} di ${esame.nome}: l'elenco di ciò che può essere chiesto.
Leggi ${fileSillabo} : è il programma ufficiale, scritto dallo studente (può essere un elenco, un testo continuo o un copia-incolla da un sito).
Leggi ${fileArgomenti} : sono gli argomenti di studio che Virgilio ha costruito dai materiali dello studente (con gli id dei materiali).
Leggi ${fileIndici} : sono gli indici dei materiali caricati, per controllare cosa trattano davvero.

Il tuo compito: dire allo studente, voce per voce del programma ufficiale, se i suoi materiali la coprono.
- Dividi il programma ufficiale nelle sue voci (un argomento per voce; se una riga ne contiene più, separali; ignora intestazioni, orari, bibliografia, modalità d'esame).
- Per ogni voce: "stato" = "coperto" (i materiali la trattano in modo sufficiente), "parziale" (se ne parla ma in modo incompleto o di sfuggita) oppure "mancante" (nessun materiale ne parla).
- "argomenti" = gli id degli argomenti di studio che la coprono (vuoto se mancante).
- "nota" = una frase semplice: cosa è coperto e cosa manca; se è mancante o parziale, dì quale materiale conviene caricare (per esempio "serve il capitolo sul fegato del libro").
- Sii ONESTO: non dire "coperto" solo perché le parole si somigliano. Se non sei sicuro, "parziale".
- "extra" = gli id degli argomenti di studio che NON compaiono nel programma ufficiale (potrebbero non servire all'esame).
- "riassunto" = due frasi, in tono caldo e incoraggiante, su dove si è messo lo studente.
Rispondi SOLO con JSON: {"voci": [{"voce": "...", "stato": "coperto", "argomenti": ["id"], "nota": "..."}], "extra": ["id"], "riassunto": "..."}`,
    },
    (o) =>
      Array.isArray(o.voci) && o.voci.length && o.voci.every((v) => v.voce && ["coperto", "parziale", "mancante"].includes(v.stato)) ? null : "voci incomplete",
  );
  const valide = new Set(programma.argomenti.map((a) => a.id));
  const voci = r.voci.map((v) => ({
    voce: String(v.voce),
    stato: v.stato,
    argomenti: (Array.isArray(v.argomenti) ? v.argomenti : []).map(String).filter((id) => valide.has(id)),
    nota: String(v.nota ?? ""),
  }));
  scriviJson(path.join(radice, "esami", esame.slug, "copertura.json"), {
    aggiornata: ora(),
    sillabo_aggiornato: sillabo.aggiornato,
    programma_aggiornato: programma.aggiornato,
    voci,
    extra: (Array.isArray(r.extra) ? r.extra : []).map(String).filter((id) => valide.has(id)),
    riassunto: String(r.riassunto ?? ""),
  });
  log(`Confronto pronto: ${voci.filter((v) => v.stato === "mancante").length} voci mancanti su ${voci.length}`);
}

/** Una domanda che ricorre all'esame: scrive la risposta dai materiali dello studente e, se lui ha scritto la sua, la rivede. */
export async function rispondiRicorrente(config, radice, richiesta) {
  const p = percorsi(radice, richiesta.esame);
  const { domanda: testo, risposta_tua: sua } = richiesta.input;
  const haLaSua = typeof sua === "string" && sua.trim().length > 0;
  log(`Domanda ricorrente: ${String(testo).slice(0, 70)}`);
  return chiediJson(
    config,
    {
      cwd: radice,
      modello: "veloce",
      strumenti: ["Read", "Glob", "Grep"],
      maxTurni: 35,
      prompt: `${VIRGILIO}

Lo studente ha una DOMANDA CHE RICORRE ALL'ESAME ORALE (la fanno spesso). Eccola:
"""
${testo}
"""
${
  haLaSua
    ? `Ha già scritto LA SUA RISPOSTA, quella che secondo lui vuole sentire il professore:
"""
${sua}
"""`
    : "Non ha ancora scritto una sua risposta."
}

Dove trovi le sue cose (esame ${richiesta.esame}):
- ${p.programma} : il programma, con gli argomenti e da quali materiali vengono ("fonti");
- ${p.statoMateriali} : l'elenco dei materiali caricati, con i titoli;
- ${p.testi} : il testo di ogni materiale (file .txt; cercaci dentro con Grep, poi leggi con offset e limit);
- ${p.schede} : le schede già scritte (la parte "dettaglio" e le "domande").

Cosa fare:
1. Cerca nei SUOI materiali (prima le schede, poi i testi con Grep) cosa dice il professore e cosa dicono gli altri materiali su questa domanda. Se il professore dà una risposta precisa o insiste su certi punti, quelli contano più di tutto.
2. "risposta": la risposta da dire all'orale, in italiano parlato, nell'ordine in cui la direbbe un bravo studente (definizione, poi i punti, poi il collegamento clinico). 120-250 parole, frasi brevi, **grassetto** sui termini chiave (markdown semplice). Fedele ai materiali: non inventare.
3. "punti_chiave": 3-7 punti che non devono mancare, in frasi brevi.
4. "fonti": i materiali o le schede che hai usato, con "dove" (pagina o minuto) quando lo sai.
5. "non_nei_materiali": se hai dovuto aggiungere qualcosa che non c'è nei suoi materiali, o non hai trovato qualcosa di importante, dillo qui in una o due frasi; altrimenti stringa vuota.
6. "revisione": ${
  haLaSua
    ? `confronta LA SUA RISPOSTA con i materiali: {"giudizio": due o tre frasi calde e oneste, "corretto": cosa è giusto, "da_aggiungere": cosa manca rispetto ai materiali, "da_correggere": cosa è sbagliato o impreciso (spiega perché), "risposta_migliorata": la sua risposta rivista, nel suo stile ma corretta e completa, senza stravolgerla (parlata, 120-250 parole)}. Se la sua risposta rispecchia il professore (come dicono i materiali), rispettala e correggi solo ciò che è davvero sbagliato.`
    : "null (non ha scritto la sua risposta)"
}.
Rispondi SOLO con JSON: {"risposta": "...", "punti_chiave": ["..."], "fonti": [{"materiale": "...", "dove": "..."}], "non_nei_materiali": "", "revisione": null}`,
    },
    (o) => (typeof o.risposta === "string" && o.risposta.trim() && Array.isArray(o.punti_chiave) ? null : "manca la risposta"),
  );
}
