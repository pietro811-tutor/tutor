import { useEffect, useRef, useState } from "react";
import { useDati } from "../stato";
import { Attesa, Icone, TestoRicco } from "../componenti";
import { ascolta, ascoltoDisponibile, type Ascolto } from "../voce";
import { testoAttesa } from "./Ripeti";
import type { RispostaDomanda } from "../tipi";

/**
 * Una domanda a Virgilio: su un passaggio selezionato con la penna, su un argomento,
 * oppure su qualsiasi cosa ("ho caricato qualcosa sulle ghiandole salivari?").
 */
export function Domanda({
  argomento,
  titolo,
  passaggio,
  rid: ridIniziale,
  domandaFatta,
}: {
  argomento?: string;
  titolo?: string;
  passaggio?: string;
  rid?: string;
  domandaFatta?: string;
}) {
  const { inviaRichiesta, aspettaRisposta, risposte } = useDati();
  const [rid, setRid] = useState(ridIniziale);
  const [testo, setTesto] = useState("");
  const [inviata, setInviata] = useState(domandaFatta ?? "");
  const [registra, setRegistra] = useState(false);
  const [errore, setErrore] = useState("");
  const ascolto = useRef<Ascolto | null>(null);

  useEffect(() => (rid ? aspettaRisposta(rid) : undefined), [rid, aspettaRisposta]);
  useEffect(() => () => void ascolto.current?.ferma(), []);

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
    let d = testo;
    if (registra) {
      d = ascolto.current?.ferma() ?? testo;
      ascolto.current = null;
      setRegistra(false);
    }
    d = d.trim();
    if (!d) return;
    setErrore("");
    try {
      const id = await inviaRichiesta("domanda", { argomento, titolo, passaggio, domanda: d }, { argomento, testo: d });
      setInviata(d);
      setRid(id);
    } catch {
      setErrore("Non riesco a inviare la domanda. Controlla la connessione.");
    }
  }

  function altra() {
    setRid(undefined);
    setInviata("");
    setTesto("");
  }

  const risposta = rid ? risposte[rid] : undefined;
  const r = risposta?.stato === "fatta" ? (risposta.output as RispostaDomanda) : undefined;

  if (!rid)
    return (
      <>
        <p className="tenue piccolo" style={{ marginTop: 0 }}>
          {passaggio
            ? "Cosa non ti torna di questo passaggio? Chiedimelo come lo chiederesti a me di persona."
            : "Chiedimi quello che vuoi: un dubbio su un argomento, oppure se tra i tuoi materiali c'è qualcosa (es. «ho caricato le ghiandole salivari?»)."}
        </p>
        {registra ? (
          <div className="trascrizione">{testo || <span className="tenue">Ti ascolto…</span>}</div>
        ) : (
          <textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi la tua domanda" rows={3} />
        )}
        {errore && <div className="avviso" style={{ marginTop: 10 }}>{errore}</div>}
        <div className="riga" style={{ marginTop: 12, gap: 10 }}>
          {ascoltoDisponibile() && (
            <button className={`btn ${registra ? "btn-terra" : "btn-bordo"}`} onClick={microfono} aria-label={registra ? "Ferma" : "Detta la domanda"}>
              {registra ? Icone.stop : Icone.microfono} {registra ? "Ferma" : "Detta"}
            </button>
          )}
          <button className="btn" style={{ flex: 1 }} disabled={!testo.trim()} onClick={invia}>
            Chiedi a Virgilio
          </button>
        </div>
      </>
    );

  return (
    <>
      {inviata && (
        <p style={{ marginTop: 0 }}>
          <strong>Tu: </strong>
          {inviata}
        </p>
      )}
      {!r && risposta?.stato !== "errore" && (
        <div className="riga" style={{ margin: "10px 0 16px" }}>
          <Attesa />
          <span>{testoAttesa(risposta)}</span>
        </div>
      )}
      {risposta?.stato === "errore" && <div className="avviso">Qualcosa è andato storto: {risposta.errore}</div>}
      {r && (
        <>
          <div className="etichetta">Virgilio</div>
          <TestoRicco testo={r.risposta} />
          {r.materiali && r.materiali.length > 0 && <p className="tenue piccolo">📚 Dai tuoi materiali: {r.materiali.join(" · ")}</p>}
          {!r.nei_tuoi_materiali && <p className="tenue piccolo">➕ Parte di questo non è nei tuoi materiali: il professore potrebbe non chiederlo.</p>}
          {risposta?.da === "gemini" && <p className="tenue piccolo">Risposta di Gemini (il PC era spento).</p>}
          {r.fonti && r.fonti.length > 0 && (
            <p className="tenue piccolo">
              Fonti:{" "}
              {r.fonti.map((f, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.titolo}
                    </a>
                  ) : (
                    f.titolo
                  )}
                </span>
              ))}
            </p>
          )}
          <button className="btn btn-bordo btn-largo" style={{ marginTop: 8 }} onClick={altra}>
            Fai un'altra domanda
          </button>
        </>
      )}
    </>
  );
}
