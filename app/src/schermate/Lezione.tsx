import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDati } from "../stato";
import { Attesa, Icone, TestoRicco, Virgilio } from "../componenti";
import { ascolta, ascoltoDisponibile, leggi, type Ascolto } from "../voce";
import { avviaAudio, leggiScelteVoce, type ControlloAudio } from "../voceScelta";
import { controlloVeloce, type EsitoVeloce } from "../controlloVeloce";
import { cancellaEvidenza, evidenziaFrase, fraseAl } from "../evidenzia";

type Fase = "inizio" | "ascolta" | "ripeti" | "esito" | "fine";
const SEGNO = { bene: "✅", quasi: "🟡", rivediamo: "❌" } as const;
const chiaveSalvata = (id: string) => `tutor:lezione:${id}`;

function pezzoSalvato(id: string): number {
  try {
    return Number(localStorage.getItem(chiaveSalvata(id)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function salvaPezzo(id: string, n: number) {
  try {
    if (n > 0) localStorage.setItem(chiaveSalvata(id), String(n));
    else localStorage.removeItem(chiaveSalvata(id));
  } catch {
    /* pazienza */
  }
}

export default function Lezione() {
  const { id = "" } = useParams();
  const naviga = useNavigate();
  const { schede, lezioni, audio, caricaAudio, caricaTempi, aggiornaProgressi } = useDati();
  const scheda = schede[id];
  const lezione = lezioni[id];
  const passi = lezione?.passi ?? [];

  const [fase, setFase] = useState<Fase>("inizio");
  const [i, setI] = useState(0); // il pezzo in corso (0 = il primo)
  const [inPausa, setInPausa] = useState(false);
  const [carico, setCarico] = useState(false);
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState("");
  const [esiti, setEsiti] = useState<Record<number, EsitoVeloce>>({});
  const [parla, setParla] = useState(false);
  const [senzaVoce, setSenzaVoce] = useState(false); // la voce di Elsa per questo pezzo non e' ancora pronta

  const giro = useRef(0);
  const controllo = useRef<ControlloAudio | null>(null);
  const fermaTelefono = useRef<(() => void) | null>(null);
  const microfono = useRef<Ascolto | null>(null);
  const salvato = pezzoSalvato(id);

  const passo = passi[i];
  const esito = useMemo(
    () => (passo && passo.concetti.length ? controlloVeloce("", passo.concetti.join(". "), testo) : undefined),
    [passo, testo],
  );

  function ferma() {
    giro.current++;
    controllo.current?.ferma();
    controllo.current = null;
    fermaTelefono.current?.();
    fermaTelefono.current = null;
    microfono.current?.ferma();
    microfono.current = null;
    cancellaEvidenza();
    setParla(false);
    setInPausa(false);
  }
  useEffect(() => ferma, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Dice una frase fissa con la voce buona (se c'è), altrimenti con quella del telefono. */
  async function dici(idAudio: string, fallback: string, mio: number) {
    if (mio !== giro.current) return;
    const scelte = leggiScelteVoce();
    const voce = audio[idAudio]?.[scelte.voce] ? scelte.voce : Object.keys(audio[idAudio] ?? {})[0];
    setParla(true);
    try {
      const url = voce ? await caricaAudio(idAudio, voce) : null;
      if (url && mio === giro.current) {
        await new Promise<void>((ok) => {
          void avviaAudio(url, scelte, ok).then((c) => {
            if (mio !== giro.current) {
              c.ferma();
              ok();
            } else controllo.current = c;
          });
        });
      } else if (mio === giro.current && fallback) {
        await new Promise<void>((ok) => {
          const guardia = window.setTimeout(ok, 60000);
          fermaTelefono.current = leggi([fallback], () => {
            window.clearTimeout(guardia);
            ok();
          });
        });
      }
    } finally {
      if (mio === giro.current) setParla(false);
    }
  }

  function entraInRipeti(mio: number) {
    if (mio !== giro.current) return;
    cancellaEvidenza();
    setFase("ripeti");
    setTesto("");
    setErrore("");
    if (ascoltoDisponibile()) microfono.current = ascolta(setTesto, (m) => setErrore(m));
  }

  /** Spiega il pezzo n (da 0): audio con la voce buona, evidenziando la frase che sta leggendo. */
  async function faiPezzo(n: number, conIntro = false) {
    ferma();
    const mio = giro.current;
    const p = passi[n];
    if (!p) return;
    setI(n);
    setTesto("");
    setSenzaVoce(false);
    setFase("ascolta");
    window.scrollTo({ top: 0 });
    if (conIntro) await dici("_frase-l-inizio", "Cominciamo la lezione. Ti spiego un pezzo alla volta, poi tocca a te ripetere.", mio);
    if (mio !== giro.current) return;

    const idAudio = `${id}--l-${p.n}`;
    const scelte = leggiScelteVoce();
    const voce = audio[idAudio]?.[scelte.voce] ? scelte.voce : Object.keys(audio[idAudio] ?? {})[0];
    if (voce) {
      setCarico(true);
      const [url, tempi] = await Promise.all([caricaAudio(idAudio, voce), caricaTempi(idAudio, voce)]);
      setCarico(false);
      if (mio !== giro.current) return;
      if (url) {
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
        const c = await avviaAudio(url, scelte, () => entraInRipeti(mio), { alTempo });
        if (mio !== giro.current) c.ferma();
        else controllo.current = c;
        return;
      }
    }
    // la voce di Elsa per questo pezzo non e' ancora pronta: non uso quella robotica da sola, decidi tu
    setSenzaVoce(true);
  }

  /** Solo se lo chiedi tu: legge il pezzo con la voce del telefono. */
  function leggiConVoceTelefono() {
    const p = passi[i];
    if (!p) return;
    const mio = giro.current;
    setSenzaVoce(false);
    const concetti = p.concetti.length ? ` I concetti da ricordare sono: ${p.concetti.join(", ")}.` : "";
    fermaTelefono.current = leggi([p.titolo, { pausa: 500 }, p.testo, { pausa: 600 }, `Ora tocca a te: ripeti con parole tue.${concetti}`], () => entraInRipeti(mio));
  }

  function mettiInPausa() {
    if (!controllo.current) return;
    if (inPausa) controllo.current.riprendi();
    else controllo.current.pausa();
    setInPausa(!inPausa);
  }

  async function haiFinito() {
    if (!passo) return;
    const finale = microfono.current?.ferma() ?? testo;
    microfono.current = null;
    setTesto(finale);
    const e = passo.concetti.length ? controlloVeloce("", passo.concetti.join(". "), finale) : undefined;
    const mio = ++giro.current;
    setFase("esito");
    if (e) {
      setEsiti((x) => ({ ...x, [i]: e }));
      await dici(`_frase-l-${e.verdetto}`, "", mio);
    }
  }

  // se correggi il testo, il risultato cambia subito
  useEffect(() => {
    if (fase === "esito" && esito) setEsiti((x) => ({ ...x, [i]: esito }));
  }, [esito, fase, i]);

  function prossimo() {
    salvaPezzo(id, passo ? passo.n : 0);
    if (i + 1 < passi.length) void faiPezzo(i + 1);
    else finisci();
  }

  function finisci() {
    ferma();
    setFase("fine");
    salvaPezzo(id, 0);
    aggiornaProgressi((p) => {
      const a = (p.argomenti[id] ??= { tappe: [], ripetizioni: [] });
      if (!a.tappe.includes(3)) a.tappe.push(3);
    });
    void dici("_frase-l-fine", "Abbiamo finito la lezione. Bravo!", ++giro.current);
  }

  // ---------- non pronta ----------
  if (!scheda || !lezione || !passi.length)
    return (
      <div className="pagina">
        <Link to={`/scheda/${id}`} className="indietro">
          {Icone.indietro} Scheda
        </Link>
        <h1>Lezione</h1>
        <div className="carta">
          <div className="riga">
            <Attesa />
            <span>La lezione di questo argomento è ancora in preparazione. Torna tra un po'.</span>
          </div>
        </div>
      </div>
    );

  // ---------- inizio ----------
  if (fase === "inizio")
    return (
      <div className="pagina">
        <Link to={`/scheda/${id}`} className="indietro">
          {Icone.indietro} Scheda
        </Link>
        <h1>{scheda.titolo}</h1>
        <Virgilio>
          <p>
            Facciamo lezione insieme. Ti spiego <strong>un pezzo alla volta</strong> ({passi.length} pezzi, circa un minuto ciascuno). Alla fine di ogni pezzo ti dico i
            concetti da ricordare e <strong>tocca a te ripetere a voce</strong>. Poi andiamo avanti.
          </p>
        </Virgilio>
        <div className="colonna">
          {salvato > 0 && salvato < passi.length && (
            <button className="btn btn-terra btn-largo" onClick={() => void faiPezzo(salvato)}>
              ▶ Riprendi dal pezzo {salvato + 1} di {passi.length}
            </button>
          )}
          <button className={`btn btn-largo ${salvato > 0 && salvato < passi.length ? "btn-tenue" : "btn-terra"}`} onClick={() => void faiPezzo(0, true)}>
            {Icone.cuffie} {salvato > 0 && salvato < passi.length ? "Ricomincia dall'inizio" : "Cominciamo"}
          </button>
        </div>
        <p className="tenue piccolo">
          Con la voce di Elsa: {passi.filter((p) => audio[`${id}--l-${p.n}`]).length} pezzi su {passi.length}.
          {passi.some((p) => !audio[`${id}--l-${p.n}`]) ? " Gli altri sono in preparazione sul PC." : ""}
        </p>
        {!ascoltoDisponibile() && <div className="avviso" style={{ marginTop: 12 }}>Qui non posso ascoltarti: potrai scrivere. Sul telefono con Chrome o Brave funziona a voce.</div>}
      </div>
    );

  // ---------- fine ----------
  if (fase === "fine") {
    const valutati = Object.values(esiti);
    const bene = valutati.filter((e) => e.verdetto === "bene").length;
    return (
      <div className="pagina">
        <h1>Lezione finita</h1>
        <div className="carta">
          <div className="etichetta">Pezzi ripetuti bene</div>
          <div className="voto-grande">
            {bene}/{valutati.length}
          </div>
          <p className="tenue piccolo" style={{ margin: 0 }}>
            Controllo veloce sui concetti che hai nominato. I pezzi con 🟡 o ❌ conviene riascoltarli.
          </p>
        </div>
        <div className="carta">
          {passi.map((p, k) => (
            <div key={k} className="esito">
              <span>{esiti[k] ? SEGNO[esiti[k].verdetto] : "⬜"}</span>
              <div>{p.titolo}</div>
            </div>
          ))}
        </div>
        <div className="colonna">
          <Link to={`/interrogazione?argomento=${id}`} className="btn btn-terra btn-largo">
            🎤 Interrogami su questo argomento
          </Link>
          <button className="btn btn-tenue btn-largo" onClick={() => setFase("inizio")}>
            Rifai la lezione
          </button>
          <button className="btn btn-bordo btn-largo" onClick={() => naviga("/programma")}>
            Torna al programma
          </button>
        </div>
      </div>
    );
  }

  if (!passo) return null;

  // ---------- ascolta / ripeti / esito ----------
  return (
    <div className="pagina">
      <div className="riga-spaziata">
        <button
          className="indietro"
          style={{ background: "none", border: 0 }}
          onClick={() => {
            ferma();
            setFase("inizio");
          }}
        >
          {Icone.indietro} Esci
        </button>
        <span className="tenue piccolo">
          Pezzo {i + 1} di {passi.length}
        </span>
      </div>
      <div className="tappe" style={{ marginBottom: 8 }}>
        <div style={{ height: 6, borderRadius: 3, background: "var(--bordo, #444)", overflow: "hidden", width: "100%" }}>
          <div style={{ height: "100%", width: `${((i + (fase === "esito" ? 1 : 0.5)) / passi.length) * 100}%`, background: "var(--verde, #7fb08a)" }} />
        </div>
      </div>
      <h2 style={{ marginTop: 4 }}>{passo.titolo}</h2>

      <div className="carta" key={passo.n} data-leggibile="">
        <TestoRicco testo={passo.testo} />
      </div>

      {fase === "ascolta" && senzaVoce && (
        <div className="carta">
          <p style={{ marginTop: 0 }}>
            La voce di Elsa per questo pezzo è <strong>ancora in preparazione</strong> sul PC. Puoi leggerlo da solo qui sopra, aspettare qualche minuto, oppure
            sentirlo con la voce del telefono.
          </p>
          <div className="colonna">
            <button className="btn btn-tenue btn-largo" onClick={leggiConVoceTelefono}>
              Leggi con la voce del telefono
            </button>
            <button className="btn btn-largo" onClick={() => entraInRipeti(giro.current)}>
              Ho letto: tocca a me ripetere
            </button>
          </div>
        </div>
      )}

      {fase === "ascolta" && !senzaVoce && (
        <div className="colonna">
          <div className="riga" style={{ gap: 8 }}>
            <button className="btn btn-largo" onClick={mettiInPausa} disabled={carico || !controllo.current}>
              {carico ? "Un attimo…" : inPausa ? "▶ Riprendi" : "⏸ Pausa"}
            </button>
            <button className="btn btn-tenue btn-largo" onClick={() => entraInRipeti(giro.current)}>
              Salta ⏭
            </button>
          </div>
        </div>
      )}

      {fase !== "ascolta" && passo.concetti.length > 0 && (
        <div className="carta">
          <div className="etichetta">Concetti da ripetere</div>
          {passo.concetti.map((c, k) => {
            const detto = fase === "esito" && esito?.dette.some((d) => c.toLowerCase().includes(d.toLowerCase()));
            return (
              <span
                key={k}
                className={detto ? "verifica verifica-ok" : "verifica"}
                style={{ display: "inline-block", margin: "2px 4px 2px 0", padding: "2px 10px" }}
              >
                {c}
              </span>
            );
          })}
        </div>
      )}

      {fase === "ripeti" && (
        <>
          <Virgilio>
            <p>
              Ora tocca a te: <strong>ripeti con parole tue</strong> i concetti di questo pezzo.
            </p>
          </Virgilio>
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
            <textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi con parole tue" />
          )}
          {errore && <div className="avviso">{errore}</div>}
          <div className="colonna" style={{ marginTop: 12 }}>
            {!ascoltoDisponibile() && (
              <button className="btn btn-largo" onClick={() => void haiFinito()}>
                Controlla
              </button>
            )}
            <button className="btn btn-tenue btn-largo" onClick={() => void faiPezzo(i)}>
              ↺ Riascolta il pezzo
            </button>
            <button className="btn btn-bordo btn-largo" onClick={prossimo}>
              Salta e vai avanti
            </button>
          </div>
        </>
      )}

      {fase === "esito" && (
        <>
          {esito ? (
            <div className="carta">
              <div className="riga-spaziata">
                <div className="voto-grande" style={{ fontSize: "1.5rem" }}>
                  {SEGNO[esito.verdetto]} {esito.verdetto === "bene" ? "Bene" : esito.verdetto === "quasi" ? "Quasi" : "Da rivedere"}
                </div>
                {parla && <Attesa />}
              </div>
              {esito.mancanti.length > 0 && (
                <p className="tenue piccolo" style={{ marginBottom: 0 }}>
                  Parole che non ho sentito: {esito.mancanti.join(", ")}
                </p>
              )}
            </div>
          ) : (
            <div className="carta">
              <p style={{ margin: 0 }}>Questo pezzo non ha concetti da controllare: andiamo avanti quando vuoi.</p>
            </div>
          )}
          <details className="carta">
            <summary>Quello che ho capito (puoi correggerlo)</summary>
            <textarea value={testo} onChange={(e) => setTesto(e.target.value)} style={{ marginTop: 8 }} />
          </details>
          <div className="colonna" style={{ marginTop: 14 }}>
            <button className="btn btn-terra btn-largo" onClick={prossimo}>
              {i + 1 < passi.length ? "Prossimo pezzo" : "Finisci la lezione"}
            </button>
            <button className="btn btn-tenue btn-largo" onClick={() => void faiPezzo(i)}>
              ↺ Riascolta questo pezzo
            </button>
            <button className="btn btn-tenue btn-largo" onClick={() => entraInRipeti(giro.current)}>
              🎤 Ripeti ancora
            </button>
          </div>
        </>
      )}
    </div>
  );
}
