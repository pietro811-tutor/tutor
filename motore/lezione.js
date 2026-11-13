// La lezione guidata: divide il "dettaglio" di una scheda in pezzi (un paragrafo alla volta), e per ogni pezzo
// sceglie i concetti che lo studente deve ripetere a voce. Non usa Claude: lavora sul testo che c'è già.

const MAX_PEZZO = 1500; // caratteri: oltre, si spezza
const MIN_PEZZO = 420; // sotto, si unisce al pezzo dopo
const OBIETTIVO = 950; // si spezza volentieri qui

const pulisci = (t) => String(t).replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

/** Un elenco parlato: "A, B e C". */
export const elencoParlato = (v) => (v.length <= 1 ? v.join("") : `${v.slice(0, -1).join(", ")} e ${v[v.length - 1]}`);

function concettiDi(testo, scheda) {
  const visti = new Set();
  const lista = [];
  const aggiungi = (c) => {
    const t = pulisci(c).replace(/[.;:,]+$/, "");
    const chiave = t.toLowerCase();
    if (t.length < 3 || t.length > 55 || visti.has(chiave)) return;
    visti.add(chiave);
    lista.push(t);
  };
  for (const m of testo.matchAll(/\*\*([^*]+)\*\*/g)) aggiungi(m[1]);
  // pochi grassetti: aggiungo le parole chiave della scheda che compaiono in questo pezzo
  if (lista.length < 3) {
    const minuscolo = testo.toLowerCase();
    for (const p of scheda.parole_chiave ?? []) {
      const nome = pulisci(p.termine).replace(/\s*\(.*\)\s*$/, "");
      if (nome.length >= 4 && minuscolo.includes(nome.toLowerCase())) aggiungi(nome);
    }
  }
  return lista.slice(0, 5);
}

/** Il piano della lezione: [{ n, titolo, testo, concetti }] */
export function pianoLezione(scheda) {
  // 1. blocchi per titolo
  const blocchi = [];
  let titolo = scheda.titolo;
  let righe = [];
  const chiudi = () => {
    const testo = righe.join("\n").trim();
    if (testo) blocchi.push({ titolo, righe: righe.filter((r) => r.trim()) });
    righe = [];
  };
  for (const r of String(scheda.dettaglio ?? "").split("\n")) {
    const m = r.match(/^#{1,4}\s+(.*)$/);
    if (m) {
      chiudi();
      titolo = pulisci(m[1]);
    } else righe.push(r);
  }
  chiudi();

  // 2. si spezzano i blocchi lunghi tra una riga e l'altra
  let pezzi = [];
  for (const b of blocchi) {
    let corrente = [];
    let lunghezza = 0;
    let parte = 0;
    const taglia = () => {
      if (!corrente.length) return;
      pezzi.push({ titolo: parte ? `${b.titolo} (continua)` : b.titolo, testo: corrente.join("\n") });
      parte++;
      corrente = [];
      lunghezza = 0;
    };
    for (const r of b.righe) {
      if (lunghezza >= OBIETTIVO || (lunghezza > 0 && lunghezza + r.length > MAX_PEZZO)) taglia();
      corrente.push(r);
      lunghezza += r.length;
    }
    taglia();
  }

  // 3. i pezzi troppo corti si uniscono al successivo
  const uniti = [];
  for (let i = 0; i < pezzi.length; i++) {
    let p = pezzi[i];
    while (p.testo.length < MIN_PEZZO && i + 1 < pezzi.length && p.testo.length + pezzi[i + 1].testo.length <= MAX_PEZZO + 300) {
      const dopo = pezzi[++i];
      p = { titolo: p.titolo, testo: `${p.testo}\n\n${dopo.testo}` };
    }
    uniti.push(p);
  }

  return uniti.map((p, i) => ({ n: i + 1, titolo: p.titolo, testo: p.testo, concetti: concettiDi(p.testo, scheda) }));
}
