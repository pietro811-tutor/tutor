// Riserva gratuita quando il PC e' spento: il telefono chiede direttamente a Gemini
// (piano gratuito di Google AI Studio). Nel piano gratuito Google puo' usare i dati inviati.

import type { RispostaDomanda, Approfondimento, Scheda, Valutazione } from "./tipi";

const CHIAVE = "tutor:gemini";
const CHIAVE_MODELLI = "tutor:gemini-modelli";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const leggiChiaveGemini = () => {
  try {
    return localStorage.getItem(CHIAVE) ?? "";
  } catch {
    return "";
  }
};
export const salvaChiaveGemini = (k: string) => {
  try {
    if (k) localStorage.setItem(CHIAVE, k);
    else localStorage.removeItem(CHIAVE);
    localStorage.removeItem(CHIAVE_MODELLI);
  } catch {
    /* niente */
  }
};

export class ErroreGemini extends Error {}

const versione = (nome: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(nome)?.[1] ?? 0);

/** Sceglie da solo i modelli Flash migliori disponibili per questa chiave (cambiano spesso). */
export async function modelliGemini(chiave: string): Promise<string[]> {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE_MODELLI) ?? "null") as { quando: number; lista: string[] } | null;
    if (salvati && Date.now() - salvati.quando < 7 * 86400000) return salvati.lista;
  } catch {
    /* ricalcolo */
  }
  const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(chiave)}`);
  if (r.status === 400 || r.status === 403) throw new ErroreGemini("La chiave Gemini non è valida.");
  if (!r.ok) throw new ErroreGemini(`Gemini non risponde (${r.status}).`);
  const dati = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const nomi = (dati.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/image|tts|audio|live|embedding|exp/.test(n));
  const ordina = (lista: string[]) =>
    lista.sort((a, b) => versione(b) - versione(a) || Number(a.includes("preview")) - Number(b.includes("preview")) || a.length - b.length);
  // prima i Flash (piu' bravi), poi i Flash-Lite (riserva se finiscono le richieste)
  const lista = [...ordina(nomi.filter((n) => !n.includes("lite"))).slice(0, 2), ...ordina(nomi.filter((n) => n.includes("lite"))).slice(0, 2)];
  if (!lista.length) throw new ErroreGemini("Nessun modello Gemini disponibile con questa chiave.");
  localStorage.setItem(CHIAVE_MODELLI, JSON.stringify({ quando: Date.now(), lista }));
  return lista;
}

async function chiedi(chiave: string, prompt: string, { cerca = false } = {}): Promise<string> {
  const modelli = await modelliGemini(chiave);
  let ultimoErrore = "";
  for (const modello of modelli) {
    const corpo = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: cerca ? {} : { responseMimeType: "application/json" },
      ...(cerca ? { tools: [{ google_search: {} }] } : {}),
    };
    const r = await fetch(`${BASE}/models/${modello}:generateContent?key=${encodeURIComponent(chiave)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (r.ok) {
      const dati = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const testo = (dati.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (testo) return testo;
      ultimoErrore = "risposta vuota";
      continue;
    }
    ultimoErrore = r.status === 429 ? "finite le richieste gratuite di oggi" : `errore ${r.status}`;
    // 429 = limite gratuito: provo il modello successivo (piu' leggero)
    if (r.status !== 429 && r.status < 500) break;
  }
  throw new ErroreGemini(`Gemini non ce l'ha fatta (${ultimoErrore}).`);
}

function estraiJson<T>(testo: string): T {
  const pulito = testo.replace(/```(?:json)?/g, "");
  const inizio = pulito.indexOf("{");
  const fine = pulito.lastIndexOf("}");
  if (inizio < 0 || fine <= inizio) throw new ErroreGemini("Gemini ha risposto in modo strano, riprova.");
  return JSON.parse(pulito.slice(inizio, fine + 1)) as T;
}

const VIRGILIO = `Sei Virgilio, il tutor personale di uno studente universitario che prepara un esame orale.
Carattere: caldo, incoraggiante, un po' ironico con garbo; parli al "noi"; sei esigente quando valuti ma non fai mai sentire in colpa.
Scrivi in italiano semplice e chiaro, frasi brevi. Lo studente deve portare all'esame quello che c'è nei SUOI materiali:
resta fedele alla scheda; se aggiungi qualcosa che non c'è, dillo. Non inventare mai.`;

const schedaInBreve = (s: Scheda) =>
  JSON.stringify({ titolo: s.titolo, semplice: s.semplice, schema: s.schema, dettaglio: s.dettaglio, domande: s.domande.filter((d) => d.tipo === "esame") });

export async function valutaConGemini(
  chiave: string,
  scheda: Scheda,
  input: { domanda?: string | null; trascrizione: string },
  votiPrecedenti: number[],
): Promise<Valutazione> {
  const testo = await chiedi(
    chiave,
    `${VIRGILIO}

Lo studente sta ripetendo ad alta voce l'argomento "${scheda.titolo}" come all'orale. Questa è la scheda di riferimento (JSON):
${schedaInBreve(scheda)}

${input.domanda ? `Stava rispondendo a questa domanda: "${input.domanda}"` : "Doveva esporre l'argomento in generale."}
${votiPrecedenti.length ? `Voti delle volte precedenti: ${votiPrecedenti.join(", ")}.` : ""}

Ecco cosa ha detto (trascrizione automatica dal telefono: può contenere parole sentite male, interpretale dal contesto e non penalizzarle):
"""
${input.trascrizione}
"""

Valutalo come un buon professore, giusto ed esigente ma umano:
- "voto": da 18 a 30 (se è proprio insufficiente 15-17);
- "giudizio": 2-4 frasi sincere (ordine logico, completezza, linguaggio tecnico);
- "punti": i punti chiave della scheda${input.domanda ? " pertinenti alla domanda" : ""}, ognuno con "esito" "detto", "sbagliato" o "mancante" e una breve "nota" se serve;
- "dillo_meglio": 1-4 frasi dette in modo impreciso, riscritte come andrebbero dette all'esame;
- "domanda_successiva": la domanda che farebbe ora il professore;
- "incoraggiamento": una frase calda e concreta.
Rispondi SOLO con JSON: {"voto": 26, "giudizio": "...", "punti": [{"punto": "...", "esito": "detto", "nota": "..."}], "dillo_meglio": ["..."], "domanda_successiva": "...", "incoraggiamento": "..."}`,
  );
  const v = estraiJson<Valutazione>(testo);
  if (!Number.isFinite(Number(v.voto)) || !Array.isArray(v.punti)) throw new ErroreGemini("Valutazione incompleta, riprova.");
  return { ...v, voto: Math.round(Number(v.voto)), dillo_meglio: v.dillo_meglio ?? [] };
}

export async function pennaConGemini(chiave: string, scheda: Scheda, selezione: string): Promise<Approfondimento> {
  const prompt = `${VIRGILIO}

Mentre studia l'argomento "${scheda.titolo}", lo studente ha selezionato questo passaggio e vuole saperne di più:
"""
${selezione}
"""
Contesto, la sua scheda: ${schedaInBreve(scheda)}

Cerca informazioni affidabili (libri di testo, società scientifiche, articoli di revisione) e spiegaglielo in modo SEMPLICE:
- "breve": 2 righe per capire subito;
- "approfondimento": 10-15 righe chiare e schematiche (markdown con - per gli elenchi e **grassetto** per i termini chiave);
- "all_esame": come potrebbe chiederlo il professore all'orale e cosa rispondere;
- "nei_tuoi_materiali": true se è coerente con la scheda, false se aggiungi cose nuove;
- "fonti": le fonti usate (titolo e url).
Rispondi SOLO con JSON: {"breve": "...", "approfondimento": "...", "all_esame": "...", "nei_tuoi_materiali": true, "fonti": [{"titolo": "...", "url": "..."}]}`;
  let testo: string;
  try {
    testo = await chiedi(chiave, prompt, { cerca: true });
  } catch {
    testo = await chiedi(chiave, prompt); // senza ricerca web, se non e' disponibile
  }
  const a = estraiJson<Approfondimento>(testo);
  if (!a.breve || !a.approfondimento) throw new ErroreGemini("Spiegazione incompleta, riprova.");
  return a;
}

export async function domandaConGemini(
  chiave: string,
  { domanda, passaggio, scheda, argomenti }: { domanda: string; passaggio?: string; scheda?: Scheda; argomenti: string[] },
): Promise<RispostaDomanda> {
  const prompt = `${VIRGILIO}

Lo studente ti fa una domanda${scheda ? ` mentre studia "${scheda.titolo}"` : ""}.
${passaggio ? `Ha selezionato questo passaggio: «${passaggio}»` : ""}
${scheda ? `La sua scheda: ${schedaInBreve(scheda)}` : ""}
Gli argomenti del suo programma (tratti dai suoi materiali): ${argomenti.join("; ") || "(nessuno)"}
La domanda è: """${domanda}"""

Non puoi leggere i suoi materiali completi: se chiede cosa ha caricato, rispondi in base agli argomenti del programma e dillo.
Per un dubbio di contenuto puoi cercare fonti mediche affidabili. Rispondi in modo semplice e diretto, al massimo 15 righe.
Rispondi SOLO con JSON: {"risposta": "markdown semplice", "nei_tuoi_materiali": true, "materiali": [], "fonti": [{"titolo": "...", "url": "..."}]}`;
  let testo: string;
  try {
    testo = await chiedi(chiave, prompt, { cerca: true });
  } catch {
    testo = await chiedi(chiave, prompt);
  }
  const r = estraiJson<RispostaDomanda>(testo);
  if (!r.risposta) throw new ErroreGemini("Risposta incompleta, riprova.");
  return r;
}
