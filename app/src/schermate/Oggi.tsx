import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDati, oggi } from "../stato";
import { Attesa, Foglio, Stelle, Virgilio } from "../componenti";
import { Domanda } from "./Domanda";
import { carteDaRipassare, livello, pianoDiOggi, NOMI_LIVELLO, type Livello } from "../piano";
import { bentornato, fraseDelGiorno, rispostaUmore, saluto } from "../virgilio";
import type { Umore } from "../tipi";

const UMORI: { u: Umore; emoji: string; testo: string }[] = [
  { u: "stanco", emoji: "😴", testo: "Stanco" },
  { u: "normale", emoji: "🙂", testo: "Normale" },
  { u: "carico", emoji: "🔥", testo: "Carico" },
];

function giorniDaUltimoStudio(giorni: string[]) {
  const passati = giorni.filter((g) => g < oggi()).sort();
  const ultimo = passati.at(-1);
  if (!ultimo) return 0;
  return Math.round((new Date(oggi()).getTime() - new Date(ultimo).getTime()) / 86400000);
}

export default function Oggi() {
  const { pronto, errore, esame, esami, programma, schede, materiali, progressi, aggiornaProgressi } = useDati();
  const [chiedi, setChiedi] = useState<null | { rid?: string; domanda?: string }>(null);
  const umore = progressi.checkin[oggi()];
  const nome = progressi.nome;

  if (!pronto)
    return (
      <div className="pagina vuoto">
        <Attesa />
      </div>
    );

  const argomenti = programma?.argomenti ?? [];
  const piano = pianoDiOggi(argomenti, progressi, esame?.data_esame, umore);
  const carte = carteDaRipassare(schede, progressi);
  const daLeggere = materiali.filter((m) => m.stato === "attesa").length;
  const assenza = giorniDaUltimoStudio(progressi.giorni_studio);
  const conteggi = [0, 0, 0, 0];
  argomenti.forEach((a) => conteggi[livello(progressi, a.id)]++);
  const settimana = progressi.giorni_studio.filter((g) => g >= new Date(Date.now() - 6 * 86400000).toLocaleDateString("sv-SE")).length;

  return (
    <div className="pagina">
      <div className="riga-spaziata" style={{ marginBottom: 14 }}>
        <div className="tenue piccolo">{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
        <Link to="/impostazioni" className="tenue piccolo">
          Impostazioni
        </Link>
      </div>

      <Virgilio>
        <p>
          <strong>{saluto(nome)}</strong> {umore ? rispostaUmore(umore) : (bentornato(assenza) ?? fraseDelGiorno(oggi()))}
        </p>
        {daLeggere > 0 && (
          <p className="piccolo tenue">
            Sto leggendo {daLeggere === 1 ? "un materiale nuovo" : `${daLeggere} materiali nuovi`}: appena ho finito aggiorno le schede.
          </p>
        )}
      </Virgilio>

      <div style={{ height: 16 }} />

      {errore && <div className="avviso">Non riesco ad aggiornare: {errore}. Uso i dati già salvati sul telefono.</div>}

      {!umore && (
        <div className="carta">
          <div className="etichetta">Come stai oggi?</div>
          <div className="umori">
            {UMORI.map(({ u, emoji, testo }) => (
              <button key={u} onClick={() => aggiornaProgressi((p) => void (p.checkin[oggi()] = u))}>
                <span>{emoji}</span>
                {testo}
              </button>
            ))}
          </div>
        </div>
      )}

      {!esame && (
        <Link to="/materie" className="carta carta-cliccabile">
          <div className="etichetta">Per cominciare</div>
          <h3>Dimmi che materia studiamo</h3>
          <p className="tenue piccolo" style={{ margin: 0 }}>Ne puoi aggiungere quante vuoi: ognuna ha la sua cartella.</p>
        </Link>
      )}

      {esame && (
        <div className="carta riga-spaziata">
          <div>
            <div className="etichetta">{esame.nome}</div>
            <Link to="/materie" className="piccolo" style={{ display: "block", marginBottom: 4 }}>
              {esami.length > 1 ? "Cambia materia" : "Aggiungi un'altra materia"}
            </Link>
            {piano.giorni != null ? (
              <div className="tenue piccolo">{piano.giorni > 0 ? esame.tipo === "orale" ? "giorni all'orale" : "giorni all'esame" : piano.giorni === 0 ? "L'orale è oggi. In bocca al lupo!" : "Esame passato"}</div>
            ) : (
              <Link to="/impostazioni" className="piccolo">
                Dimmi la data dell'esame
              </Link>
            )}
          </div>
          {piano.giorni != null && piano.giorni > 0 && <div className="contatore">{piano.giorni}</div>}
        </div>
      )}

      <h2 style={{ marginTop: 22 }}>Adesso</h2>

      {!programma && materiali.length === 0 && (
        <Link to="/carica" className="carta carta-cliccabile">
          <div className="etichetta">Per cominciare</div>
          <h3>Fammi vedere i tuoi materiali</h3>
          <p className="tenue piccolo">Foto del libro, appunti, PDF, audio delle lezioni. Al resto penso io.</p>
        </Link>
      )}

      {!programma && materiali.length > 0 && (
        <div className="carta riga">
          <Attesa />
          <div>
            <h3>Sto preparando il programma</h3>
            <p className="tenue piccolo" style={{ margin: 0 }}>
              {daLeggere > 0 ? `Ho ancora ${daLeggere} materiali da leggere.` : "Ho letto tutto: ora divido gli argomenti e scrivo le schede."} Ci vuole un po', intanto puoi caricare altro.
            </p>
          </div>
        </div>
      )}

      {carte.length > 0 && (
        <Link to="/ripasso" className="carta carta-cliccabile">
          <div className="etichetta">Ripasso flash</div>
          <h3>
            {carte.length} {carte.length === 1 ? "carta" : "carte"} da ripassare
          </h3>
          <p className="tenue piccolo" style={{ margin: 0 }}>
            Circa {Math.max(2, Math.round(carte.length * 0.3))} minuti. Prima questo, così la memoria resta fresca.
          </p>
        </Link>
      )}

      {programma && piano.faseRipasso && (
        <div className="avviso">Siamo agli ultimi giorni: niente argomenti nuovi, solo ripasso e ripetizioni ad alta voce.</div>
      )}

      {programma &&
        piano.argomentiOggi.map((a) => {
          const pronta = !!schede[a.id];
          const liv = livello(progressi, a.id);
          return (
            <Link key={a.id} to={`/scheda/${a.id}`} className="carta carta-cliccabile">
              <div className="riga-spaziata">
                <div className="etichetta">{liv === 0 ? "Argomento nuovo" : "Continuiamo"}</div>
                <Stelle n={a.importanza} />
              </div>
              <h3>{a.titolo}</h3>
              <p className="tenue piccolo" style={{ margin: 0 }}>
                {pronta ? a.sintesi : "Sto ancora scrivendo questa scheda…"}
              </p>
            </Link>
          );
        })}

      {programma && piano.mancanti === 0 && (
        <div className="carta">
          <h3>Hai fatto tutto il programma!</h3>
          <p className="tenue" style={{ margin: 0 }}>
            Ora si ripassa e si ripete ad alta voce. Scegli un argomento dal Programma e fammelo sentire.
          </p>
        </div>
      )}

      {esame && (
        <div className="carta">
          <div className="etichetta">Mettiti alla prova</div>
          <Link to="/interrogazione" className="btn btn-terra btn-largo">
            🎤 Interrogami a voce
          </Link>
          <p className="tenue piccolo" style={{ margin: "8px 0 0" }}>
            Ti faccio le domande, rispondi parlando e ti dico subito com'è andata.
          </p>
        </div>
      )}
      {esame && <ChiediCarta onApri={setChiedi} />}
      <CartaMotore />

      {argomenti.length > 0 && (
        <>
          <h2 style={{ marginTop: 22 }}>Come stai andando</h2>
          <div className="carta">
            <div className="barra" style={{ marginBottom: 12 }}>
              {conteggi.map((n, l) => (n ? <span key={l} className={`liv-${l}`} style={{ width: `${(n / argomenti.length) * 100}%` }} /> : null))}
            </div>
            <div className="riga" style={{ flexWrap: "wrap", gap: 14 }}>
              {conteggi.map((n, l) => (
                <span key={l} className="riga piccolo" style={{ gap: 6 }}>
                  <span className={`puntino liv-${l as Livello}`} /> {NOMI_LIVELLO[l]}: {n}
                </span>
              ))}
            </div>
            {settimana > 0 && (
              <p className="tenue piccolo" style={{ margin: "12px 0 0" }}>
                Questa settimana hai studiato {settimana} {settimana === 1 ? "giorno" : "giorni"}.
              </p>
            )}
          </div>
        </>
      )}

      {chiedi && (
        <Foglio onChiudi={() => setChiedi(null)}>
          <div className="etichetta">Chiedi a Virgilio</div>
          <Domanda rid={chiedi.rid} domandaFatta={chiedi.domanda} />
          <button className="btn btn-tenue btn-largo" style={{ marginTop: 8 }} onClick={() => setChiedi(null)}>
            Chiudi
          </button>
        </Foglio>
      )}
    </div>
  );
}

/** Cosa sta facendo il PC, e il pulsante per metterlo in pausa (per non finire la quota del Pro). */
function CartaMotore() {
  const { motore, inPausa, impostaPausa } = useDati();
  const [errore, setErrore] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const vivo = motore && Date.now() - new Date(motore.aggiornato).getTime() < 15 * 60000;

  let titolo = "Il PC non risponde";
  let dettaglio = "È spento, oppure il motore di Virgilio non è acceso. Le schede restano ferme; le tue richieste le trova quando riparte.";
  if (inPausa && vivo) {
    titolo = "In pausa";
    dettaglio = motore?.stato === "pausa" ? "Il PC non fa lavori nuovi, così non consumi la quota del Pro. Le domande a Virgilio funzionano lo stesso." : "Finisce la scheda che sta scrivendo e poi si ferma.";
  } else if (inPausa) {
    titolo = "In pausa";
    dettaglio = "Quando il PC si accende resta fermo finché non premi Riprendi.";
  } else if (vivo && motore) {
    if (motore.stato === "lavora") {
      titolo = "Al lavoro";
      // per le schede c'e' la barra qui sotto: niente riga doppia
      dettaglio = motore.cosa?.startsWith("Scheda:") ? "" : (motore.cosa ?? "");
    } else if (motore.stato === "limite") {
      titolo = "Aspetta che si rinnovi la quota";
      dettaglio = "La quota del tuo Claude Pro è finita: riprende da solo appena torna disponibile.";
    } else {
      titolo = "Ha finito tutto";
      dettaglio = "Non c'è niente da preparare: aspetta nuovi materiali.";
    }
  }

  async function cambia() {
    setErrore("");
    setLavoro(true);
    try {
      await impostaPausa(!inPausa);
    } catch {
      setErrore("Non riesco a salvarlo. Controlla la connessione.");
    } finally {
      setLavoro(false);
    }
  }

  return (
    <div className="carta">
      <div className="etichetta">Virgilio sul PC</div>
      <h3 style={{ margin: "0 0 4px" }}>{titolo}</h3>
      {dettaglio && <p className="tenue piccolo" style={{ margin: "0 0 10px" }}>{dettaglio}</p>}
      <Avanzamento attivo={!!vivo && !inPausa && motore?.stato === "lavora"} />
      <div style={{ height: 10 }} />
      {errore && <div className="avviso" style={{ marginBottom: 10 }}>{errore}</div>}
      <button className={`btn btn-largo ${inPausa ? "" : "btn-bordo"}`} disabled={lavoro} onClick={cambia}>
        {inPausa ? "▶️ Riprendi il lavoro" : "⏸️ Metti in pausa"}
      </button>
    </div>
  );
}

const quantoTempo = (secondi: number) => {
  const min = Math.round(secondi / 60);
  if (min < 1) return "meno di un minuto";
  if (min < 60) return `${min} min`;
  const ore = Math.floor(min / 60);
  return `${ore} h${min % 60 ? ` ${min % 60} min` : ""}`;
};

function Barra({ valore, totale, alto = 10 }: { valore: number; totale: number; alto?: number }) {
  const quota = totale ? Math.min(1, valore / totale) : 0;
  return (
    <div style={{ height: alto, borderRadius: alto, background: "rgba(127,127,127,0.25)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${quota * 100}%`, background: "#7fb08a", transition: "width .6s" }} />
    </div>
  );
}

/** Quante schede sono pronte, quale sta scrivendo adesso e quanto manca. */
function Avanzamento({ attivo }: { attivo: boolean }) {
  const { programma, schede, motore } = useDati();
  const [adesso, setAdesso] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAdesso(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);
  const argomenti = programma?.argomenti ?? [];
  if (!argomenti.length) return null;

  const pronte = argomenti.filter((a) => schede[a.id]).length;
  const mancano = argomenti.length - pronte;
  const media = motore?.media_secondi ?? 270;
  const daInizio = attivo && motore?.inizio ? Math.max(0, (adesso - new Date(motore.inizio).getTime()) / 1000) : 0;
  const inCorso = attivo && motore?.cosa?.startsWith("Scheda:");
  // la scheda in corso conta "a pezzi": non sappiamo a che punto e', ma il tempo trascorso dice circa quanto
  const frazione = inCorso ? Math.min(0.95, daInizio / media) : 0;
  const rimasto = mancano > 0 ? (mancano - (inCorso ? frazione : 0)) * media : 0;
  const livelli = [3, 2, 1].map((n) => {
    const lista = argomenti.filter((a) => a.importanza === n);
    return { n, totale: lista.length, pronte: lista.filter((a) => schede[a.id]).length };
  });

  return (
    <div>
      <div className="riga-spaziata">
        <span>
          <strong>
            {pronte} schede pronte su {argomenti.length}
          </strong>
        </span>
        {mancano > 0 && <span className="tenue piccolo">{Math.round(((pronte + (inCorso ? frazione : 0)) / argomenti.length) * 100)}%</span>}
      </div>
      <div style={{ margin: "6px 0 10px" }}>
        <Barra valore={pronte + (inCorso ? frazione : 0)} totale={argomenti.length} alto={12} />
      </div>
      {inCorso && (
        <div style={{ marginBottom: 10 }}>
          <div className="tenue piccolo">Sto scrivendo adesso</div>
          <div>{motore!.cosa!.replace(/^Scheda:\s*/, "")}</div>
          <div style={{ margin: "6px 0 2px" }}>
            <Barra valore={frazione} totale={1} alto={6} />
          </div>
          <div className="tenue piccolo">
            da {quantoTempo(daInizio)} · di solito ci mette circa {quantoTempo(media)}
          </div>
        </div>
      )}
      {mancano > 0 && attivo && (
        <p className="tenue piccolo" style={{ margin: "0 0 8px" }}>
          Ne mancano {mancano}: finito tra circa {quantoTempo(rimasto)}, se il Pro regge.
        </p>
      )}
      {mancano > 0 && !attivo && (
        <p className="tenue piccolo" style={{ margin: "0 0 8px" }}>
          Ne mancano {mancano}. A questo ritmo ci vorrebbero circa {quantoTempo(mancano * media)} di lavoro.
        </p>
      )}
      <div className="piccolo">
        {livelli.map((l) =>
          l.totale ? (
            <div key={l.n} className="riga" style={{ gap: 8, margin: "3px 0" }}>
              <span style={{ width: 44 }}>{"★".repeat(l.n)}</span>
              <div style={{ flex: 1 }}>
                <Barra valore={l.pronte} totale={l.totale} alto={6} />
              </div>
              <span className="tenue" style={{ width: 44, textAlign: "right" }}>
                {l.pronte}/{l.totale}
              </span>
            </div>
          ) : null,
        )}
      </div>
      {(motore?.audio_da_fare ?? 0) > 0 && (
        <p className="tenue piccolo" style={{ margin: "8px 0 0" }}>
          🎧 Audio con la voce di Elsa ancora da preparare: {motore!.audio_da_fare}
        </p>
      )}
    </div>
  );
}

function ChiediCarta({ onApri }: { onApri: (c: { rid?: string; domanda?: string }) => void }) {
  const { progressi } = useDati();
  const recenti = progressi.richieste.filter((r) => r.tipo === "domanda" && !r.argomento).slice(-3).reverse();
  return (
    <div className="carta">
      <div className="etichetta">Hai un dubbio?</div>
      <button className="btn btn-largo" onClick={() => onApri({})}>
        ❓ Chiedi a Virgilio
      </button>
      <p className="tenue piccolo" style={{ margin: "8px 0 0" }}>
        Su un argomento, su una parola, o su cosa c'è nei tuoi materiali.
      </p>
      {recenti.map((r) => (
        <button
          key={r.id}
          className="btn btn-bordo btn-largo btn-piccolo"
          style={{ justifyContent: "flex-start", marginTop: 6 }}
          onClick={() => onApri({ rid: r.id, domanda: r.testo })}
        >
          {(r.testo ?? "").slice(0, 60)}
        </button>
      ))}
    </div>
  );
}
