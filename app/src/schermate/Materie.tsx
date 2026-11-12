import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDati } from "../stato";
import { Icone, Virgilio } from "../componenti";
import type { Esame } from "../tipi";

/** Le tue materie: ne scegli una e l'app riapre sempre quella, finché non la cambi. */
export default function Materie() {
  const { esami, esame, scegliMateria, creaMateria } = useDati();
  const naviga = useNavigate();
  const [nuova, setNuova] = useState(esami.length === 0);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<Esame["tipo"]>("orale");
  const [data, setData] = useState("");
  const [errore, setErrore] = useState("");
  const [salvo, setSalvo] = useState(false);

  function scegli(slug: string) {
    if (slug !== esame?.slug) scegliMateria(slug);
    naviga("/");
  }

  async function aggiungi() {
    if (!nome.trim()) return;
    setSalvo(true);
    setErrore("");
    try {
      await creaMateria(nome, tipo, data || undefined);
      naviga("/carica");
    } catch {
      setErrore("Non riesco a salvarla. Controlla la connessione e riprova.");
    } finally {
      setSalvo(false);
    }
  }

  return (
    <div className="pagina">
      {esame && (
        <Link to="/" className="indietro">
          {Icone.indietro} Oggi
        </Link>
      )}
      <h1>Le tue materie</h1>
      <Virgilio>
        <p>
          Ogni materia ha la sua cartella: i file che carichi finiscono in quella che stai studiando. Scegline una e la riapro sempre io, finché
          non la cambi.
        </p>
      </Virgilio>
      <div style={{ height: 14 }} />

      {esami.map((e) => (
        <button key={e.slug} className={`carta carta-cliccabile materia ${e.slug === esame?.slug ? "materia-attiva" : ""}`} onClick={() => scegli(e.slug)}>
          <div className="riga-spaziata">
            <h3 style={{ margin: 0 }}>{e.nome}</h3>
            {e.slug === esame?.slug && <span className="piccolo">✓ la stai studiando</span>}
          </div>
          <div className="tenue piccolo">
            {e.tipo === "orale" ? "Orale" : e.tipo === "scritto" ? "Scritto" : "Quiz"}
            {e.data_esame ? ` · ${new Date(e.data_esame).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}` : " · data da decidere"}
          </div>
        </button>
      ))}

      {!nuova ? (
        <button className="btn btn-bordo btn-largo" onClick={() => setNuova(true)}>
          ➕ Aggiungi una materia
        </button>
      ) : (
        <div className="carta">
          <div className="etichetta">Nuova materia</div>
          <label htmlFor="nome-materia">Nome</label>
          <input id="nome-materia" type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Patologia generale" />
          <label htmlFor="tipo-materia" style={{ marginTop: 10 }}>
            Com'è l'esame
          </label>
          <select id="tipo-materia" value={tipo} onChange={(e) => setTipo(e.target.value as Esame["tipo"])}>
            <option value="orale">Orale</option>
            <option value="scritto">Scritto</option>
            <option value="quiz">Quiz</option>
          </select>
          <label htmlFor="data-materia" style={{ marginTop: 10 }}>
            Data dell'esame (se la sai)
          </label>
          <input id="data-materia" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          {errore && <div className="avviso" style={{ marginTop: 10 }}>{errore}</div>}
          <button className="btn btn-largo" style={{ marginTop: 14 }} disabled={!nome.trim() || salvo} onClick={aggiungi}>
            {salvo ? "Salvo…" : "Crea e carica i materiali"}
          </button>
          {esami.length > 0 && (
            <button className="btn btn-tenue btn-largo" onClick={() => setNuova(false)}>
              Annulla
            </button>
          )}
        </div>
      )}
    </div>
  );
}
