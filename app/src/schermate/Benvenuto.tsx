import { useState } from "react";
import { ArchivioGitHub, ErroreArchivio } from "../archivio";
import { Attesa, VoltoVirgilio } from "../componenti";
import { salvaConfig, type Config } from "../stato";

const REPO_PREDEFINITO = "pietro811-tutor/tutor-dati";

export default function Benvenuto({ onPronto }: { onPronto: (c: Config) => void }) {
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState(REPO_PREDEFINITO);
  const [errore, setErrore] = useState("");
  const [attesa, setAttesa] = useState(false);

  async function entra() {
    setErrore("");
    setAttesa(true);
    try {
      const config = { token: token.trim(), repo: repo.trim() };
      await new ArchivioGitHub(config.token, config.repo).verifica();
      salvaConfig(config);
      onPronto(config);
    } catch (e) {
      setErrore(e instanceof ErroreArchivio ? e.message : "Non riesco a collegarmi. Controlla la connessione.");
    } finally {
      setAttesa(false);
    }
  }

  return (
    <div className="pagina pagina-piena">
      <div style={{ textAlign: "center", margin: "24px 0 18px" }}>
        <VoltoVirgilio size={84} />
        <h1 style={{ marginTop: 12 }}>Piacere, sono Virgilio</h1>
        <p className="tenue">Ti accompagno fino all'esame, un passo alla volta.</p>
      </div>
      <div className="carta">
        <h3>Collega il tuo archivio</h3>
        <p className="piccolo tenue">
          Serve una sola volta: incolla la chiave di accesso che hai creato su GitHub. Resta solo su questo telefono.
        </p>
        <label htmlFor="token">Chiave di accesso</label>
        <input id="token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." />
        <label htmlFor="repo">Archivio</label>
        <input id="repo" type="text" value={repo} onChange={(e) => setRepo(e.target.value)} />
        {errore && <div className="avviso" style={{ marginTop: 12 }}>{errore}</div>}
        <button className="btn btn-largo" style={{ marginTop: 16 }} disabled={!token.trim() || attesa} onClick={entra}>
          {attesa ? <Attesa /> : "Entra"}
        </button>
      </div>
    </div>
  );
}
