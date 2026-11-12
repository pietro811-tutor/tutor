import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDati } from "../stato";
import { Icone, TestoRicco, Virgilio } from "../componenti";
import { carteDaRipassare, valutaCarta, VOTI, type Carta } from "../piano";
import { leggi } from "../voce";
import { fineRipasso } from "../virgilio";
import type { Grade } from "ts-fsrs";

export default function Ripasso() {
  const { schede, progressi, aggiornaProgressi } = useDati();
  // la lista si fissa all'inizio della sessione
  const [coda, setCoda] = useState<Carta[] | null>(null);
  const [girata, setGirata] = useState(false);
  const [fatte, setFatte] = useState(0);
  const [modoAscolto, setModoAscolto] = useState(false);
  const [inLettura, setInLettura] = useState(0);
  const ferma = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (coda === null && Object.keys(schede).length) setCoda(carteDaRipassare(schede, progressi));
  }, [schede, coda, progressi]);
  useEffect(() => () => ferma.current?.(), []);

  const carta = coda?.[0];

  function vota(voto: Grade) {
    if (!carta || !coda) return;
    const nuovoStato = valutaCarta(carta, voto);
    aggiornaProgressi((p) => {
      p.carte[carta.id] = JSON.parse(JSON.stringify(nuovoStato));
    });
    const resto = coda.slice(1);
    // se non la sapevi, torna alla fine di questa sessione
    if (+nuovoStato.due - Date.now() < 10 * 60000) resto.push({ ...carta, stato: nuovoStato, nuova: false });
    setCoda(resto);
    setGirata(false);
    setFatte((n) => n + 1);
  }

  function ascoltaTutto() {
    if (!coda?.length) return;
    if (modoAscolto) {
      ferma.current?.();
      setModoAscolto(false);
      return;
    }
    setModoAscolto(true);
    const brani = coda.flatMap((c, i) => [`Domanda ${i + 1}. ${c.domanda.domanda}`, { pausa: 6000 }, `Risposta. ${c.domanda.risposta}`, { pausa: 2500 }]);
    ferma.current = leggi(brani, () => setModoAscolto(false), (i) => setInLettura(Math.floor(i / 4)));
  }

  if (coda === null)
    return (
      <div className="pagina">
        <h1>Ripasso</h1>
        <Virgilio>
          <p>Il ripasso parte quando hai iniziato almeno un argomento: le sue domande veloci diventano carte da ripassare al momento giusto.</p>
        </Virgilio>
        <Link to="/programma" className="btn btn-largo" style={{ marginTop: 16 }}>
          Vai al programma
        </Link>
      </div>
    );

  if (!carta)
    return (
      <div className="pagina">
        <h1>Ripasso</h1>
        <Virgilio>
          <p>
            <strong>{fineRipasso(fatte)}</strong>
          </p>
          <p>Le prossime carte tornano quando stai per dimenticarle: è così che si fissano per sempre.</p>
        </Virgilio>
        <Link to="/" className="btn btn-largo" style={{ marginTop: 16 }}>
          Torna a Oggi
        </Link>
      </div>
    );

  if (modoAscolto) {
    const c = coda[Math.min(inLettura, coda.length - 1)];
    return (
      <div className="pagina">
        <h1>Ripasso in ascolto</h1>
        <p className="tenue">Domanda, qualche secondo per rispondere a mente, poi la risposta. Tieni lo schermo acceso.</p>
        <div className="carta flashcard">
          <div className="etichetta">{c.titoloArgomento}</div>
          <div>{c.domanda.domanda}</div>
        </div>
        <button className="btn btn-tenue btn-largo" onClick={ascoltaTutto}>
          {Icone.stop} Ferma l'ascolto
        </button>
      </div>
    );
  }

  return (
    <div className="pagina">
      <div className="riga-spaziata">
        <h1>Ripasso</h1>
        <button className="btn btn-tenue btn-piccolo" onClick={ascoltaTutto}>
          {Icone.cuffie} Ascolta
        </button>
      </div>
      <p className="tenue piccolo">
        {coda.length} {coda.length === 1 ? "carta" : "carte"} · fatte {fatte}
      </p>
      <button className="carta flashcard carta-cliccabile" onClick={() => setGirata(true)}>
        <div className="etichetta">{carta.titoloArgomento}</div>
        <div>{carta.domanda.domanda}</div>
        {girata ? <TestoRicco testo={carta.domanda.risposta} classe="risposta" /> : <div className="tenue piccolo" style={{ marginTop: 16 }}>Prova a rispondere, poi tocca</div>}
      </button>
      {girata ? (
        <div className="voti">
          {VOTI.map((v) => (
            <button key={v.voto} className={`btn ${v.classe}`} onClick={() => vota(v.voto)}>
              {v.testo}
            </button>
          ))}
        </div>
      ) : (
        <button className="btn btn-largo" onClick={() => setGirata(true)}>
          Mostra la risposta
        </button>
      )}
    </div>
  );
}
