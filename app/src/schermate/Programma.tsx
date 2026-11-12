import { useState } from "react";
import { Link } from "react-router-dom";
import { useDati } from "../stato";
import { Attesa, Foglio, Stelle } from "../componenti";
import { GRUPPI_IMPORTANZA, livello, NOMI_LIVELLO } from "../piano";

export default function Programma() {
  const { programma, schede, progressi, esame, sincronizzando, sincronizza, cambiaStelle } = useDati();
  const [scegli, setScegli] = useState<string | null>(null);
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
                <div key={a.id} className="carta" style={{ padding: "14px 16px", position: "relative" }}>
                  <div className="riga" style={{ alignItems: "flex-start" }}>
                    <span className={`puntino liv-${liv}`} style={{ marginTop: 6 }} title={NOMI_LIVELLO[liv]} />
                    <Link to={`/scheda/${a.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
                      <h3 style={{ margin: "0 0 2px" }}>{a.titolo}</h3>
                      <div className="tenue piccolo">
                        {pronta ? NOMI_LIVELLO[liv] : "Scheda in preparazione…"}
                        {a.importanza_virgilio ? " · stelle scelte da te" : ""}
                      </div>
                    </Link>
                    <button className="btn btn-tenue btn-piccolo" aria-label="Cambia le stelle" onClick={() => setScegli(a.id)}>
                      ⭐ Cambia
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      {scegli && (() => {
        const a = argomenti.find((x) => x.id === scegli);
        if (!a) return null;
        const scelte: { n: 1 | 2 | 3; testo: string }[] = [
          { n: 3, testo: "Tra i più chiesti" },
          { n: 2, testo: "Normale" },
          { n: 1, testo: "Meno chiesto" },
        ];
        return (
          <Foglio onChiudi={() => setScegli(null)}>
            <div className="etichetta">Quanto viene chiesto?</div>
            <h3 style={{ marginTop: 4 }}>{a.titolo}</h3>
            <p className="tenue piccolo">Le stelle decidono l'ordine in cui studi e in cui Virgilio prepara le schede. Decidi tu: sei tu che conosci il professore.</p>
            {scelte.map((s) => (
              <button
                key={s.n}
                className={`btn btn-largo ${a.importanza === s.n ? "" : "btn-bordo"}`}
                style={{ marginBottom: 8, justifyContent: "flex-start" }}
                onClick={() => {
                  cambiaStelle(a.id, a.importanza_virgilio ? (s.n === a.importanza_virgilio ? null : s.n) : s.n);
                  setScegli(null);
                }}
              >
                <Stelle n={s.n} /> {s.testo}
              </button>
            ))}
            {a.importanza_virgilio && (
              <button
                className="btn btn-tenue btn-largo"
                onClick={() => {
                  cambiaStelle(a.id, null);
                  setScegli(null);
                }}
              >
                Torna a quello deciso da Virgilio ({a.importanza_virgilio} {a.importanza_virgilio === 1 ? "stella" : "stelle"})
              </button>
            )}
          </Foglio>
        );
      })()}
    </div>
  );
}
