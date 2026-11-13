import { useState } from "react";
import { Link } from "react-router-dom";
import { useDati } from "../stato";
import { Attesa, Foglio } from "../componenti";
import type { VoceCopertura } from "../tipi";

const SEGNO = { coperto: "✅", parziale: "🟡", mancante: "❌" } as const;

/** Il programma ufficiale dell'esame: lo incolli, e Virgilio ti dice cosa copri e cosa manca. */
export default function CartaProgrammaUfficiale() {
  const { esame, sillabo, copertura, programma, salvaSillabo, motore, inPausa } = useDati();
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState("");
  if (!esame) return null;

  const titoloArgomento = (id: string) => programma?.argomenti.find((a) => a.id === id)?.titolo ?? id;
  const aggiornato = copertura && sillabo && copertura.sillabo_aggiornato === sillabo.aggiornato;
  const staConfrontando = motore?.stato === "lavora" && (motore.cosa ?? "").startsWith("Confronto");

  function apri() {
    setTesto(sillabo?.testo ?? "");
    setErrore("");
    setAperto(true);
  }
  async function salva() {
    setSalvo(true);
    setErrore("");
    try {
      await salvaSillabo(testo);
      setAperto(false);
    } catch {
      setErrore("Non riesco a salvare. Controlla la connessione e riprova.");
    } finally {
      setSalvo(false);
    }
  }

  const gruppo = (stato: VoceCopertura["stato"]) => copertura?.voci.filter((v) => v.stato === stato) ?? [];
  const Voce = ({ v }: { v: VoceCopertura }) => (
    <div className="esito">
      <span>{SEGNO[v.stato]}</span>
      <div>
        <strong>{v.voce}</strong>
        {v.nota && <div className="tenue piccolo">{v.nota}</div>}
        {v.argomenti.length > 0 && (
          <div className="piccolo" style={{ marginTop: 2 }}>
            {v.argomenti.map((id, i) => (
              <span key={id}>
                {i > 0 && " · "}
                <Link to={`/scheda/${id}`}>{titoloArgomento(id).slice(0, 55)}</Link>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="carta">
        <div className="etichetta">Programma ufficiale dell'esame</div>

        {!sillabo && (
          <>
            <p style={{ marginTop: 4 }}>
              Se hai l'elenco degli argomenti d'esame (dal sito dell'università o dal programma del corso), incollalo qui: controllo cosa copri con i tuoi materiali e ti
              dico <strong>cosa manca</strong>.
            </p>
            <button className="btn btn-largo" onClick={apri}>
              📋 Inserisci il programma dell'esame
            </button>
          </>
        )}

        {sillabo && !aggiornato && (
          <>
            <div className="riga" style={{ gap: 10, margin: "6px 0" }}>
              <Attesa />
              <span>{staConfrontando ? "Il PC sta confrontando il programma con i tuoi materiali…" : "Il confronto parte appena il PC è libero."}</span>
            </div>
            {inPausa && <p className="tenue piccolo">Il lavoro del PC è in pausa: il confronto parte quando premi "Riprendi" in Oggi.</p>}
            <button className="btn btn-tenue btn-piccolo" onClick={apri}>
              ✏️ Modifica il programma
            </button>
          </>
        )}

        {sillabo && aggiornato && copertura && (
          <>
            <p style={{ margin: "4px 0 8px" }}>{copertura.riassunto}</p>
            <div className="riga" style={{ gap: 14, flexWrap: "wrap", margin: "0 0 8px" }}>
              <span>✅ {gruppo("coperto").length} coperti</span>
              <span>🟡 {gruppo("parziale").length} a metà</span>
              <span>❌ {gruppo("mancante").length} mancano</span>
            </div>
            {gruppo("mancante").map((v, i) => (
              <Voce key={"m" + i} v={v} />
            ))}
            {gruppo("parziale").map((v, i) => (
              <Voce key={"p" + i} v={v} />
            ))}
            {gruppo("coperto").length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary>Le voci già coperte ({gruppo("coperto").length})</summary>
                {gruppo("coperto").map((v, i) => (
                  <Voce key={"c" + i} v={v} />
                ))}
              </details>
            )}
            {copertura.extra.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary>Argomenti che hai ma non sono nel programma ({copertura.extra.length})</summary>
                <p className="tenue piccolo">Potrebbero non servire all'esame: valuta tu se studiarli lo stesso.</p>
                {copertura.extra.map((id) => (
                  <div key={id} className="piccolo">
                    · <Link to={`/scheda/${id}`}>{titoloArgomento(id)}</Link>
                  </div>
                ))}
              </details>
            )}
            {gruppo("mancante").length + gruppo("parziale").length > 0 && (
              <div className="riga" style={{ gap: 8, marginTop: 12 }}>
                <Link to="/carica" className="btn btn-piccolo">
                  Carica i materiali che mancano
                </Link>
              </div>
            )}
            <div className="riga" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn btn-tenue btn-piccolo" onClick={apri}>
                ✏️ Modifica il programma
              </button>
              <button className="btn btn-tenue btn-piccolo" disabled={salvo} onClick={() => void salvaSillabo(sillabo.testo)}>
                🔄 Rifai il confronto
              </button>
            </div>
            {copertura.programma_aggiornato !== programma?.aggiornato && (
              <p className="tenue piccolo" style={{ marginBottom: 0 }}>
                Hai caricato materiali nuovi: il PC aggiorna il confronto.
              </p>
            )}
          </>
        )}
      </div>

      {aperto && (
        <Foglio onChiudi={() => setAperto(false)}>
          <div className="etichetta">Programma ufficiale dell'esame</div>
          <p className="tenue piccolo">
            Copia l'elenco degli argomenti dal sito dell'università o dal PDF del corso e incollalo qui. Va bene anche un testo disordinato: una voce per riga è l'ideale.
            Non serve togliere orari o bibliografia.
          </p>
          <textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            rows={12}
            placeholder={"Per esempio:\n- Infiammazione acuta e cronica\n- Necrosi e apoptosi\n- Tumori del cavo orale\n…"}
            style={{ width: "100%" }}
          />
          {errore && <div className="avviso">{errore}</div>}
          <button className="btn btn-largo" style={{ marginTop: 10 }} disabled={!testo.trim() || salvo} onClick={() => void salva()}>
            {salvo ? <Attesa /> : "Salva e controlla"}
          </button>
          <p className="tenue piccolo">Il controllo lo fa Virgilio dal PC: richiede un minuto o due.</p>
        </Foglio>
      )}
    </>
  );
}
