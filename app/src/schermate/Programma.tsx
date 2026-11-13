import { useState } from "react";
import { Link } from "react-router-dom";
import { nuovoId, useDati } from "../stato";
import { Attesa, Foglio, Stelle } from "../componenti";
import { GRUPPI_IMPORTANZA, livello, NOMI_LIVELLO } from "../piano";
import type { Argomento, GruppoArgomenti } from "../tipi";

type Vista = "stelle" | "gruppi";
const CHIAVE_VISTA = "tutor:vista-programma";

function vistaSalvata(): Vista {
  try {
    return localStorage.getItem(CHIAVE_VISTA) === "gruppi" ? "gruppi" : "stelle";
  } catch {
    return "stelle";
  }
}

export default function Programma() {
  const { programma, schede, progressi, esame, sincronizzando, sincronizza, cambiaStelle, aggiornaProgressi } = useDati();
  const [scegli, setScegli] = useState<string | null>(null);
  const [vista, setVistaStato] = useState<Vista>(vistaSalvata());
  const [gruppoAperto, setGruppoAperto] = useState<GruppoArgomenti | "nuovo" | null>(null);
  const argomenti = [...(programma?.argomenti ?? [])].sort((a, b) => a.ordine - b.ordine);
  const gruppi = (progressi.gruppi ?? []).filter((g) => g.esame === esame?.slug);

  function setVista(v: Vista) {
    setVistaStato(v);
    try {
      localStorage.setItem(CHIAVE_VISTA, v);
    } catch {
      /* pazienza */
    }
  }

  function salvaGruppo(g: GruppoArgomenti) {
    aggiornaProgressi((p) => {
      const lista = (p.gruppi ??= []);
      const i = lista.findIndex((x) => x.id === g.id);
      if (i >= 0) lista[i] = g;
      else lista.push(g);
    });
  }
  function eliminaGruppo(id: string) {
    aggiornaProgressi((p) => {
      p.gruppi = (p.gruppi ?? []).filter((x) => x.id !== id);
    });
  }

  function Carta({ a }: { a: Argomento }) {
    const liv = livello(progressi, a.id);
    const pronta = !!schede[a.id];
    return (
      <div className="carta" style={{ padding: "14px 16px", position: "relative" }}>
        <div className="riga" style={{ alignItems: "flex-start" }}>
          <span className={`puntino liv-${liv}`} style={{ marginTop: 6 }} title={NOMI_LIVELLO[liv]} />
          <Link to={`/scheda/${a.id}`} style={{ flex: 1, color: "inherit", textDecoration: "none" }}>
            <h3 style={{ margin: "0 0 2px" }}>{a.titolo}</h3>
            <div className="tenue piccolo">
              {vista === "gruppi" && <Stelle n={a.importanza} />} {pronta ? NOMI_LIVELLO[liv] : "Scheda in preparazione…"}
              {a.importanza_virgilio ? " · stelle scelte da te" : ""}
            </div>
          </Link>
          <button className="btn btn-tenue btn-piccolo" aria-label="Cambia le stelle" onClick={() => setScegli(a.id)}>
            ⭐ Cambia
          </button>
        </div>
      </div>
    );
  }

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

      {argomenti.length > 0 && (
        <div className="riga" style={{ gap: 8, margin: "6px 0 4px" }}>
          <button className={`btn btn-piccolo ${vista === "stelle" ? "" : "btn-tenue"}`} onClick={() => setVista("stelle")}>
            ⭐ Per stelle
          </button>
          <button className={`btn btn-piccolo ${vista === "gruppi" ? "" : "btn-tenue"}`} onClick={() => setVista("gruppi")}>
            📁 Per gruppi{gruppi.length ? ` (${gruppi.length})` : ""}
          </button>
        </div>
      )}

      {vista === "stelle" &&
        GRUPPI_IMPORTANZA.map((g) => {
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
              {lista.map((a) => (
                <Carta key={a.id} a={a} />
              ))}
            </section>
          );
        })}

      {vista === "gruppi" && argomenti.length > 0 && (
        <>
          <p className="tenue piccolo">
            Raggruppa gli argomenti come vuoi tu, per esempio per tema ("Cavo orale") o per giorno di studio. Un argomento può stare in più gruppi.
          </p>
          <button className="btn btn-largo" onClick={() => setGruppoAperto("nuovo")}>
            ＋ Nuovo gruppo
          </button>
          {gruppi.map((g) => {
            const lista = argomenti.filter((a) => g.argomenti.includes(a.id));
            const sapute = lista.filter((a) => livello(progressi, a.id) === 3).length;
            return (
              <section key={g.id} style={{ marginTop: 22 }}>
                <div className="riga-spaziata">
                  <h2 style={{ margin: 0 }}>📁 {g.nome}</h2>
                  <span className="tenue piccolo">
                    {sapute}/{lista.length} sai
                  </span>
                </div>
                <div className="riga" style={{ gap: 8, margin: "6px 0 10px" }}>
                  <button className="btn btn-tenue btn-piccolo" onClick={() => setGruppoAperto(g)}>
                    ✏️ Modifica
                  </button>
                  <Link to={`/interrogazione?gruppo=${g.id}`} className="btn btn-tenue btn-piccolo">
                    🎤 Interrogami
                  </Link>
                </div>
                {lista.length === 0 && <p className="tenue piccolo">Gruppo vuoto: tocca Modifica per aggiungere argomenti.</p>}
                {lista.map((a) => (
                  <Carta key={a.id} a={a} />
                ))}
              </section>
            );
          })}
          {(() => {
            const inUnGruppo = new Set(gruppi.flatMap((g) => g.argomenti));
            const liberi = argomenti.filter((a) => !inUnGruppo.has(a.id));
            if (!gruppi.length || !liberi.length) return null;
            return (
              <section style={{ marginTop: 22 }}>
                <h2 style={{ margin: 0 }}>Senza gruppo</h2>
                <p className="tenue piccolo" style={{ margin: "4px 0 10px" }}>
                  {liberi.length} argomenti non sono in nessun gruppo.
                </p>
                {liberi.map((a) => (
                  <Carta key={a.id} a={a} />
                ))}
              </section>
            );
          })()}
        </>
      )}

      {gruppoAperto && esame && (
        <ModificaGruppo
          gruppo={gruppoAperto === "nuovo" ? { id: nuovoId(), nome: "", esame: esame.slug, argomenti: [] } : gruppoAperto}
          nuovo={gruppoAperto === "nuovo"}
          argomenti={argomenti}
          onSalva={(g) => {
            salvaGruppo(g);
            setGruppoAperto(null);
          }}
          onElimina={(id) => {
            eliminaGruppo(id);
            setGruppoAperto(null);
          }}
          onChiudi={() => setGruppoAperto(null)}
        />
      )}

      {scegli &&
        (() => {
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
              <p className="tenue piccolo">
                Le stelle decidono l'ordine in cui studi e in cui Virgilio prepara le schede. Decidi tu: sei tu che conosci il professore.
              </p>
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

function ModificaGruppo({
  gruppo,
  nuovo,
  argomenti,
  onSalva,
  onElimina,
  onChiudi,
}: {
  gruppo: GruppoArgomenti;
  nuovo: boolean;
  argomenti: Argomento[];
  onSalva: (g: GruppoArgomenti) => void;
  onElimina: (id: string) => void;
  onChiudi: () => void;
}) {
  const [nome, setNome] = useState(gruppo.nome);
  const [scelti, setScelti] = useState<string[]>(gruppo.argomenti);
  const [cerca, setCerca] = useState("");
  const visibili = argomenti.filter((a) => a.titolo.toLowerCase().includes(cerca.trim().toLowerCase()));
  const attiva = (id: string) => setScelti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Foglio onChiudi={onChiudi}>
      <div className="etichetta">{nuovo ? "Nuovo gruppo" : "Modifica il gruppo"}</div>
      <label htmlFor="nome-gruppo">Come lo chiami?</label>
      <input id="nome-gruppo" type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Per esempio: Cavo orale" />
      <label htmlFor="cerca-arg">Argomenti del gruppo ({scelti.length} scelti)</label>
      <input id="cerca-arg" type="text" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un argomento…" />
      <div style={{ maxHeight: "40vh", overflowY: "auto", margin: "8px 0" }}>
        {visibili.map((a) => (
          <label key={a.id} className="riga" style={{ gap: 10, padding: "8px 0", alignItems: "flex-start" }}>
            <input type="checkbox" checked={scelti.includes(a.id)} onChange={() => attiva(a.id)} style={{ width: "auto", marginTop: 4 }} />
            <span>
              {a.titolo} <Stelle n={a.importanza} />
            </span>
          </label>
        ))}
        {!visibili.length && <p className="tenue piccolo">Nessun argomento trovato.</p>}
      </div>
      <button
        className="btn btn-largo"
        disabled={!nome.trim()}
        onClick={() => onSalva({ ...gruppo, nome: nome.trim(), argomenti: scelti })}
      >
        {nuovo ? "Crea il gruppo" : "Salva"}
      </button>
      {!nuovo && (
        <button
          className="btn btn-bordo btn-largo"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (confirm(`Elimino il gruppo "${gruppo.nome}"? Gli argomenti restano dove sono.`)) onElimina(gruppo.id);
          }}
        >
          Elimina il gruppo
        </button>
      )}
    </Foglio>
  );
}
