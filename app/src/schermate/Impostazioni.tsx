import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDati, salvaConfig, leggiConfig } from "../stato";
import { VOCI, avviaAudio, leggiScelteVoce, salvaScelteVoce, type ScelteVoce } from "../voceScelta";
import { Attesa, Icone } from "../componenti";
import { leggiChiaveGemini, modelliGemini, salvaChiaveGemini } from "../gemini";

function Gemini() {
  const [chiave, setChiave] = useState(leggiChiaveGemini());
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const [prova, setProva] = useState(false);

  async function salvaEProva() {
    const k = chiave.trim();
    salvaChiaveGemini(k);
    setEsito(null);
    if (!k) {
      setEsito({ ok: true, testo: "Chiave tolta: a PC spento si aspetta il PC." });
      return;
    }
    setProva(true);
    try {
      const modelli = await modelliGemini(k);
      setEsito({ ok: true, testo: `Funziona! A PC spento userò ${modelli[0]}.` });
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof Error ? e.message : "Non riesco a collegarmi a Gemini." });
    } finally {
      setProva(false);
    }
  }

  return (
    <div className="carta">
      <h3>Riserva a PC spento: Gemini</h3>
      <p className="tenue piccolo">
        Se il PC è spento, la valutazione di "Ripeti tu" e la penna le fa Gemini, gratis. Serve una chiave gratuita: creala su{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          aistudio.google.com/apikey
        </a>{" "}
        con il tuo account Google e incollala qui. Resta solo su questo telefono.
      </p>
      <p className="tenue piccolo">
        ⚠️ Nel piano gratuito Google può usare quello che gli mandi (pezzi della scheda e le tue risposte) per migliorare i suoi prodotti. E ha un numero
        limitato di richieste al giorno.
      </p>
      <label htmlFor="gemini">Chiave Gemini (facoltativa)</label>
      <input id="gemini" type="password" autoComplete="off" value={chiave} onChange={(e) => setChiave(e.target.value)} placeholder="AIza..." />
      {esito && (
        <div className={esito.ok ? "verifica verifica-ok" : "avviso"} style={{ marginTop: 12 }}>
          {esito.testo}
        </div>
      )}
      <button className="btn btn-tenue btn-largo" style={{ marginTop: 12 }} onClick={salvaEProva} disabled={prova}>
        {prova ? <Attesa /> : "Salva e prova"}
      </button>
    </div>
  );
}

function VoceAudio() {
  const { audio, caricaAudio } = useDati();
  const [scelte, setScelte] = useState(leggiScelteVoce());
  const [prova, setProva] = useState<null | (() => void)>(null);
  const [attesa, setAttesa] = useState(false);
  const cambia = (n: Partial<ScelteVoce>) => {
    const v = { ...scelte, ...n };
    setScelte(v);
    salvaScelteVoce(v);
  };
  const conAudio = (voce: string) => Object.values(audio).filter((m) => m[voce]).length;
  useEffect(() => () => prova?.(), [prova]);

  async function provaVoce() {
    if (prova) {
      prova();
      setProva(null);
      return;
    }
    const id = Object.keys(audio).find((i) => audio[i][scelte.voce]);
    if (!id) return;
    setAttesa(true);
    const url = await caricaAudio(id, scelte.voce);
    setAttesa(false);
    if (!url) return;
    // 15 secondi bastano per sentire voce, velocita' e volume
    const c = await avviaAudio(url, scelte, () => setProva(null), { massimoMs: 15000 });
    setProva(() => c.ferma);
  }

  return (
    <div className="carta">
      <h3>Voce degli audio</h3>
      <p className="tenue piccolo">Con questa voce Virgilio ti legge i riassunti. La velocità la cambi qui, subito, senza aspettare nulla.</p>
      <label>Voce</label>
      <div className="riga-spaziata" style={{ gap: 8, justifyContent: "flex-start" }}>
        {VOCI.map((v) => (
          <button key={v.id} className={`btn btn-piccolo ${scelte.voce === v.id ? "" : "btn-tenue"}`} onClick={() => cambia({ voce: v.id })}>
            {v.nome} {conAudio(v.id) ? `(${conAudio(v.id)} pronti)` : "(in preparazione)"}
          </button>
        ))}
      </div>
      <label htmlFor="vel">Velocità: {scelte.velocita.toFixed(2).replace(".", ",")}×</label>
      <input id="vel" type="range" min="0.7" max="1.4" step="0.05" value={scelte.velocita} onChange={(e) => cambia({ velocita: Number(e.target.value) })} />
      <div className="riga-spaziata piccolo tenue">
        <span>più lenta</span>
        <span>più veloce</span>
      </div>
      <label htmlFor="timbro">Timbro: {scelte.timbro === 0 ? "naturale" : scelte.timbro < 0 ? "più caldo" : "più chiaro"}</label>
      <input id="timbro" type="range" min="-1" max="1" step="0.1" value={scelte.timbro} onChange={(e) => cambia({ timbro: Number(e.target.value) })} />
      <div className="riga-spaziata piccolo tenue">
        <span>caldo e profondo</span>
        <span>chiaro e brillante</span>
      </div>
      <label htmlFor="vol">Volume: {Math.round(scelte.volume * 100)}%</label>
      <input id="vol" type="range" min="0.5" max="2" step="0.1" value={scelte.volume} onChange={(e) => cambia({ volume: Number(e.target.value) })} />
      <div className="riga-spaziata piccolo tenue">
        <span>più piano</span>
        <span>più forte</span>
      </div>
      <button className="btn btn-tenue btn-largo" style={{ marginTop: 12 }} disabled={!conAudio(scelte.voce) || attesa} onClick={provaVoce}>
        {attesa ? "Un attimo…" : prova ? "Ferma la prova" : "▶ Prova la voce"}
      </button>
    </div>
  );
}

export default function Impostazioni({ onEsci }: { onEsci: () => void }) {
  const { esame, progressi, salvaEsame, aggiornaProgressi } = useDati();
  const [nome, setNome] = useState(progressi.nome);
  const [nomeEsame, setNomeEsame] = useState(esame?.nome ?? "");
  const [data, setData] = useState(esame?.data_esame ?? "");
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState("");

  async function salva() {
    setErrore("");
    try {
      aggiornaProgressi((p) => void (p.nome = nome.trim()));
      if (esame)
        await salvaEsame({
          slug: esame.slug,
          nome: nomeEsame.trim() || esame.nome,
          tipo: esame.tipo,
          ...(data ? { data_esame: data } : {}),
        });
      setSalvato(true);
    } catch {
      setErrore("Non riesco a salvare. Controlla la connessione.");
    }
  }

  return (
    <div className="pagina">
      <Link to="/" className="indietro">
        {Icone.indietro} Oggi
      </Link>
      <h1>Impostazioni</h1>
      <div className="carta">
        <label htmlFor="nome">Come ti chiamo?</label>
        <input id="nome" type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
        {esame ? (
          <>
            <label htmlFor="esame">Materia che stai studiando</label>
            <input id="esame" type="text" value={nomeEsame} onChange={(e) => setNomeEsame(e.target.value)} />
            <label htmlFor="data">Data dell'esame</label>
            <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </>
        ) : null}
        <Link to="/materie" className="piccolo" style={{ display: "inline-block", marginTop: 10 }}>
          Cambia o aggiungi una materia
        </Link>
        {errore && <div className="avviso" style={{ marginTop: 12 }}>{errore}</div>}
        <button className="btn btn-largo" style={{ marginTop: 16 }} onClick={salva}>
          {salvato ? "Salvato ✓" : "Salva"}
        </button>
      </div>
      <VoceAudio />
      <Gemini />
      {leggiConfig() && (
        <div className="carta">
          <h3>Collegamento</h3>
          <p className="tenue piccolo">Archivio: {leggiConfig()?.repo}</p>
          <button
            className="btn btn-bordo btn-largo"
            onClick={() => {
              if (confirm("Scollego questo telefono? I tuoi dati restano al sicuro nell'archivio.")) {
                salvaConfig(null);
                onEsci();
              }
            }}
          >
            Scollega questo telefono
          </button>
        </div>
      )}
    </div>
  );
}
