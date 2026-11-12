import { createEmptyCard, fsrs, generatorParameters, Rating, TypeConvert, type Card, type Grade } from "ts-fsrs";
import type { Argomento, Domanda, Progressi, Scheda, Umore } from "./tipi";
import { oggi } from "./stato";

// ---------- stato di ogni argomento (i colori della mappa) ----------

export type Livello = 0 | 1 | 2 | 3; // grigio, rosso, giallo, verde

export const NOMI_LIVELLO = ["Da iniziare", "Iniziato", "Quasi", "Lo sai"] as const;

export const GRUPPI_IMPORTANZA: { importanza: 1 | 2 | 3; titolo: string; descrizione: string }[] = [
  { importanza: 3, titolo: "I più chiesti", descrizione: "Escono quasi sempre: prima questi." },
  { importanza: 2, titolo: "Normali", descrizione: "Possono uscire: vanno saputi bene." },
  { importanza: 1, titolo: "Meno chiesti", descrizione: "Escono di rado: basta l'essenziale." },
];

export function livello(p: Progressi, id: string): Livello {
  const a = p.argomenti[id];
  if (!a || (!a.aperto && a.tappe.length === 0)) return 0;
  const voto = a.ripetizioni.at(-1)?.voto;
  if (voto != null && voto >= 25) return 3;
  if (voto != null || a.tappe.length >= 5) return 2;
  return 1;
}

export const completato = (p: Progressi, id: string) => livello(p, id) >= 2;

// ---------- piano fino all'esame ----------

export const GIORNI_RIPASSO_FINALE = 5;

export function giorniAllEsame(data?: string) {
  if (!data) return null;
  const fine = new Date(data + "T00:00:00");
  const inizio = new Date(oggi() + "T00:00:00");
  return Math.round((fine.getTime() - inizio.getTime()) / 86400000);
}

export interface PianoOggi {
  giorni: number | null;
  faseRipasso: boolean;
  argomentiOggi: Argomento[];
  perGiorno: number;
  mancanti: number;
}

export function pianoDiOggi(argomenti: Argomento[], p: Progressi, dataEsame: string | undefined, umore?: Umore): PianoOggi {
  // prima i piu' chiesti all'esame, poi i normali, poi i meno chiesti; dentro ogni gruppo l'ordine didattico
  const ordinati = [...argomenti].sort((a, b) => b.importanza - a.importanza || a.ordine - b.ordine);
  const daFare = ordinati.filter((a) => !completato(p, a.id));
  const giorni = giorniAllEsame(dataEsame);
  const faseRipasso = giorni != null && giorni <= GIORNI_RIPASSO_FINALE;
  const giorniStudio = giorni == null ? 20 : Math.max(1, giorni - GIORNI_RIPASSO_FINALE);
  let perGiorno = Math.max(1, Math.ceil(daFare.length / giorniStudio));
  if (umore === "stanco") perGiorno = 1;
  if (umore === "carico") perGiorno += 1;
  // prima quelli gia' iniziati, poi i nuovi nell'ordine del programma
  const iniziati = daFare.filter((a) => livello(p, a.id) === 1);
  const nuovi = daFare.filter((a) => livello(p, a.id) === 0);
  return {
    giorni,
    faseRipasso,
    argomentiOggi: [...iniziati, ...nuovi].slice(0, perGiorno),
    perGiorno,
    mancanti: daFare.length,
  };
}

// ---------- flashcard con ripasso a intervalli (FSRS) ----------

const motoreFsrs = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));
export const NUOVE_AL_GIORNO = 20;

export interface Carta {
  id: string; // argomento:domanda
  argomento: string;
  titoloArgomento: string;
  domanda: Domanda;
  stato: Card;
  nuova: boolean;
}

export function tutteLeCarte(schede: Record<string, Scheda>, p: Progressi): Carta[] {
  const carte: Carta[] = [];
  for (const s of Object.values(schede)) {
    // le carte di un argomento arrivano solo dopo averlo iniziato
    if (livello(p, s.id) === 0) continue;
    for (const d of s.domande.filter((d) => d.tipo === "veloce")) {
      const id = `${s.id}:${d.id}`;
      const salvata = p.carte[id];
      carte.push({
        id,
        argomento: s.id,
        titoloArgomento: s.titolo,
        domanda: d,
        stato: salvata ? TypeConvert.card(salvata as Card) : createEmptyCard(new Date()),
        nuova: !salvata,
      });
    }
  }
  return carte;
}

export function carteDaRipassare(schede: Record<string, Scheda>, p: Progressi, limite = 60): Carta[] {
  const adesso = new Date();
  const carte = tutteLeCarte(schede, p);
  const scadute = carte.filter((c) => !c.nuova && c.stato.due <= adesso).sort((a, b) => +a.stato.due - +b.stato.due);
  const nuoveFatteOggi = Object.values(p.carte).filter((c) => {
    const card = c as { reps?: number; last_review?: string | Date };
    if (card.reps !== 1 || !card.last_review) return false;
    return new Date(card.last_review).toDateString() === new Date().toDateString();
  }).length;
  const nuove = carte.filter((c) => c.nuova).slice(0, Math.max(0, NUOVE_AL_GIORNO - nuoveFatteOggi));
  return [...scadute, ...nuove].slice(0, limite);
}

export const VOTI: { voto: Grade; testo: string; classe: string }[] = [
  { voto: Rating.Again, testo: "Non la sapevo", classe: "voto-0" },
  { voto: Rating.Hard, testo: "Difficile", classe: "voto-1" },
  { voto: Rating.Good, testo: "Bene", classe: "voto-2" },
  { voto: Rating.Easy, testo: "Facile", classe: "voto-3" },
];

export function valutaCarta(carta: Carta, voto: Grade): Card {
  return motoreFsrs.next(carta.stato, new Date(), voto).card;
}
