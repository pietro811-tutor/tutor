// Evidenzia nel testo la frase che la voce sta leggendo (con l'evidenziatore del browser, senza toccare la pagina).

export interface FraseTempo {
  t: number; // secondo in cui comincia la frase
  testo: string;
}

const carattere = (ch: string) => {
  const c = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /^[a-z0-9]$/.test(c) ? c : "";
};
const normalizza = (t: string) => Array.from(t).map(carattere).join("");

interface Indice {
  radice: Element;
  lunghezza: number;
  norm: string;
  mappa: { nodo: Text; offset: number }[];
}
let cache: Indice | null = null;

function indice(radice: Element): Indice {
  const lunghezza = radice.textContent?.length ?? 0;
  if (cache && cache.radice === radice && cache.lunghezza === lunghezza) return cache;
  const camminatore = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
  let norm = "";
  const mappa: Indice["mappa"] = [];
  for (let n = camminatore.nextNode() as Text | null; n; n = camminatore.nextNode() as Text | null) {
    for (let i = 0; i < n.data.length; i++) {
      const c = carattere(n.data[i]);
      if (c) {
        norm += c;
        mappa.push({ nodo: n, offset: i });
      }
    }
  }
  cache = { radice, lunghezza, norm, mappa };
  return cache;
}

const disponibile = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

export function cancellaEvidenza() {
  if (disponibile()) CSS.highlights.delete("lettura");
}

/** Evidenzia la frase dentro la radice. Ritorna true se l'ha trovata. */
export function evidenziaFrase(radice: Element, frase: string | null): boolean {
  if (!disponibile()) return false;
  if (!frase) {
    cancellaEvidenza();
    return false;
  }
  const { norm, mappa } = indice(radice);
  const f = normalizza(frase);
  if (f.length < 8) return false;
  const testa = f.slice(0, 24);
  const coda = f.slice(-24);
  const inizio = norm.indexOf(testa);
  if (inizio < 0) {
    cancellaEvidenza();
    return false;
  }
  const posCoda = norm.indexOf(coda, inizio);
  const fine = posCoda >= 0 ? posCoda + coda.length : inizio + testa.length;
  const a = mappa[inizio];
  const b = mappa[Math.min(fine, mappa.length) - 1];
  if (!a || !b) return false;
  const intervallo = new Range();
  intervallo.setStart(a.nodo, a.offset);
  intervallo.setEnd(b.nodo, b.offset + 1);
  CSS.highlights.set("lettura", new Highlight(intervallo));
  // se la frase e' fuori dallo schermo, scorro fin li'
  const r = intervallo.getBoundingClientRect();
  if (r.top < 90 || r.bottom > window.innerHeight - 110) window.scrollTo({ top: window.scrollY + r.top - 170, behavior: "smooth" });
  return true;
}

/** Quale frase (indice in `tempi`) c'e' nel punto del testo che hai toccato? */
export function fraseAlPunto(radice: Element, tempi: FraseTempo[], x: number, y: number): number {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let nodo: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    nodo = pos.offsetNode;
    offset = pos.offset;
  } else {
    const r = doc.caretRangeFromPoint?.(x, y);
    if (r) {
      nodo = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!nodo || !radice.contains(nodo)) return -1;
  const { norm, mappa } = indice(radice);
  // il carattere toccato, nell'elenco delle lettere del testo
  const toccato = mappa.findIndex((m) => m.nodo === nodo && m.offset >= offset);
  if (toccato < 0) return -1;
  // dove comincia ogni frase nel testo (si cerca sempre in avanti)
  let da = 0;
  let trovata = -1;
  for (let k = 0; k < tempi.length; k++) {
    const f = normalizza(tempi[k].testo);
    if (f.length < 8) continue;
    const inizio = norm.indexOf(f.slice(0, 24), da);
    if (inizio < 0) continue;
    if (inizio <= toccato) trovata = k;
    else break;
    da = inizio + 1;
  }
  return trovata;
}

/** L'indice della frase che comincia prima (o al) secondo t; -1 se non e' ancora cominciata nessuna. */
export function indiceFraseAl(tempi: FraseTempo[], t: number): number {
  let trovata = -1;
  for (let i = 0; i < tempi.length; i++) {
    if (tempi[i].t <= t + 0.15) trovata = i;
    else break;
  }
  return trovata;
}

/** La frase che comincia prima (o al) secondo t. */
export function fraseAl(tempi: FraseTempo[], t: number): string | null {
  const k = indiceFraseAl(tempi, t);
  return k >= 0 ? tempi[k].testo : null;
}
