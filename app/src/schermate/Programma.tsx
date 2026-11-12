import { Link } from "react-router-dom";
import { useDati } from "../stato";
import { Attesa, Stelle } from "../componenti";
import { GRUPPI_IMPORTANZA, livello, NOMI_LIVELLO } from "../piano";

export default function Programma() {
  const { programma, schede, progressi, esame, sincronizzando, sincronizza } = useDati();
  const argomenti = [...(programma?.argomenti ?? [])].sort((a, b) => a.ordine - b.ordine);

  return (
    <div className="pagina">
      <div className="riga-spaziata">
        <h1>Programma</h1>
        <button className="btn btn-tenue btn-piccolo" onClick={sincronizza} disabled={sincronizzando}>
          {sincronizzando ? <Attesa /> : "Aggiorna"}
        </button>
      </div>
      {esame && <p className="tenue">{esame.nome}</p>}

      {argomenti.length === 0 && (
        <div className="carta vuoto">
          <p>Il programma ancora non c'è.</p>
          <p className="tenue piccolo">Appena leggo i tuoi materiali divido tutto in argomenti: i più chiesti, i normali e i meno chiesti.</p>
          <Link to="/carica" className="btn">
            Carica materiali
          </Link>
        </div>
      )}

      {GRUPPI_IMPORTANZA.map((g) => {
        const lista = argomenti.filter((a) => a.importanza === g.importanza);
        if (!lista.length) return null;
        const sapute = lista.filter((a) => livello(progressi, a.id) === 3).length;
        return (
          <section key={g.importanza} style={{ marginTop: 22 }}>
            <div className="riga-spaziata">
              <h2 style={{ margin: 0 }}>
                <Stelle n={g.importanza} /> {g.titolo}
              </h2>
              <span className="tenue piccolo">
                {sapute}/{lista.length} sai
              </span>
            </div>
            <p className="tenue piccolo" style={{ margin: "4px 0 10px" }}>
              {g.descrizione}
            </p>
            {lista.map((a) => {
              const liv = livello(progressi, a.id);
              const pronta = !!schede[a.id];
              return (
                <Link key={a.id} to={`/scheda/${a.id}`} className="carta carta-cliccabile" style={{ padding: "14px 16px" }}>
                  <div className="riga" style={{ alignItems: "flex-start" }}>
                    <span className={`puntino liv-${liv}`} style={{ marginTop: 6 }} title={NOMI_LIVELLO[liv]} />
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: "0 0 2px" }}>{a.titolo}</h3>
                      <div className="tenue piccolo">{pronta ? NOMI_LIVELLO[liv] : "Scheda in preparazione…"}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
