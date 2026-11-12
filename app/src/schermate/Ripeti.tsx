import { useEffect, useRef, useState } from "react";
import { useDati } from "../stato";
import { Attesa, Icone, TestoRicco, Virgilio } from "../componenti";
import { ascolta, ascoltoDisponibile, leggi, type Ascolto } from "../voce";
import { commentoVoto } from "../virgilio";
import { leggiChiaveGemini } from "../gemini";
import type { Risposta, Scheda, Valutazione } from "../tipi";

const SEGNI = { detto: "✅", sbagliato: "❌", mancante: "⬜" };

export function testoAttesa(risposta?: Risposta) {
  if (risposta?.stato === "in_corso" && risposta.da === "gemini") return "Il PC sembra spento: chiedo a Gemini…";
  if (risposta?.stato === "in_corso") return "Virgilio ci sta pensando…";
  if (leggiChiaveGemini()) return "Aspetto il PC… se non risponde entro mezzo minuto, chiedo a Gemini.";
  return "In attesa del PC. Se è spento, ci penso appena si accende: ritrovi tutto qui. (Per avere risposte anche a PC spento, aggiungi la chiave Gemini in Impostazioni.)";
}

export default function Ripeti({ scheda }: { scheda: Scheda }) {
  const { inviaRichiesta, aspettaRisposta, risposte, progressi, aggiornaProgressi } = useDati();
  const ultima = progressi.richieste.filter((r) => r.tipo === "valuta_ripetizione" && r.argomento === scheda.id).at(-1);
  const [rid, setRid] = useState<string | undefined>(ultima?.id);
  const [domanda, setDomanda] = useState<string | undefined>();
  const [testo, setTesto] = useState("");
  const [registra, setRegistra] = useState(false);
  const [errore, setErrore] = useState("");
  const [nuovo, setNuovo] = useState(!ultima);
  const ascolto = useRef<Ascolto | null>(null);
  const fermaVoce = useRef<(() => void) | null>(null);

  const risposta = rid ? risposte[rid] : undefined;
  const valutazione = risposta?.stato === "fatta" ? (risposta.output as Valutazione) : undefined;

  useEffect(() => (rid && !nuovo ? aspettaRisposta(rid) : undefined), [rid, nuovo, aspettaRisposta]);
  useEffect(() => () => {
    ascolto.current?.ferma();
    fermaVoce.current?.();
  }, []);

  // salvo il voto una volta sola
  useEffect(() => {
    if (!valutazione || !rid) return;
    const giaSalvato = progressi.argomenti[scheda.id]?.ripetizioni.some((r) => r.rid === rid);
    if (!giaSalvato)
      aggiornaProgressi((p) => {
        const a = (p.argomenti[scheda.id] ??= { tappe: [], ripetizioni: [] });
        a.ripetizioni.push({ data: new Date().toISOString(), voto: valutazione.voto, rid });
        if (!a.tappe.includes(4)) a.tappe.push(4);
      });
  }, [valutazione, rid]); // eslint-disable-line react-hooks/exhaustive-deps

  function microfono() {
    setErrore("");
    if (registra) {
      const finale = ascolto.current?.ferma() ?? testo;
      ascolto.current = null;
      setRegistra(false);
      setTesto(finale);
    } else {
      setRegistra(true);
      ascolto.current = ascolta(setTesto, (msg) => {
        setErrore(msg);
        setRegistra(false);
      });
    }
  }

  async function invia() {
    if (registra) microfono();
    setErrore("");
    try {
      const id = await inviaRichiesta(
        "valuta_ripetizione",
        { argomento: scheda.id, titolo: scheda.titolo, domanda: domanda ?? null, trascrizione: testo.trim() },
        { argomento: scheda.id },
      );
      setRid(id);
      setNuovo(false);
    } catch {
      setErrore("Non riesco a inviare. Controlla la connessione e riprova.");
    }
  }

  function ricomincia(prossima?: string) {
    setDomanda(prossima);
    setTesto("");
    setNuovo(true);
    if (prossima) fermaVoce.current = leggi([prossima]);
  }

  // ---------- risultato ----------
  if (!nuovo && rid) {
    if (!valutazione)
      return (
        <div className="carta">
          {risposta?.stato === "errore" ? (
            <div className="avviso">Non sono riuscito a valutarti: {risposta.errore}</div>
          ) : (
            <div className="riga">
              <Attesa />
              <span>{testoAttesa(risposta)}</span>
            </div>
          )}
          <button className="btn btn-tenue btn-largo" style={{ marginTop: 14 }} onClick={() => ricomincia()}>
            Ripeti di nuovo
          </button>
        </div>
      );
    return (
      <>
        <div className="carta">
          <div className="riga-spaziata">
            <div>
              <div className="etichetta">Voto indicativo</div>
              <div className="voto-grande">{valutazione.voto}</div>
            </div>
            <p className="tenue piccolo" style={{ maxWidth: "60%", textAlign: "right", margin: 0 }}>
              {commentoVoto(valutazione.voto)}
            </p>
          </div>
          <TestoRicco testo={valutazione.giudizio} />
          {risposta?.da === "gemini" && <p className="tenue piccolo" style={{ margin: 0 }}>Valutazione di Gemini (il PC era spento).</p>}
        </div>
        <div className="carta">
          <div className="etichetta">Punto per punto</div>
          {valutazione.punti.map((p, i) => (
            <div key={i} className="esito">
              <span>{SEGNI[p.esito]}</span>
              <div>
                {p.punto}
                {p.nota && <div className="tenue piccolo">{p.nota}</div>}
              </div>
            </div>
          ))}
        </div>
        {valutazione.dillo_meglio.length > 0 && (
          <div className="carta">
            <div className="etichetta">Dillo meglio</div>
            <ul style={{ paddingLeft: "1.2em", margin: 0 }}>
              {valutazione.dillo_meglio.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
        <Virgilio>
          <p>{valutazione.incoraggiamento}</p>
          {valutazione.domanda_successiva && (
            <p>
              <strong>E adesso: </strong>
              {valutazione.domanda_successiva}
            </p>
          )}
        </Virgilio>
        <div className="colonna" style={{ marginTop: 14 }}>
          {valutazione.domanda_successiva && (
            <button className="btn btn-terra btn-largo" onClick={() => ricomincia(valutazione.domanda_successiva)}>
              {Icone.microfono} Rispondi alla domanda
            </button>
          )}
          <button className="btn btn-tenue btn-largo" onClick={() => ricomincia()}>
            Ripeti tutto da capo
          </button>
        </div>
      </>
    );
  }

  // ---------- registrazione ----------
  return (
    <>
      <Virgilio>
        {domanda ? (
          <p>
            <strong>{domanda}</strong>
          </p>
        ) : (
          <p>
            Ora tocca a te. Spiegami <strong>{scheda.titolo}</strong> come se fossi davanti al professore. Prenditi il tempo che ti serve, anche
            qualche minuto.
          </p>
        )}
      </Virgilio>

      {ascoltoDisponibile() ? (
        <>
          <button className={`microfono ${registra ? "attivo" : ""}`} onClick={microfono} aria-label={registra ? "Ferma" : "Parla"}>
            {registra ? Icone.stop : Icone.microfono}
          </button>
          <p className="tenue piccolo" style={{ textAlign: "center" }}>
            {registra ? "Ti ascolto… tocca per fermare" : testo ? "Puoi correggere il testo prima di inviare" : "Tocca e parla"}
          </p>
        </>
      ) : (
        <div className="avviso">Qui non posso ascoltarti: scrivi la tua risposta. Sul telefono con Chrome funziona anche a voce.</div>
      )}

      {registra ? (
        <div className="trascrizione">{testo || <span className="tenue">…</span>}</div>
      ) : (
        <textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Quello che dici compare qui" />
      )}
      {errore && <div className="avviso" style={{ marginTop: 10 }}>{errore}</div>}

      <button className="btn btn-largo" style={{ marginTop: 14 }} disabled={testo.trim().length < 15} onClick={invia}>
        Fammi sapere com'è andata
      </button>
    </>
  );
}
