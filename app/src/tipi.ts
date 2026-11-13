// Forma dei file nell'archivio dati. Ogni file ha un solo "scrittore":
// il telefono (T) oppure il motore sul PC (M).

export interface Esame {
  // T  esami/<slug>/esame.json
  slug: string;
  nome: string;
  data_esame?: string; // AAAA-MM-GG
  tipo: "orale" | "scritto" | "quiz";
}

export interface MaterialeMeta {
  // T  esami/<slug>/materiali/<id>.json  (+ il file vero accanto)
  id: string;
  nome: string;
  tipo: "foto" | "audio" | "documento";
  file: string; // nome del file accanto, es. "<id>.jpg"
  gruppo?: string; // foto caricate insieme (pagine dello stesso capitolo)
  caricato: string;
}

export interface VoceIndice {
  titolo: string;
  sintesi: string;
  dove?: string; // pagina, minuto...
}

export interface Testo {
  // M  esami/<slug>/testi/<id>.json
  id: string;
  elaborato: string;
  titolo: string;
  testo: string;
  indice: VoceIndice[];
  avvisi?: string[];
  errore?: string;
}

export interface Argomento {
  id: string;
  titolo: string;
  ordine: number;
  importanza: 1 | 2 | 3; // quanto viene chiesto: se l'hai cambiata tu, qui c'è la tua
  importanza_virgilio?: 1 | 2 | 3; // solo se l'hai cambiata: cosa aveva deciso Virgilio
  sintesi: string;
  fonti: string[]; // id dei materiali
}

export interface ProgrammaUfficiale {
  // T  esami/<slug>/programma-ufficiale.json: l'elenco degli argomenti d'esame, incollato da te
  testo: string;
  aggiornato: string;
}

export interface VoceCopertura {
  voce: string; // una voce del programma ufficiale
  stato: "coperto" | "parziale" | "mancante";
  argomenti: string[]; // gli argomenti di studio che la coprono
  nota: string;
}

export interface Copertura {
  // M  esami/<slug>/copertura.json: il confronto tra il programma ufficiale e i tuoi materiali
  aggiornata: string;
  sillabo_aggiornato: string;
  programma_aggiornato: string;
  voci: VoceCopertura[];
  extra: string[]; // argomenti che hai studiato ma non sono nel programma ufficiale
  riassunto: string;
}

export interface Programma {
  // M  esami/<slug>/programma.json
  aggiornato: string;
  argomenti: Argomento[];
}

export interface Ricerca {
  ricerca?: string; // cosa ha trovato Virgilio cercando sul web
  fonte_web?: { titolo: string; url?: string };
}

export interface Verifica extends Ricerca {
  tipo: "ok" | "dubbio" | "integrazione";
  testo: string;
  fonte?: string;
}

export interface ParolaChiave {
  termine: string;
  spiegazione: string;
  all_esame?: string;
}

export interface Domanda {
  id: string;
  domanda: string;
  risposta: string;
  tipo: "veloce" | "esame";
}

export interface Scheda {
  // M  esami/<slug>/schede/<argomento>.json
  id: string;
  titolo: string;
  aggiornata: string;
  semplice: string;
  analogia?: string;
  schema: { voce: string; testo: string }[];
  dettaglio: string; // markdown semplice
  parole_chiave: ParolaChiave[];
  verifiche: Verifica[];
  domande: Domanda[];
  collegamenti: string[];
  fonti: { materiale: string; dove?: string }[];
  integrazione?: ({ tipo: "doppione" | "integrato" | "contrasto"; testo: string; materiali: string[] } & Ricerca)[];
  pillola: string; // testo da ascoltare
}

export type TipoRichiesta = "valuta_ripetizione" | "penna" | "domanda";

export interface Richiesta {
  // T  richieste/<id>.json
  id: string;
  tipo: TipoRichiesta;
  esame: string;
  creata: string;
  input: Record<string, unknown>;
}

export interface Risposta<O = unknown> {
  // M  risposte/<id>.json
  id: string;
  stato: "in_corso" | "fatta" | "errore";
  aggiornata: string;
  output?: O;
  errore?: string;
  da?: "claude" | "gemini"; // chi ha risposto: Virgilio sul PC oppure Gemini a PC spento
}

export interface Valutazione {
  voto: number;
  giudizio: string;
  punti: { punto: string; esito: "detto" | "sbagliato" | "mancante"; nota?: string }[];
  dillo_meglio: string[];
  domanda_successiva?: string;
  incoraggiamento: string;
}

export interface Approfondimento {
  breve: string;
  approfondimento: string;
  all_esame?: string;
  nei_tuoi_materiali: boolean;
  fonti?: { titolo: string; url?: string }[];
}

export interface RispostaDomanda {
  risposta: string; // markdown semplice
  nei_tuoi_materiali: boolean;
  materiali?: string[];
  fonti?: { titolo: string; url?: string }[];
}

export type Umore = "stanco" | "normale" | "carico";

export interface ProgressoArgomento {
  aperto?: string;
  tappe: number[]; // tappe completate (1-5)
  ripetizioni: { data: string; voto: number; rid?: string }[];
}

export interface GruppoArgomenti {
  // creato da te: un tema o un blocco di studio
  id: string;
  nome: string;
  esame: string; // slug della materia
  argomenti: string[]; // id degli argomenti
}

export interface Lezione {
  // M  esami/<slug>/lezioni/<argomento>.json: il piano della lezione guidata
  id: string;
  aggiornata: string;
  passi: { n: number; titolo: string; testo: string; concetti: string[] }[];
}

export interface Progressi {
  // T  progressi.json
  aggiornato: string;
  nome: string;
  argomenti: Record<string, ProgressoArgomento>;
  carte: Record<string, unknown>; // stato FSRS di ogni flashcard
  checkin: Record<string, Umore>; // per giorno
  giorni_studio: string[];
  stelle?: Record<string, 1 | 2 | 3>; // le stelle che hai deciso tu, al posto di quelle di Virgilio
  gruppi?: GruppoArgomenti[]; // i gruppi di argomenti che hai creato tu
  interrogazioni?: { data: string; voci: { scheda: string; domanda: string; esito: "bene" | "quasi" | "rivediamo" }[] }[];
  richieste: { id: string; tipo: TipoRichiesta; argomento?: string; creata: string; testo?: string }[];
}

export interface StatoMotore {
  // M  motore.json: cosa sta facendo il motore sul PC
  stato: "lavora" | "libero" | "pausa" | "limite";
  cosa?: string;
  aggiornato: string;
  inizio?: string; // quando e' cominciato il lavoro in corso
  media_secondi?: number; // quanto ci mette in media a scrivere una scheda
  audio_da_fare?: number; // quanti audio con la voce di Elsa mancano ancora
}
