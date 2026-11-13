import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { nuovoId, useDati } from "../stato";
import { Attesa, BottoneLeggi, Foglio, Icone, TestoRicco, Virgilio } from "../componenti";
import { ascolta, ascoltoDisponibile, type Ascolto } from "../voce";
import type { DomandaRicorrente, RispostaRicorrente } from "../tipi";
import { testoAttesa } from "./Ripeti";

const comeLista = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

/** Un campo di testo che si puo' anche dettare con il microfono. */
function CampoDettato({ valore, onCambia, righe = 3, segnaposto }: { valore: string; onCambia: (t: string) => void; righe?: number; segnaposto?: string }) {
  const [registra, setRegistra] = useState(false);
  const ascolto = useRef<Ascolto | null>(null);
  const base = useRef("");
  useEffect(
    () => () => {
      ascolto.current?.ferma();
    },
    [],
  );
  function microfono() {
    if (registra) {
      ascolto.current?.ferma();
      ascolto.current = null;
      setRegistra(false);
      return;
    }
    base.current = valore.trim();
    setRegistra(true);
    ascolto.current = ascolta(
      (t) => onCambia(base.current ? `${base.current} ${t}` : t),
      () => setRegistra(false),
    );
  }
  return (
    <div>
      <textarea value={valore} onChange={(e) => onCambia(e.target.value)} rows={righe} placeholder={segnaposto} style={{ width: "100%" }} />
      {ascoltoDisponibile() && (
        <button type="button" className={`btn btn-piccolo ${registra ? "" : "btn-tenue"}`} onClick={microfono} style={{ marginTop: 4 }}>
          {registra ? <>{Icone.stop} Ferma il microfono</> : <>{Icone.microfono} Dettala</>}
        </button>
      )}
    </div>
  );
}

export default function Ricorrenti() {
  const { esame, ricorrenti, aggiornaRicorrenti, inviaRichiesta, risposte, audio } = useDati();
  const [nuova, setNuova] = useState<"una" | "molte" | DomandaRicorrente | null>(null);
  const [errore, setErrore] = useState("");

  const risposta = (d: DomandaRicorrente) => (d.rid ? risposte[d.rid] : undefined);
  const output = (d: DomandaRicorrente) => (risposta(d)?.stato === "fatta" ? (risposta(d)!.output as RispostaRicorrente) : undefined);

  /** Chiede a Virgilio (dal PC) di scrivere la risposta, o di rivedere la tua. */
  async function chiedi(d: DomandaRicorrente) {
    setErrore("");
    try {
      const rid = await inviaRichiesta(
        "risposta_ricorrente",
        { id: d.id, domanda: d.domanda, risposta_tua: d.risposta_tua ?? "" },
        { testo: d.domanda },
      );
      await aggiornaRicorrenti((l) => l.map((x) => (x.id === d.id ? { ...x, rid } : x)));
    } catch {
      setErrore("Non riesco a inviare. Controlla la connessione e riprova.");
    }
  }

  async function aggiungi(testi: string[], rispostaTua?: string) {
    const ora = new Date().toISOString();
    const nuove: DomandaRicorrente[] = testi.map((t) => ({ id: nuovoId(), domanda: t, ...(rispostaTua?.trim() ? { risposta_tua: rispostaTua.trim() } : {}), creata: ora, aggiornata: ora }));
    await aggiornaRicorrenti((l) => [...l, ...nuove]);
    for (const d of nuove) await chiedi(d);
  }

  async function salvaModifica(d: DomandaRicorrente, testo: string, sua: string) {
    const cambiata = testo.trim() !== d.domanda || sua.trim() !== (d.risposta_tua ?? "");
    const nuovaD: DomandaRicorrente = { ...d, domanda: testo.trim(), risposta_tua: sua.trim() || undefined, aggiornata: new Date().toISOString() };
    await aggiornaRicorrenti((l) => l.map((x) => (x.id === d.id ? nuovaD : x)));
    if (cambiata) await chiedi(nuovaD); // la risposta di Virgilio va rifatta con le novita'
  }

  if (!esame)
    return (
      <div className="pagina">
        <Link to="/" className="indietro">
          {Icone.indietro} Oggi
        </Link>
        <h1>Domande ricorrenti</h1>
        <div className="avviso">Prima serve una materia.</div>
      </div>
    );

  return (
    <div className="pagina">
      <Link to="/" className="indietro">
        {Icone.indietro} Oggi
      </Link>
      <h1>Domande che fanno all'esame</h1>
      <Virgilio>
        <p>
          Qui raccogli le domande che il professore fa spesso. Per ognuna puoi <strong>dettare tu la risposta che vuole</strong>, oppure farla scrivere a me dai tuoi
          appunti. Se hai scritto la tua, la <strong>rivedo con i tuoi materiali</strong> e ti dico cosa aggiungere o correggere.
        </p>
      </Virgilio>

      <div className="colonna">
        <button className="btn btn-largo" onClick={() => setNuova("una")}>
          ＋ Nuova domanda
        </button>
        <button className="btn btn-tenue btn-largo" onClick={() => setNuova("molte")}>
          📋 Incollane molte insieme
        </button>
        {ricorrenti.length > 0 && (
          <Link to="/interrogazione?argomento=ricorrenti" className="btn btn-terra btn-largo">
            🎤 Interrogami su queste
          </Link>
        )}
      </div>
      {errore && <div className="avviso">{errore}</div>}

      {ricorrenti.length === 0 && (
        <p className="tenue">Ancora nessuna domanda. Aggiungi la prima, per esempio quella che tutti ti dicono che il professore fa sempre.</p>
      )}

      {ricorrenti.map((d) => (
        <Carta key={d.id} d={d} risposta={risposta(d)} out={output(d)} haAudio={!!audio[`_ricorrenti--r-${d.id}`]} onModifica={() => setNuova(d)} onChiedi={() => void chiedi(d)} onElimina={() => aggiornaRicorrenti((l) => l.filter((x) => x.id !== d.id))} onUsaMigliorata={(t) => void salvaModifica(d, d.domanda, t)} />
      ))}

      {nuova === "una" && <FoglioDomanda onChiudi={() => setNuova(null)} onSalva={async (t, s) => { await aggiungi([t], s); setNuova(null); }} />}
      {nuova === "molte" && <FoglioMolte onChiudi={() => setNuova(null)} onSalva={async (lista) => { await aggiungi(lista); setNuova(null); }} />}
      {nuova && typeof nuova === "object" && (
        <FoglioDomanda
          iniziale={nuova}
          onChiudi={() => setNuova(null)}
          onSalva={async (t, s) => {
            await salvaModifica(nuova, t, s ?? "");
            setNuova(null);
          }}
        />
      )}
    </div>
  );
}

function Carta({
  d,
  risposta,
  out,
  haAudio,
  onModifica,
  onChiedi,
  onElimina,
  onUsaMigliorata,
}: {
  d: DomandaRicorrente;
  risposta?: { stato: string; errore?: string; da?: string };
  out?: RispostaRicorrente;
  haAudio: boolean;
  onModifica: () => void;
  onChiedi: () => void;
  onElimina: () => void;
  onUsaMigliorata: (t: string) => void;
}) {
  const { aspettaRisposta } = useDati();
  useEffect(() => (d.rid && !out ? aspettaRisposta(d.rid) : undefined), [d.rid, out, aspettaRisposta]);
  const rev = out?.revisione;
  const sua = d.risposta_tua?.trim();

  return (
    <div className="carta">
      <div className="riga-spaziata" style={{ alignItems: "flex-start", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{d.domanda}</h3>
        <button className="btn btn-tenue btn-piccolo" onClick={onModifica}>
          ✏️
        </button>
      </div>

      {sua && (
        <div className="verifica verifica-integrazione" style={{ marginTop: 10 }}>
          <span>🗣️</span>
          <div>
            <strong>La tua risposta (quella che vuole il professore)</strong>
            <TestoRicco testo={sua} />
          </div>
        </div>
      )}

      {!d.rid && (
        <button className="btn btn-largo" style={{ marginTop: 10 }} onClick={onChiedi}>
          ✍️ {sua ? "Rivedi la mia risposta con i miei appunti" : "Scrivi la risposta dai miei appunti"}
        </button>
      )}

      {d.rid && !out && (
        <div className="carta" style={{ marginTop: 10, marginBottom: 0 }}>
          {risposta?.stato === "errore" ? (
            <>
              <div className="avviso">Non sono riuscito: {risposta.errore}</div>
              <button className="btn btn-tenue btn-piccolo" style={{ marginTop: 8 }} onClick={onChiedi}>
                Riprova
              </button>
            </>
          ) : (
            <div className="riga">
              <Attesa />
              <span>{testoAttesa(risposta as never)}</span>
            </div>
          )}
        </div>
      )}

      {out && (
        <>
          <div style={{ marginTop: 12 }}>
            <div className="riga-spaziata">
              <div className="etichetta">Risposta di Virgilio, dai tuoi materiali</div>
              {haAudio && <BottoneLeggi brani={() => []} audioId={`_ricorrenti--r-${d.id}`} etichetta="Ascolta" />}
            </div>
            <TestoRicco testo={out.risposta} />
            {out.punti_chiave.length > 0 && (
              <>
                <div className="etichetta">Non devono mancare</div>
                <ul style={{ paddingLeft: "1.2em", margin: "4px 0 8px" }}>
                  {out.punti_chiave.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </>
            )}
            {out.non_nei_materiali?.trim() && (
              <div className="verifica verifica-dubbio">
                <span>⚠️</span>
                <div>
                  <strong>Non c'è nei tuoi materiali: </strong>
                  {out.non_nei_materiali}
                </div>
              </div>
            )}
            {out.fonti.length > 0 && (
              <p className="tenue piccolo" style={{ marginBottom: 0 }}>
                Da: {out.fonti.map((f) => f.materiale + (f.dove ? ` (${f.dove})` : "")).join(" · ")}
              </p>
            )}
          </div>

          {rev && (
            <div className="carta" style={{ marginTop: 12, marginBottom: 0 }}>
              <div className="etichetta">Come ho rivisto la tua risposta</div>
              <TestoRicco testo={rev.giudizio} />
              {comeLista(rev.corretto).length > 0 && (
                <div className="esito">
                  <span>✅</span>
                  <div>{comeLista(rev.corretto).join(" ")}</div>
                </div>
              )}
              {comeLista(rev.da_aggiungere).length > 0 && (
                <div className="esito">
                  <span>➕</span>
                  <div>
                    <strong>Da aggiungere: </strong>
                    {comeLista(rev.da_aggiungere).join(" ")}
                  </div>
                </div>
              )}
              {comeLista(rev.da_correggere).length > 0 && (
                <div className="esito">
                  <span>⚠️</span>
                  <div>
                    <strong>Da correggere: </strong>
                    {comeLista(rev.da_correggere).join(" ")}
                  </div>
                </div>
              )}
              {rev.risposta_migliorata?.trim() && (
                <>
                  <div className="etichetta" style={{ marginTop: 10 }}>
                    La tua risposta, rivista
                  </div>
                  <TestoRicco testo={rev.risposta_migliorata} />
                  <button className="btn btn-bordo btn-piccolo" onClick={() => onUsaMigliorata(rev.risposta_migliorata)}>
                    Tieni questa come la mia risposta
                  </button>
                </>
              )}
            </div>
          )}

          <div className="riga" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn-tenue btn-piccolo" onClick={onChiedi}>
              🔄 Riscrivi
            </button>
            <button
              className="btn btn-tenue btn-piccolo"
              onClick={() => {
                if (confirm("Tolgo questa domanda?")) onElimina();
              }}
            >
              🗑️ Elimina
            </button>
          </div>
        </>
      )}

      {!d.rid && (
        <button
          className="btn btn-tenue btn-piccolo"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (confirm("Tolgo questa domanda?")) onElimina();
          }}
        >
          🗑️ Elimina
        </button>
      )}
    </div>
  );
}

function FoglioDomanda({
  iniziale,
  onChiudi,
  onSalva,
}: {
  iniziale?: DomandaRicorrente;
  onChiudi: () => void;
  onSalva: (domanda: string, rispostaTua?: string) => Promise<void>;
}) {
  const [domanda, setDomanda] = useState(iniziale?.domanda ?? "");
  const [sua, setSua] = useState(iniziale?.risposta_tua ?? "");
  const [attesa, setAttesa] = useState(false);
  return (
    <Foglio onChiudi={onChiudi}>
      <div className="etichetta">{iniziale ? "Modifica la domanda" : "Nuova domanda d'esame"}</div>
      <label>La domanda</label>
      <CampoDettato valore={domanda} onCambia={setDomanda} righe={3} segnaposto="Per esempio: Come si distingue la cisti follicolare dalla cheratocisti?" />
      <label style={{ marginTop: 12, display: "block" }}>La risposta che vuole il professore (facoltativa)</label>
      <p className="tenue piccolo" style={{ margin: "0 0 4px" }}>
        Se la sai, scrivila o dettala: la rivedo con i tuoi materiali. Se la lasci vuota, la scrivo io dai tuoi appunti.
      </p>
      <CampoDettato valore={sua} onCambia={setSua} righe={6} segnaposto="La tua risposta, come la diresti all'esame" />
      <button
        className="btn btn-largo"
        style={{ marginTop: 12 }}
        disabled={!domanda.trim() || attesa}
        onClick={async () => {
          setAttesa(true);
          try {
            await onSalva(domanda.trim(), sua.trim());
          } finally {
            setAttesa(false);
          }
        }}
      >
        {attesa ? <Attesa /> : iniziale ? "Salva" : sua.trim() ? "Salva e rivedi la mia risposta" : "Salva e scrivi la risposta"}
      </button>
      <p className="tenue piccolo">Virgilio ci mette circa un minuto, dal PC.</p>
    </Foglio>
  );
}

function FoglioMolte({ onChiudi, onSalva }: { onChiudi: () => void; onSalva: (lista: string[]) => Promise<void> }) {
  const [testo, setTesto] = useState("");
  const [attesa, setAttesa] = useState(false);
  const lista = testo
    .split("\n")
    .map((r) => r.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter((r) => r.length >= 6);
  return (
    <Foglio onChiudi={onChiudi}>
      <div className="etichetta">Più domande insieme</div>
      <p className="tenue piccolo">Incolla l'elenco: una domanda per riga (anche con numeri o trattini). Per ognuna Virgilio scrive la risposta dai tuoi appunti.</p>
      <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={10} style={{ width: "100%" }} placeholder={"1. Cos'è la cisti radicolare?\n2. Come si distingue un ameloblastoma da…"} />
      <p className="tenue piccolo">
        {lista.length > 0 ? `${lista.length} domande. Ogni risposta richiede circa un minuto al PC e consuma un po' del tuo Pro.` : "Scrivi o incolla le domande."}
      </p>
      <button
        className="btn btn-largo"
        disabled={!lista.length || attesa}
        onClick={async () => {
          setAttesa(true);
          try {
            await onSalva(lista);
          } finally {
            setAttesa(false);
          }
        }}
      >
        {attesa ? <Attesa /> : `Aggiungi ${lista.length || ""} domande`}
      </button>
    </Foglio>
  );
}
