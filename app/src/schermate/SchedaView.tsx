import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDati } from "../stato";
import { Attesa, BottoneLeggi, Foglio, Icone, Stelle, TestoRicco, Virgilio } from "../componenti";
import type { Approfondimento, ParolaChiave, Ricerca, Scheda } from "../tipi";
import Ripeti, { testoAttesa } from "./Ripeti";
import { Domanda } from "./Domanda";
import { condividiScheda } from "../condividiWord";

const TAPPE = ["Semplice", "Schema", "Dettaglio", "Ripeti tu", "Domande"];

type Penna =
  | { tipo: "parola"; parola: ParolaChiave }
  | { tipo: "selezione"; testo: string; rid?: string }
  | { tipo: "domanda"; testo?: string; rid?: string; domanda?: string };

export default function SchedaView() {
  const { id = "" } = useParams();
  const naviga = useNavigate();
  const { schede, programma, progressi, aggiornaProgressi, lezioni } = useDati();
  const scheda = schede[id];
  const argomento = programma?.argomenti.find((a) => a.id === id);
  const [tappa, setTappa] = useState(1);
  const [penna, setPenna] = useState<Penna | null>(null);
  const [selezione, setSelezione] = useState("");
  const contenuto = useRef<HTMLDivElement>(null);
  const [preparo, setPreparo] = useState(false);
  const fatte = progressi.argomenti[id]?.tappe ?? [];

  // segno l'argomento come aperto
  useEffect(() => {
    if (scheda && !progressi.argomenti[id]?.aperto)
      aggiornaProgressi((p) => {
        p.argomenti[id] = { ...(p.argomenti[id] ?? { tappe: [], ripetizioni: [] }), aperto: new Date().toISOString() };
      });
  }, [scheda, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // la penna: quando selezioni un pezzo di testo
  useEffect(() => {
    const controlla = () => {
      const sel = document.getSelection();
      const testo = sel?.toString().trim() ?? "";
      const dentro = sel?.anchorNode && contenuto.current?.contains(sel.anchorNode);
      setSelezione(dentro && testo.length >= 3 && testo.length <= 600 ? testo : "");
    };
    document.addEventListener("selectionchange", controlla);
    return () => document.removeEventListener("selectionchange", controlla);
  }, []);

  if (!scheda)
    return (
      <div className="pagina">
        <Link to="/programma" className="indietro">
          {Icone.indietro} Programma
        </Link>
        <h1>{argomento?.titolo ?? "Argomento"}</h1>
        <div className="carta riga">
          <Attesa />
          <p style={{ margin: 0 }}>Sto ancora scrivendo questa scheda. Torna tra un po'.</p>
        </div>
      </div>
    );

  function avanti() {
    if (!fatte.includes(tappa))
      aggiornaProgressi((p) => {
        const a = (p.argomenti[id] ??= { tappe: [], ripetizioni: [] });
        if (!a.tappe.includes(tappa)) a.tappe.push(tappa);
      });
    if (tappa < 5) {
      setTappa(tappa + 1);
      window.scrollTo({ top: 0 });
    } else naviga("/");
  }

  const parole = scheda.parole_chiave ?? [];
  const apriParola = (parola: ParolaChiave) => setPenna({ tipo: "parola", parola });

  return (
    <div className="pagina">
      <div className="riga-spaziata">
        <Link to="/programma" className="indietro">
          {Icone.indietro} Programma
        </Link>
        {lezioni[id]?.passi.length ? (
          <Link to={`/lezione/${id}`} className="btn btn-terra btn-piccolo">
            🎓 Lezione con Virgilio
          </Link>
        ) : null}
      </div>
      <h1>{scheda.titolo}</h1>
      {argomento && <Stelle n={argomento.importanza} />}

      <div className="tappe" role="tablist">
        {TAPPE.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={tappa === i + 1}
            className={`tappa ${tappa === i + 1 ? "attiva" : ""} ${fatte.includes(i + 1) ? "fatta" : ""}`}
            onClick={() => setTappa(i + 1)}
          >
            <b>{fatte.includes(i + 1) && tappa !== i + 1 ? "✓" : i + 1}</b>
            {t}
          </button>
        ))}
      </div>

      <div ref={contenuto} data-leggibile="">
        {tappa === 1 && (
          <>
            <Virgilio>
              <p className="etichetta" style={{ marginBottom: 4 }}>
                In parole semplici
              </p>
              <TestoRicco testo={scheda.semplice} classe="grande" />
            </Virgilio>
            {scheda.analogia && (
              <div className="carta" style={{ marginTop: 14 }}>
                <div className="etichetta">Immagina così</div>
                <TestoRicco testo={scheda.analogia} />
              </div>
            )}
          </>
        )}

        {tappa === 2 && (
          <div className="carta">
            <div style={{ textAlign: "right", marginBottom: 8 }}>
              <BottoneLeggi brani={() => scheda.schema.flatMap((v) => [v.voce, { pausa: 300 }, v.testo, { pausa: 700 }])} etichetta="Leggimi lo schema" audioId={`${id}--schema`} />
            </div>
            {scheda.schema.map((v) => (
              <div key={v.voce} className="schema-voce">
                <div className="etichetta">{v.voce}</div>
                <TestoRicco testo={v.testo} parole={parole} onParola={apriParola} />
              </div>
            ))}
          </div>
        )}

        {tappa === 3 && (
          <>
            <div className="riga-spaziata" style={{ gap: 10 }}>
              <p className="tenue piccolo" style={{ margin: 0 }}>Tocca le parole evidenziate per un approfondimento, oppure seleziona un pezzo di testo e usa la penna.</p>
              <BottoneLeggi brani={() => [scheda.dettaglio]} audioId={`${id}--dettaglio`} />
            </div>
            <div className="carta">
              <TestoRicco testo={scheda.dettaglio} parole={parole} onParola={apriParola} />
            </div>
            {scheda.verifiche.length > 0 && <Verifiche scheda={scheda} />}
            {(scheda.integrazione?.length ?? 0) > 0 && <Integrazione scheda={scheda} />}
            <Approfondimenti
              id={id}
              onApri={(rid, testo) => setPenna({ tipo: "selezione", testo, rid })}
              onDomanda={(rid, domanda) => setPenna({ tipo: "domanda", rid, domanda })}
            />
            <button className="btn btn-bordo btn-largo btn-piccolo" onClick={() => setPenna({ tipo: "domanda" })}>
              ❓ Ho un dubbio su questo argomento
            </button>
            {scheda.fonti.length > 0 && (
              <p className="tenue piccolo">
                Fonti: {scheda.fonti.map((f) => [f.materiale, f.dove].filter(Boolean).join(", ")).join(" · ")}
              </p>
            )}
          </>
        )}

        {tappa === 4 && <Ripeti scheda={scheda} />}

        {tappa === 5 && <Domande scheda={scheda} />}
      </div>

      {/* SOLO PER PIETRO: da togliere in futuro */}
      <button
        className="btn btn-bordo btn-largo btn-piccolo"
        style={{ marginTop: 18 }}
        disabled={preparo}
        onClick={async () => {
          setPreparo(true);
          try {
            await condividiScheda(scheda);
          } finally {
            setPreparo(false);
          }
        }}
      >
        {preparo ? "Preparo il file…" : "📤 Condividi in Word"}
      </button>

      <button className="btn btn-largo" style={{ marginTop: 10 }} onClick={avanti}>
        {tappa < 5 ? `Avanti: ${TAPPE[tappa]}` : "Fatto, torniamo a Oggi"}
      </button>

      {selezione && !penna && (
        <button className="btn btn-terra penna-fluttuante" onMouseDown={(e) => e.preventDefault()} onClick={() => setPenna({ tipo: "selezione", testo: selezione })}>
          {Icone.penna} Penna
        </button>
      )}

      {penna && <FoglioPenna penna={penna} scheda={scheda} onChiudi={() => setPenna(null)} />}
    </div>
  );
}

function Verifiche({ scheda }: { scheda: Scheda }) {
  const segni = { ok: "✅", dubbio: "⚠️", integrazione: "➕" };
  const ordinate = [...scheda.verifiche].sort((a, b) => (a.tipo === "dubbio" ? -1 : b.tipo === "dubbio" ? 1 : 0));
  return (
    <div style={{ marginBottom: 14 }}>
      <h3>Ho controllato</h3>
      {ordinate.map((v, i) => (
        <div key={i} className={`verifica verifica-${v.tipo}`}>
          <span>{segni[v.tipo]}</span>
          <div>
            {v.testo}
            {v.fonte && <div className="tenue piccolo">{v.fonte}</div>}
            <EsitoRicerca r={v} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EsitoRicerca({ r }: { r: Ricerca }) {
  if (!r.ricerca) return null;
  return (
    <div className="esito-ricerca">
      🔎 <strong>Ho controllato:</strong> {r.ricerca}
      {r.fonte_web && (
        <div className="tenue piccolo">
          Fonte:{" "}
          {r.fonte_web.url ? (
            <a href={r.fonte_web.url} target="_blank" rel="noreferrer">
              {r.fonte_web.titolo}
            </a>
          ) : (
            r.fonte_web.titolo
          )}
        </div>
      )}
    </div>
  );
}

function Integrazione({ scheda }: { scheda: Scheda }) {
  const segni = { doppione: "♻️", integrato: "🧩", contrasto: "⚠️" };
  const nomi = { doppione: "Era ripetuto, ne ho tenuto uno", integrato: "Messi insieme", contrasto: "Non concordano" };
  return (
    <div style={{ marginBottom: 14 }}>
      <h3>Come ho unito i tuoi materiali</h3>
      {scheda.integrazione!.map((x, i) => (
        <div key={i} className={`verifica ${x.tipo === "contrasto" ? "verifica-dubbio" : ""}`}>
          <span>{segni[x.tipo]}</span>
          <div>
            <b>{nomi[x.tipo]}.</b> {x.testo}
            {x.materiali.length > 0 && <div className="tenue piccolo">{x.materiali.join(" · ")}</div>}
            <EsitoRicerca r={x} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Approfondimenti({ id, onApri, onDomanda }: { id: string; onApri: (rid: string, testo: string) => void; onDomanda: (rid: string, testo: string) => void }) {
  const { progressi } = useDati();
  const lista = progressi.richieste.filter((r) => (r.tipo === "penna" || r.tipo === "domanda") && r.argomento === id);
  if (!lista.length) return null;
  return (
    <div className="carta">
      <div className="etichetta">I tuoi approfondimenti e le tue domande</div>
      {lista.map((r) => (
        <button key={r.id} className="btn btn-bordo btn-largo btn-piccolo" style={{ justifyContent: "flex-start", marginTop: 6 }} onClick={() => (r.tipo === "domanda" ? onDomanda(r.id, r.testo ?? "") : onApri(r.id, r.testo ?? ""))}>
          {r.tipo === "domanda" ? "❓" : Icone.penna} {r.tipo === "domanda" ? "" : "«"}
          {(r.testo ?? "").slice(0, 60)}
          {r.tipo === "domanda" ? "" : "»"}
        </button>
      ))}
    </div>
  );
}

function FoglioPenna({ penna, scheda, onChiudi }: { penna: Penna; scheda: Scheda; onChiudi: () => void }) {
  const { inviaRichiesta, aspettaRisposta, risposte } = useDati();
  const [rid, setRid] = useState(penna.tipo === "selezione" ? penna.rid : undefined);
  const [errore, setErrore] = useState("");
  const [dubbio, setDubbio] = useState(false);

  useEffect(() => (rid ? aspettaRisposta(rid) : undefined), [rid, aspettaRisposta]);

  if (penna.tipo === "parola") {
    const p = penna.parola;
    return (
      <Foglio onChiudi={onChiudi}>
        <div className="etichetta">Approfondimento</div>
        <div className="riga-spaziata">
          <h2>{p.termine}</h2>
          <BottoneLeggi brani={() => [p.termine, { pausa: 400 }, p.spiegazione, { pausa: 500 }, p.all_esame ? "All'esame: " + p.all_esame : ""]} />
        </div>
        <TestoRicco testo={p.spiegazione} />
        {p.all_esame && (
          <div className="verifica verifica-integrazione">
            <span>🎓</span>
            <div>
              <strong>All'esame: </strong>
              {p.all_esame}
            </div>
          </div>
        )}
        <button className="btn btn-tenue btn-largo" onClick={onChiudi}>
          Chiudi
        </button>
      </Foglio>
    );
  }

  if (penna.tipo === "domanda" || dubbio)
    return (
      <Foglio onChiudi={onChiudi}>
        <div className="etichetta">Un dubbio</div>
        {penna.testo && (
          <p className="tenue" style={{ fontStyle: "italic" }}>
            «{penna.testo}»
          </p>
        )}
        {!penna.testo && <h3 style={{ marginTop: 4 }}>{scheda.titolo}</h3>}
        <Domanda
          argomento={scheda.id}
          titolo={scheda.titolo}
          passaggio={penna.testo}
          rid={penna.tipo === "domanda" ? penna.rid : undefined}
          domandaFatta={penna.tipo === "domanda" ? penna.domanda : undefined}
        />
        <button className="btn btn-tenue btn-largo" style={{ marginTop: 8 }} onClick={onChiudi}>
          Chiudi
        </button>
      </Foglio>
    );

  const risposta = rid ? risposte[rid] : undefined;
  const app = risposta?.stato === "fatta" ? (risposta.output as Approfondimento) : undefined;
  const selezionato = penna.testo;

  async function chiedi() {
    setErrore("");
    try {
      const id = await inviaRichiesta(
        "penna",
        { argomento: scheda.id, titolo: scheda.titolo, testo: selezionato },
        { argomento: scheda.id, testo: selezionato },
      );
      setRid(id);
    } catch {
      setErrore("Non riesco a inviare la richiesta. Controlla la connessione.");
    }
  }

  return (
    <Foglio onChiudi={onChiudi}>
      <div className="etichetta">La penna</div>
      <p className="tenue" style={{ fontStyle: "italic" }}>
        «{penna.testo}»
      </p>
      {!rid && (
        <>
          <p>Cosa vuoi fare con questo passaggio?</p>
          {errore && <div className="avviso">{errore}</div>}
          <button className="btn btn-largo btn-terra" onClick={chiedi}>
            {Icone.penna} Approfondisci
          </button>
          <p className="tenue piccolo" style={{ margin: "4px 0 12px" }}>
            Faccio una ricerca e te lo spiego in breve, approfondito e come potrebbe chiedertelo il professore.
          </p>
          <button className="btn btn-largo btn-bordo" onClick={() => setDubbio(true)}>
            ❓ Ho un dubbio
          </button>
          <p className="tenue piccolo" style={{ margin: "4px 0 12px" }}>
            Mi fai una domanda precisa su questo pezzo, a voce o scritta.
          </p>
        </>
      )}
      {rid && !app && risposta?.stato !== "errore" && (
        <div className="riga" style={{ margin: "10px 0 16px" }}>
          <Attesa />
          <span>{testoAttesa(risposta)}</span>
        </div>
      )}
      {risposta?.stato === "errore" && <div className="avviso">Qualcosa è andato storto: {risposta.errore}</div>}
      {app && (
        <>
          <div className="riga-spaziata">
            <div className="etichetta">In breve</div>
            <BottoneLeggi brani={() => [app.breve, { pausa: 500 }, app.approfondimento, { pausa: 500 }, app.all_esame ? "All'esame: " + app.all_esame : ""]} />
          </div>
          <TestoRicco testo={app.breve} classe="grande" />
          <div className="etichetta" style={{ marginTop: 12 }}>
            Approfondimento
          </div>
          <TestoRicco testo={app.approfondimento} />
          {app.all_esame && (
            <div className="verifica verifica-integrazione">
              <span>🎓</span>
              <div>
                <strong>All'esame: </strong>
                {app.all_esame}
              </div>
            </div>
          )}
          {!app.nei_tuoi_materiali && <p className="tenue piccolo">➕ Parte di questo non è nei tuoi materiali: il professore potrebbe non chiederlo.</p>}
          {risposta?.da === "gemini" && <p className="tenue piccolo">Risposta di Gemini (il PC era spento).</p>}
          {app.fonti && app.fonti.length > 0 && (
            <p className="tenue piccolo">
              Fonti:{" "}
              {app.fonti.map((f, i) => (
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
        </>
      )}
      <button className="btn btn-tenue btn-largo" style={{ marginTop: 8 }} onClick={onChiudi}>
        Chiudi
      </button>
    </Foglio>
  );
}

function Domande({ scheda }: { scheda: Scheda }) {
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const gira = (id: string) =>
    setAperte((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const gruppi: [string, typeof scheda.domande][] = [
    ["Domande veloci", scheda.domande.filter((d) => d.tipo === "veloce")],
    ["Come all'esame", scheda.domande.filter((d) => d.tipo === "esame")],
  ];
  return (
    <>
      <p className="tenue piccolo">Prova a rispondere ad alta voce, poi tocca per vedere la risposta. Le domande veloci finiscono anche nel Ripasso.</p>
      {gruppi.map(([nome, lista]) =>
        lista.length ? (
          <div key={nome}>
            <h3 style={{ marginTop: 14 }}>{nome}</h3>
            {lista.map((d) => (
              <button key={d.id} className="carta carta-cliccabile" style={{ border: "1px solid var(--linea)" }} onClick={() => gira(d.id)}>
                <strong>{d.domanda}</strong>
                {aperte.has(d.id) ? <TestoRicco testo={d.risposta} classe="risposta" /> : <div className="tenue piccolo">Tocca per la risposta</div>}
              </button>
            ))}
          </div>
        ) : null,
      )}
    </>
  );
}
