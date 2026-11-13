import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDati } from "./stato";
import { cancellaEvidenza, evidenziaFrase, fraseAl } from "./evidenzia";
import { avviaAudio, dimenticaPosizione, leggiScelteVoce, posizioneSalvata, type ControlloAudio } from "./voceScelta";
import type { ParolaChiave } from "./tipi";
import { leggi, type Brano } from "./voce";

// ---------- il volto di Virgilio ----------

export function VoltoVirgilio({ size = 52 }: { size?: number }) {
  return (
    <svg className="virgilio-volto" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="var(--verde)" />
      {/* corona d'alloro */}
      <g fill="none" stroke="#e8d9a8" strokeWidth="2.4" strokeLinecap="round">
        <path d="M14 40c-3-9 0-19 8-24" />
        <path d="M50 40c3-9 0-19-8-24" />
      </g>
      <g fill="#e8d9a8">
        <ellipse cx="13.5" cy="33" rx="2.2" ry="4.2" transform="rotate(-20 13.5 33)" />
        <ellipse cx="15.5" cy="25" rx="2.2" ry="4.2" transform="rotate(25 15.5 25)" />
        <ellipse cx="20.5" cy="18.5" rx="2.2" ry="4.2" transform="rotate(55 20.5 18.5)" />
        <ellipse cx="50.5" cy="33" rx="2.2" ry="4.2" transform="rotate(20 50.5 33)" />
        <ellipse cx="48.5" cy="25" rx="2.2" ry="4.2" transform="rotate(-25 48.5 25)" />
        <ellipse cx="43.5" cy="18.5" rx="2.2" ry="4.2" transform="rotate(-55 43.5 18.5)" />
      </g>
      <text x="32" y="43" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="27" fontWeight="600" fill="#fbf6ee">
        V
      </text>
    </svg>
  );
}

export function Virgilio({ children, firma = true }: { children: ReactNode; firma?: boolean }) {
  return (
    <div className="virgilio">
      <VoltoVirgilio />
      <div className="fumetto">
        {firma && <div className="firma">Virgilio</div>}
        {children}
      </div>
    </div>
  );
}

export const Attesa = () => <span className="attesa" aria-label="attendere" />;

export function Stelle({ n }: { n: number }) {
  return (
    <span className="stelle" aria-label={`importanza ${n} su 3`}>
      {"★".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(3 - n)}</span>
    </span>
  );
}

// ---------- testo con parole chiave toccabili ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Divide una riga in pezzi normali, **grassetto** e *corsivo*. */
function pezziInline(testo: string) {
  const pezzi: { testo: string; stile: "" | "b" | "i" }[] = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*/g;
  let ultimo = 0;
  for (let m = re.exec(testo); m; m = re.exec(testo)) {
    if (m.index > ultimo) pezzi.push({ testo: testo.slice(ultimo, m.index), stile: "" });
    pezzi.push(m[1] != null ? { testo: m[1], stile: "b" } : { testo: m[2], stile: "i" });
    ultimo = re.lastIndex;
  }
  if (ultimo < testo.length) pezzi.push({ testo: testo.slice(ultimo), stile: "" });
  return pezzi;
}

function Riga({ testo, parole, onParola, chiave }: { testo: string; parole: ParolaChiave[]; onParola?: (p: ParolaChiave) => void; chiave: string }) {
  const re = useMemo(
    () => (parole.length ? new RegExp(`(${parole.map((p) => escapeRe(p.termine)).sort((a, b) => b.length - a.length).join("|")})`, "gi") : null),
    [parole],
  );
  const usate = new Set<string>();
  const conParole = (t: string, k: string) => {
    if (!re || !onParola) return t;
    return t.split(re).map((pezzo, i) => {
      const parola = i % 2 ? parole.find((p) => p.termine.toLowerCase() === pezzo.toLowerCase()) : undefined;
      // evidenzio solo la prima volta che compare ogni parola
      if (parola && !usate.has(parola.termine)) {
        usate.add(parola.termine);
        return (
          <span key={k + i} className="parola" role="button" tabIndex={0} onClick={() => onParola(parola)}>
            {pezzo}
          </span>
        );
      }
      return <Fragment key={k + i}>{pezzo}</Fragment>;
    });
  };
  return (
    <>
      {pezziInline(testo).map((p, i) => {
        const k = `${chiave}-${i}-`;
        if (p.stile === "b") return <strong key={k}>{conParole(p.testo, k)}</strong>;
        if (p.stile === "i") return <em key={k}>{conParole(p.testo, k)}</em>;
        return <Fragment key={k}>{conParole(p.testo, k)}</Fragment>;
      })}
    </>
  );
}

/** Markdown semplice: titoli (##), elenchi (-), grassetto (**). */
export function TestoRicco({ testo, parole = [], onParola, classe = "" }: { testo: string; parole?: ParolaChiave[]; onParola?: (p: ParolaChiave) => void; classe?: string }) {
  const blocchi: ReactNode[] = [];
  let elenco: string[] = [];
  const chiudiElenco = (k: number) => {
    if (!elenco.length) return;
    blocchi.push(
      <ul key={"ul" + k}>
        {elenco.map((r, i) => (
          <li key={i}>
            <Riga testo={r} parole={parole} onParola={onParola} chiave={`l${k}-${i}`} />
          </li>
        ))}
      </ul>,
    );
    elenco = [];
  };
  testo.split("\n").forEach((riga, k) => {
    const r = riga.trim();
    if (/^[-*•]\s+/.test(r)) {
      elenco.push(r.replace(/^[-*•]\s+/, ""));
      return;
    }
    chiudiElenco(k);
    if (!r) return;
    if (/^#{1,4}\s/.test(r)) blocchi.push(<h3 key={k}>{r.replace(/^#+\s/, "")}</h3>);
    else
      blocchi.push(
        <p key={k}>
          <Riga testo={r} parole={parole} onParola={onParola} chiave={`p${k}`} />
        </p>,
      );
  });
  chiudiElenco(-1);
  return <div className={"testo-scheda " + classe}>{blocchi}</div>;
}

export function Foglio({ onChiudi, children }: { onChiudi: () => void; children: ReactNode }) {
  return (
    <div className="velo" onClick={onChiudi}>
      <div className="foglio" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="maniglia" />
        {children}
      </div>
    </div>
  );
}

// ---------- icone ----------

const icona = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
export const Icone = {
  oggi: icona(<path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />),
  programma: icona(
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </>,
  ),
  ripasso: icona(
    <>
      <rect x="4" y="5" width="14" height="11" rx="2" />
      <path d="M8 19h11a1 1 0 0 0 1-1V9" />
    </>,
  ),
  carica: icona(
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>,
  ),
  microfono: icona(
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>,
  ),
  stop: icona(<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />),
  cuffie: icona(
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </>,
  ),
  penna: icona(<path d="m15 5 4 4L8 20H4v-4zM13 7l4 4" />),
  indietro: icona(<path d="M15 5l-7 7 7 7" />),
};

/**
 * Legge ad alta voce: con l'audio buono preparato dal PC se c'e' (audioId), altrimenti con la voce del telefono.
 * Con l'audio buono c'e' la pausa vera: riprendi da dove eri, anche se esci e torni.
 */
export function BottoneLeggi({ brani, etichetta = "Leggimelo", audioId }: { brani: () => Brano[]; etichetta?: string; audioId?: string }) {
  const { audio, caricaAudio, caricaTempi } = useDati();
  const [fase, setFase] = useState<"fermo" | "carico" | "suona" | "pausa">("fermo");
  const [daRiprendere, setDaRiprendere] = useState(false);
  const controllo = useRef<ControlloAudio | null>(null);
  const fermaVoceTelefono = useRef<(() => void) | null>(null);
  const voceUsata = useRef("");
  const conAudio = !!audioId && Object.keys(audio[audioId] ?? {}).length > 0;

  const chiaveAudio = (voce: string) => `${audioId}.${voce}`;
  useEffect(() => {
    if (!conAudio || !audioId) return;
    const v = leggiScelteVoce().voce;
    const voce = audio[audioId][v] ? v : Object.keys(audio[audioId])[0];
    setDaRiprendere(posizioneSalvata(chiaveAudio(voce)) > 3);
  }, [conAudio, audioId, fase]); // eslint-disable-line react-hooks/exhaustive-deps
  // uscendo dalla pagina l'audio si ferma ma ricorda il punto
  useEffect(
    () => () => {
      controllo.current?.ferma();
      fermaVoceTelefono.current?.();
      cancellaEvidenza();
    },
    [],
  );
  if (!conAudio && typeof speechSynthesis === "undefined") return null;

  const alTermine = () => {
    controllo.current = null;
    fermaVoceTelefono.current = null;
    cancellaEvidenza();
    setFase("fermo");
  };

  async function premi() {
    if (fase === "carico") return;
    if (fase === "suona") {
      if (controllo.current) {
        controllo.current.pausa();
        setFase("pausa");
      } else {
        fermaVoceTelefono.current?.();
        alTermine();
      }
      return;
    }
    if (fase === "pausa" && controllo.current) {
      controllo.current.riprendi();
      setFase("suona");
      return;
    }
    if (conAudio && audioId) {
      const scelte = leggiScelteVoce();
      const voce = audio[audioId][scelte.voce] ? scelte.voce : Object.keys(audio[audioId])[0];
      voceUsata.current = voce;
      setFase("carico");
      const url = await caricaAudio(audioId, voce);
      if (url) {
        // se il PC ha annotato le frasi, evidenzio nel testo quella che si sta leggendo
        const tempi = await caricaTempi(audioId, voce);
        const radice = document.querySelector("[data-leggibile]");
        let ultima: string | null = null;
        const alTempo =
          tempi?.length && radice
            ? (t: number) => {
                const f = fraseAl(tempi, t);
                if (f !== ultima) {
                  ultima = f;
                  evidenziaFrase(radice, f);
                }
              }
            : undefined;
        controllo.current = await avviaAudio(url, scelte, alTermine, { chiave: chiaveAudio(voce), alTempo });
        setFase("suona");
        return;
      }
    }
    setFase("suona");
    fermaVoceTelefono.current = leggi(brani(), alTermine);
  }

  function daCapo() {
    controllo.current?.ferma();
    if (audioId) dimenticaPosizione(chiaveAudio(voceUsata.current || leggiScelteVoce().voce));
    alTermine();
  }

  const testo =
    fase === "carico" ? "Un attimo…" : fase === "suona" ? "⏸ Pausa" : fase === "pausa" || daRiprendere ? "▶ Riprendi" : `${"▶ "}${etichetta}`;
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button className="btn btn-tenue btn-piccolo" onClick={premi}>
        {testo}
      </button>
      {(fase === "pausa" || (fase === "fermo" && daRiprendere)) && (
        <button className="btn btn-tenue btn-piccolo" onClick={daCapo} aria-label="Ricomincia da capo">
          ↺ Da capo
        </button>
      )}
    </span>
  );
}
