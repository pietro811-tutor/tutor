import { useEffect, useState } from "react";
import { ArchivioGitHub, ErroreArchivio } from "../archivio";
import { Attesa, VoltoVirgilio } from "../componenti";
import { salvaConfig, type Config } from "../stato";
import { diagnosi, ricordaPassword, passwordSalvata } from "../copiaChiave";

const REPO_PREDEFINITO = "pietro811-tutor/tutor-dati";

export default function Benvenuto({ onPronto }: { onPronto: (c: Config) => void }) {
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState(REPO_PREDEFINITO);
  const [errore, setErrore] = useState("");
  const [attesa, setAttesa] = useState(false);
  const [dettagli, setDettagli] = useState<string[]>([]);
  // perche' la chiave non c'e'? Lo scrivo qui sotto: se capita, basta uno screenshot
  useEffect(() => {
    void diagnosi().then(setDettagli);
  }, []);

  async function entra() {
    if (!token.trim() || attesa) return;
    setErrore("");
    setAttesa(true);
    try {
      const config = { token: token.trim(), repo: repo.trim() };
      await new ArchivioGitHub(config.token, config.repo).verifica();
      salvaConfig(config);
      await ricordaPassword(config);
      onPronto(config);
    } catch (e) {
      setErrore(e instanceof ErroreArchivio ? e.message : "Non riesco a collegarmi. Controlla la connessione.");
    } finally {
      setAttesa(false);
    }
  }

  async function conPasswordSalvata() {
    setErrore("");
    const c = await passwordSalvata(true);
    if (!c) {
      setErrore("Il telefono non mi ha dato nessuna password salvata. Incolla la chiave qui sotto: ti chiederà se salvarla.");
      return;
    }
    setToken(c.token);
    setRepo(c.repo);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void entra();
          }}
        >
          <label htmlFor="repo">Archivio</label>
          <input id="repo" name="username" type="text" autoComplete="username" value={repo} onChange={(e) => setRepo(e.target.value)} />
          <label htmlFor="token">Chiave di accesso</label>
          <input id="token" name="password" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." />
          {errore && <div className="avviso" style={{ marginTop: 12 }}>{errore}</div>}
          <button type="submit" className="btn btn-largo" style={{ marginTop: 16 }} disabled={!token.trim() || attesa}>
            {attesa ? <Attesa /> : "Entra"}
          </button>
        </form>
        <button type="button" className="btn btn-largo btn-tenue" style={{ marginTop: 10 }} onClick={conPasswordSalvata}>
          🔐 Usa la password salvata (impronta)
        </button>
      </div>
      {dettagli.length > 0 && (
        <details className="piccolo tenue" style={{ marginTop: 14 }}>
          <summary>Perché mi chiede la chiave? (dettagli, da mandare a Claude)</summary>
          <div style={{ marginTop: 6, lineHeight: 1.5 }}>
            {dettagli.map((r, i) => (
              <div key={i}>{r}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
