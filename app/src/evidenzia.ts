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

/** La frase che comincia prima (o al) secondo t. */
export function fraseAl(tempi: FraseTempo[], t: number): string | null {
  let trovata = -1;
  for (let i = 0; i < tempi.length; i++) {
    if (tempi[i].t <= t + 0.15) trovata = i;
    else break;
  }
  return trovata >= 0 ? tempi[trovata].testo : null;
}
