import { useState } from "react";
import { Link } from "react-router-dom";
import { useDati, salvaConfig, leggiConfig } from "../stato";
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
