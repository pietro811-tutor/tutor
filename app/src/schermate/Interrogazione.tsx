import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDati } from "../stato";
import { Attesa, Icone, TestoRicco, Virgilio } from "../componenti";
import { ascolta, ascoltoDisponibile, leggi, type Ascolto } from "../voce";
import { avviaAudio, leggiScelteVoce, type ControlloAudio } from "../voceScelta";
import { controlloVeloce, type EsitoVeloce } from "../controlloVeloce";
import type { Domanda as DomandaScheda, Valutazione } from "../tipi";
import { testoAttesa } from "./Ripeti";

interface Voce {
  scheda: string;
  titolo: string;
  d: DomandaScheda;
}
type Fase = "scelta" | "domanda" | "ascolto" | "esito" | "fine";
interface Risultato {
  voce: Voce;
  esito: EsitoVeloce;
  nonso: boolean;
}

const SEGNO = { bene: "✅", quasi: "🟡", rivediamo: "❌" } as const;
const PAROLE = { bene: "Bene", quasi: "Ci sei quasi", rivediamo: "Da rivedere" } as const;

function mescola<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export default function Interrogazione() {
  const { schede, audio, caricaAudio, aggiornaProgressi, progressi, esame } = useDati();
  const naviga = useNavigate();
  const [params] = useSearchParams();
  const gruppi = (progressi.gruppi ?? []).filter((g) => g.esame === esame?.slug);
  const [fase, setFase] = useState<Fase>("scelta");
  const [argomento, setArgomento] = useState(params.get("gruppo") ? `gruppo:${params.get("gruppo")}` : "tutto");
  const [quante, setQuante] = useState(10);
  const [soloEsame, setSoloEsame] = useState(false);
  const [coda, setCoda] = useState<Voce[]>([]);
  const [pos, setPos] = useState(0);
  const [testo, setTesto] = useState("");
  const [nonso, setNonso] = useState(false);
  const [risultati, setRisultati] = useState<Risultato[]>([]);
  const [errore, setErrore] = useState("");
  const [parla, setParla] = useState(false);

  const giro = useRef(0); // ogni volta che cambio domanda annullo quello che stava ancora succedendo
  const controllo = useRef<ControlloAudio | null>(null);
  const fermaTelefono = useRef<(() => void) | null>(null);
  const microfono = useRef<Ascolto | null>(null);

  const tutteLeDomande = useMemo<Voce[]>(
    () => Object.values(schede).flatMap((s) => (s.domande ?? []).map((d) => ({ scheda: s.id, titolo: s.titolo, d }))),
    [schede],
  );
  const gruppoScelto = argomento.startsWith("gruppo:") ? gruppi.find((g) => g.id === argomento.slice(7)) : undefined;
  const dellArgomento = (v: Voce) => (argomento === "tutto" ? true : gruppoScelto ? gruppoScelto.argomenti.includes(v.scheda) : v.scheda === argomento);
  const disponibili = tutteLeDomande.filter((v) => dellArgomento(v) && (!soloEsame || v.d.tipo === "esame"));
  const conVoce = tutteLeDomande.filter((v) => audio[`${v.scheda}--q-${v.d.id}`]).length;

  function ferma() {
    giro.current++;
    controllo.current?.ferma();
    controllo.current = null;
    fermaTelefono.current?.();
    fermaTelefono.current = null;
    microfono.current?.ferma();
    microfono.current = null;
    setParla(false);
  }
  useEffect(() => ferma, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Dice una cosa con la voce buona (audio del PC) se c'è, altrimenti con la voce del telefono. Finisce quando ha finito di parlare. */
  async function dici(id: string, fallback: string, mioGiro: number): Promise<void> {
    if (mioGiro !== giro.current) return;
    const scelte = leggiScelteVoce();
    const voce = audio[id]?.[scelte.voce] ? scelte.voce : Object.keys(audio[id] ?? {})[0];
    setParla(true);
    try {
      if (voce) {
        const url = await caricaAudio(id, voce);
        if (url && mioGiro === giro.current) {
          await new Promise<void>((ok) => {
            void avviaAudio(url, scelte, ok).then((c) => {
              if (mioGiro !== giro.current) {
                c.ferma();
                ok();
              } else controllo.current = c;
            });
          });
          return;
        }
      }
      if (mioGiro === giro.current && fallback) await new Promise<void>((ok) => {
          // se la voce del telefono non risponde, dopo un po' si va avanti lo stesso
          const guardia = window.setTimeout(ok, 90000);
          fermaTelefono.current = leggi([fallback], () => {
            window.clearTimeout(guardia);
            ok();
          });
        });
    } finally {
      if (mioGiro === giro.current) setParla(false);
    }
  }

  function iniziaAscolto() {
    setTesto("");
    setErrore("");
    if (!ascoltoDisponibile()) return;
    microfono.current = ascolta(setTesto, (m) => setErrore(m));
  }

  async function faiDomanda(lista: Voce[], i: number, conIntro = false) {
    ferma();
    const mio = giro.current;
    setPos(i);
    setNonso(false);
    setTesto("");
    setFase("domanda");
    if (conIntro) await dici("_frase-inizio", "Cominciamo l'interrogazione. Rispondi a voce, come se fossi all'esame.", mio);
    const v = lista[i];
    await dici(`${v.scheda}--q-${v.d.id}`, v.d.domanda, mio);
    if (mio !== giro.current) return;
    setFase("ascolto");
    iniziaAscolto();
  }

  function parti(lista: Voce[]) {
    if (!lista.length) return;
    setCoda(lista);
    setRisultati([]);
    void faiDomanda(lista, 0, true);
  }

  function iniziaInterrogazione() {
    parti(mescola(disponibili).slice(0, quante));
  }

  const corrente = coda[pos];
  const esito = useMemo(
    () => (corrente ? controlloVeloce(corrente.d.domanda, corrente.d.risposta, nonso ? "" : testo) : undefined),
    [corrente, testo, nonso],
  );

  async function haiFinito(nonLoSo = false) {
    if (!corrente) return;
    const finale = microfono.current?.ferma() ?? testo;
    microfono.current = null;
    const t = nonLoSo ? "" : finale;
    if (!nonLoSo) setTesto(finale);
    setNonso(nonLoSo);
    const e = controlloVeloce(corrente.d.domanda, corrente.d.risposta, t);
    controllo.current?.ferma();
    const mio = ++giro.current;
    setFase("esito");
    setRisultati((r) => [...r.filter((x) => x.voce !== corrente), { voce: corrente, esito: e, nonso: nonLoSo }]);
    await dici(nonLoSo ? "_frase-nonso" : `_frase-${e.verdetto}`, "", mio);
    await dici(`${corrente.scheda}--r-${corrente.d.id}`, corrente.d.risposta, mio);
  }

  // se correggi il testo, il risultato cambia subito
  useEffect(() => {
    if (fase !== "esito" || !corrente || !esito) return;
    setRisultati((r) => r.map((x) => (x.voce === corrente ? { ...x, esito } : x)));
  }, [esito, fase, corrente]);

  function avanti() {
    ferma();
    if (pos + 1 < coda.length) void faiDomanda(coda, pos + 1);
    else finisci();
  }

  function finisci() {
    ferma();
    setFase("fine");
    aggiornaProgressi((p) => {
      (p.interrogazioni ??= []).push({
        data: new Date().toISOString(),
        voci: risultati.map((r) => ({ scheda: r.voce.scheda, domanda: r.voce.d.id, esito: r.esito.verdetto })),
      });
    });
    void dici("_frase-fine", "Per oggi abbiamo finito. Bel lavoro!", ++giro.current);
  }

  // ---------- scelta ----------
  if (fase === "scelta")
    return (
      <div className="pagina">
        <Link to="/" className="indietro">
          {Icone.indietro} Oggi
        </Link>
        <h1>Interrogazione</h1>
        <Virgilio>
          <p>
            Ti faccio le domande <strong>a voce</strong>, tu rispondi parlando, come all'esame. Poi ti dico subito cosa hai detto e cosa è mancato, e ti leggo la
            risposta giusta.
          </p>
        </Virgilio>
        {!tutteLeDomande.length ? (
          <div className="avviso">Non ci sono ancora domande: servono le schede.</div>
        ) : (
          <div className="carta">
            <label htmlFor="arg">Su cosa?</label>
            <select id="arg" value={argomento} onChange={(e) => setArgomento(e.target.value)}>
              <option value="tutto">Tutto quello che ho studiato ({tutteLeDomande.length} domande)</option>
              {gruppi.length > 0 && (
                <optgroup label="I tuoi gruppi">
                  {gruppi.map((g) => (
                    <option key={g.id} value={`gruppo:${g.id}`}>
                      📁 {g.nome} ({tutteLeDomande.filter((v) => g.argomenti.includes(v.scheda)).length})
                    </option>
                  ))}
                </optgroup>
              )}
              {Object.values(schede).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titolo.slice(0, 70)} ({s.domande?.length ?? 0})
                </option>
              ))}
            </select>
            <label>Quante domande?</label>
            <div className="riga" style={{ gap: 8 }}>
              {[5, 10, 20].map((n) => (
                <button key={n} className={`btn btn-piccolo ${quante === n ? "" : "btn-tenue"}`} onClick={() => setQuante(n)}>
                  {n}
                </button>
              ))}
            </div>
            <label className="riga" style={{ gap: 8, marginTop: 12 }}>
              <input type="checkbox" checked={soloEsame} onChange={(e) => setSoloEsame(e.target.checked)} style={{ width: "auto" }} />
              Solo domande da esame (più lunghe)
            </label>
            {!ascoltoDisponibile() && (
              <div className="avviso" style={{ marginTop: 12 }}>
                Qui non posso ascoltarti. Sul telefono con Chrome o Brave funziona a voce.
              </div>
            )}
            <p className="tenue piccolo">
              {conVoce >= tutteLeDomande.length
                ? "Le domande sono pronte con la voce di Elsa."
                : conVoce > 0
                  ? `Con la voce di Elsa: ${conVoce} domande su ${tutteLeDomande.length}. Le altre le leggo con la voce del telefono.`
                  : "Gli audio di Elsa per le domande sono ancora in preparazione: per ora uso la voce del telefono."}
            </p>
            <button className="btn btn-terra btn-largo" disabled={!disponibili.length} onClick={iniziaInterrogazione}>
              {Icone.microfono} Cominciamo ({Math.min(quante, disponibili.length)} domande)
            </button>
          </div>
        )}
      </div>
    );

  // ---------- riepilogo ----------
  if (fase === "fine") {
    const bene = risultati.filter((r) => r.esito.verdetto === "bene").length;
    const daRivedere = risultati.filter((r) => r.esito.verdetto !== "bene");
    return (
      <div className="pagina">
        <h1>Com'è andata</h1>
        <div className="carta">
          <div className="etichetta">Risposte giuste</div>
          <div className="voto-grande">
            {bene}/{risultati.length}
          </div>
          <p className="tenue piccolo" style={{ margin: 0 }}>
            È un controllo veloce sulle parole che hai detto: ti dice se hai toccato i punti giusti, non sostituisce il giudizio del professore.
          </p>
        </div>
        <div className="carta">
          {risultati.map((r, i) => (
            <div key={i} className="esito">
              <span>{SEGNO[r.esito.verdetto]}</span>
              <div>
                {r.voce.d.domanda}
                <div className="tenue piccolo">{r.voce.titolo.slice(0, 60)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="colonna">
          {daRivedere.length > 0 && (
            <button className="btn btn-terra btn-largo" onClick={() => parti(mescola(daRivedere.map((r) => r.voce)))}>
              Riprova quelle da rivedere ({daRivedere.length})
            </button>
          )}
          <button className="btn btn-tenue btn-largo" onClick={() => setFase("scelta")}>
            Un'altra interrogazione
          </button>
          <button className="btn btn-bordo btn-largo" onClick={() => naviga("/")}>
            Torna a Oggi
          </button>
        </div>
      </div>
    );
  }

  if (!corrente) return null;

  // ---------- domanda, ascolto, esito ----------
  return (
    <div className="pagina">
      <div className="riga-spaziata">
        <button
          className="indietro"
          style={{ background: "none", border: 0 }}
          onClick={() => {
            ferma();
            setFase("scelta");
          }}
        >
          {Icone.indietro} Esci
        </button>
        <span className="tenue piccolo">
          Domanda {pos + 1} di {coda.length}
        </span>
      </div>
      <div className="tenue piccolo">{corrente.titolo.slice(0, 80)}</div>
      <Virgilio>
        <p>
          <strong>{corrente.d.domanda}</strong>
        </p>
      </Virgilio>

      {fase === "domanda" && (
        <div className="riga" style={{ justifyContent: "center", gap: 10 }}>
          <Attesa />
          <span className="tenue">{parla ? "Ti sto facendo la domanda…" : "Un attimo…"}</span>
        </div>
      )}

      {fase === "ascolto" && (
        <>
          {ascoltoDisponibile() ? (
            <>
              <button className="microfono attivo" onClick={() => void haiFinito()} aria-label="Ho finito">
                {Icone.stop}
              </button>
              <p className="tenue piccolo" style={{ textAlign: "center" }}>
                Ti ascolto… quando hai finito tocca il pulsante
              </p>
              <div className="trascrizione">{testo || <span className="tenue">…</span>}</div>
            </>
          ) : (
            <textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi la tua risposta" />
          )}
          {errore && <div className="avviso">{errore}</div>}
          <div className="colonna" style={{ marginTop: 12 }}>
            {!ascoltoDisponibile() && (
              <button className="btn btn-largo" onClick={() => void haiFinito()}>
                Controlla
              </button>
            )}
            <button className="btn btn-tenue btn-largo" onClick={() => void faiDomanda(coda, pos)}>
              Ripeti la domanda
            </button>
            <button className="btn btn-bordo btn-largo" onClick={() => void haiFinito(true)}>
              Non lo so
            </button>
          </div>
        </>
      )}

      {fase === "esito" && esito && (
        <>
          <div className="carta">
            <div className="riga-spaziata">
              <div className="voto-grande" style={{ fontSize: "1.6rem" }}>
                {SEGNO[esito.verdetto]} {nonso ? "Non lo sapevi" : PAROLE[esito.verdetto]}
              </div>
              {parla && <Attesa />}
            </div>
            {!nonso && esito.dette.length > 0 && (
              <p>
                <span className="etichetta">Hai detto</span>
                <br />
                {esito.dette.map((p, i) => (
                  <span key={i} className="verifica verifica-ok" style={{ display: "inline-block", margin: "2px 4px 2px 0", padding: "2px 8px" }}>
                    {p}
                  </span>
                ))}
              </p>
            )}
            {esito.mancanti.length > 0 && (
              <p>
                <span className="etichetta">{nonso ? "I punti" : "Ti è mancato"}</span>
                <br />
                {esito.mancanti.map((p, i) => (
                  <span key={i} className="avviso" style={{ display: "inline-block", margin: "2px 4px 2px 0", padding: "2px 8px" }}>
                    {p}
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className="carta">
            <div className="etichetta">La risposta giusta</div>
            <TestoRicco testo={corrente.d.risposta} />
            <button
              className="btn btn-tenue btn-piccolo"
              onClick={() => {
                ferma();
                void dici(`${corrente.scheda}--r-${corrente.d.id}`, corrente.d.risposta, giro.current);
              }}
            >
              🔁 Riascolta
            </button>
          </div>
          {!nonso && (
            <details className="carta">
              <summary>Quello che ho capito (puoi correggerlo)</summary>
              <textarea value={testo} onChange={(e) => setTesto(e.target.value)} style={{ marginTop: 8 }} />
            </details>
          )}
          <CorrezioneCompleta voce={corrente} testo={nonso ? "" : testo} chiave={`${corrente.scheda}-${corrente.d.id}`} />
          <div className="colonna" style={{ marginTop: 14 }}>
            <button className="btn btn-terra btn-largo" onClick={avanti}>
              {pos + 1 < coda.length ? "Prossima domanda" : "Vedi il riepilogo"}
            </button>
            <button className="btn btn-tenue btn-largo" onClick={() => void faiDomanda(coda, pos)}>
              Riprova questa domanda
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** La correzione precisa di Virgilio (dal PC): si chiede solo se la vuoi. */
function CorrezioneCompleta({ voce, testo, chiave }: { voce: Voce; testo: string; chiave: string }) {
  const { inviaRichiesta, aspettaRisposta, risposte } = useDati();
  const [rid, setRid] = useState<string | undefined>();
  const [errore, setErrore] = useState("");
  const chiaveAttuale = useRef(chiave);

  useEffect(() => {
    if (chiaveAttuale.current !== chiave) {
      chiaveAttuale.current = chiave;
      setRid(undefined);
    }
  }, [chiave]);
  useEffect(() => (rid ? aspettaRisposta(rid) : undefined), [rid, aspettaRisposta]);

  const risposta = rid ? risposte[rid] : undefined;
  const v = risposta?.stato === "fatta" ? (risposta.output as Valutazione) : undefined;

  async function chiedi() {
    setErrore("");
    try {
      setRid(
        await inviaRichiesta(
          "valuta_ripetizione",
          { argomento: voce.scheda, titolo: voce.titolo, domanda: voce.d.domanda, trascrizione: testo.trim() },
          { argomento: voce.scheda },
        ),
      );
    } catch {
      setErrore("Non riesco a inviare. Controlla la connessione.");
    }
  }

  if (!rid)
    return (
      <>
        <button className="btn btn-bordo btn-largo btn-piccolo" onClick={chiedi} disabled={!testo.trim()}>
          🎓 Fammi correggere meglio da Virgilio
        </button>
        {errore && <div className="avviso">{errore}</div>}
      </>
    );
  if (!v)
    return (
      <div className="carta">
        {risposta?.stato === "errore" ? (
          <div className="avviso">Non sono riuscito a correggerti: {risposta.errore}</div>
        ) : (
          <div className="riga">
            <Attesa />
            <span>{testoAttesa(risposta)}</span>
          </div>
        )}
      </div>
    );
  return (
    <div className="carta">
      <div className="etichetta">La correzione di Virgilio · voto indicativo {v.voto}</div>
      <TestoRicco testo={v.giudizio} />
      {v.punti.map((p, i) => (
        <div key={i} className="esito">
          <span>{p.esito === "detto" ? "✅" : p.esito === "sbagliato" ? "❌" : "⬜"}</span>
          <div>
            {p.punto}
            {p.nota && <div className="tenue piccolo">{p.nota}</div>}
          </div>
        </div>
      ))}
      {v.dillo_meglio.length > 0 && (
        <ul style={{ paddingLeft: "1.2em" }}>
          {v.dillo_meglio.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
