// Controllo veloce di una risposta a voce: confronta quello che hai detto con i punti della risposta giusta.
// Funziona sul telefono, subito, senza internet e senza intelligenza artificiale: e' un primo giudizio,
// la correzione precisa la fa Virgilio dal PC se la chiedi.

const PAROLE_VUOTE = new Set(
  (
    "a ad al allo alla ai agli alle anche che chi ci come con cui da dal dallo dalla dai dagli dalle dei del dello della degli delle di " +
    "e ed ha hanno ho i il in io la le lo lui lei loro ma mi ne nel nello nella nei negli nelle noi non o per piu poi quando quasi " +
    "quello quella quelli quelle questo questa questi queste se si sia sono su sul sullo sulla sui sugli sulle suo sua suoi sue " +
    "tra fra tu un uno una the e' è essere avere fare viene vengono puo possono sempre solo spesso molto poco ogni altri altre " +
    "altro altra cosi quindi cioe dove dopo prima poiche perche mentre invece oppure ovvero ossia detto detta detti dette circa " +
    "guardiamo attenzione vedono vedi vede segue scompare rimane rimangono compare appaiono appare distinguere distinguerla distinguerle conta contare ricorda ricordati ricordare soprattutto generalmente particolarmente solitamente normalmente raramente frequentemente tipo tipici tipica tipico tipiche anche gia ancora piu meno tutti tutte tutto tutta stato stata stati state sia siano"
  ).split(" "),
);

const senzaAccenti = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Le parole che contano di un testo, nella forma originale e come "radice" per il confronto. */
export function paroleChiave(testo: string): { originale: string; radice: string }[] {
  const fuori: { originale: string; radice: string }[] = [];
  for (const originale of testo.split(/[^A-Za-zÀ-ÿ0-9°]+/).filter(Boolean)) {
    const p = senzaAccenti(originale);
    if (PAROLE_VUOTE.has(p)) continue;
    if (p.length < 3 && !/\d/.test(p)) continue;
    fuori.push({ originale, radice: radice(p) });
  }
  return fuori;
}

const radice = (p: string) => (p.length >= 9 ? p.slice(0, 6) : p.length >= 6 ? p.slice(0, 5) : p);

function simili(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return distanza1(a, b);
}

function distanza1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

export interface EsitoVeloce {
  copertura: number; // da 0 a 1
  verdetto: "bene" | "quasi" | "rivediamo";
  dette: string[];
  mancanti: string[];
}

/**
 * domanda: la domanda (le sue parole non contano: non devi ripeterle)
 * giusta: la risposta giusta della scheda
 * detto: quello che hai detto (trascrizione)
 */
export function controlloVeloce(domanda: string, giusta: string, detto: string): EsitoVeloce {
  const nellaDomanda = new Set(paroleChiave(domanda).map((x) => x.radice));
  const attese: { originale: string; radice: string; peso: number }[] = [];
  const viste = new Set<string>();
  const senzaParentesi = giusta.replace(/\([^)]*\)/g, " ");
  for (const k of paroleChiave(senzaParentesi)) {
    if (nellaDomanda.has(k.radice) || viste.has(k.radice)) continue;
    viste.add(k.radice);
    attese.push({ ...k, peso: k.originale.length >= 9 ? 3 : k.originale.length >= 6 ? 2 : 1 }); // le parole lunghe sono quasi sempre i termini tecnici
  }
  const dette = paroleChiave(detto).map((x) => x.radice);
  const presente = (r: string) => dette.some((d) => simili(d, r));

  let totale = 0;
  let presi = 0;
  const trovate: string[] = [];
  const mancanti: string[] = [];
  for (const a of attese) {
    totale += a.peso;
    if (presente(a.radice)) {
      presi += a.peso;
      trovate.push(a.originale);
    } else mancanti.push(a.originale);
  }
  const copertura = totale ? presi / totale : 0;
  // meno parole attese = risposta breve: bastano meno per dire "bene"
  const soglia = attese.length <= 4 ? 0.6 : 0.62;
  const verdetto = copertura >= soglia ? "bene" : copertura >= 0.32 ? "quasi" : "rivediamo";
  return {
    copertura,
    verdetto,
    dette: trovate.slice(0, 8),
    mancanti: mancanti.sort((x, y) => y.length - x.length).slice(0, 6),
  };
}
