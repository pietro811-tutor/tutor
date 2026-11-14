import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { useDati, nuovoId } from "../stato";
import { Attesa, Virgilio } from "../componenti";
import type { MaterialeMeta } from "../tipi";

const LIMITE_MB = 40; // foto e documenti
const LIMITE_AUDIO_MB = 600; // gli audio lunghi vanno su a pezzi

/** Riduce le foto: bastano 2000 pixel per leggere bene, e si carica molto prima. */
async function comprimiFoto(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scala = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scala);
    canvas.height = Math.round(img.height * scala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok) => canvas.toBlob((b) => ok(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

const ETICHETTE = { attesa: "Da leggere", letto: "Letto ✓", errore: "Problema" };

export default function Carica() {
  const { caricaFile, materiali, esame } = useDati();
  const [stato, setStato] = useState<{ fatti: number; totale: number; parte?: number; parti?: number } | null>(null);
  const [errore, setErrore] = useState("");
  const [ok, setOk] = useState("");
  const scatta = useRef<HTMLInputElement>(null);
  const galleria = useRef<HTMLInputElement>(null);
  const documento = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLInputElement>(null);

  async function carica(files: FileList | null, tipo: MaterialeMeta["tipo"]) {
    if (!files?.length) return;
    setErrore("");
    setOk("");
    const lista = Array.from(files);
    const troppoGrandi = lista.filter((f) => f.size > (tipo === "audio" ? LIMITE_AUDIO_MB : LIMITE_MB) * 1e6);
    if (troppoGrandi.length) {
      setErrore(`${troppoGrandi.map((f) => f.name).join(", ")}: troppo grande (oltre ${tipo === "audio" ? LIMITE_AUDIO_MB : LIMITE_MB} MB). Mettilo sul PC, nella cartella "audio-lezioni".`);
      return;
    }
    const gruppo = nuovoId();
    setStato({ fatti: 0, totale: lista.length });
    try {
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i];
        const dati = tipo === "foto" ? await comprimiFoto(f) : f;
        const nome = tipo === "foto" ? f.name.replace(/\.\w+$/, "") + ".jpg" : f.name;
        await caricaFile(dati, nome, tipo, lista.length > 1 ? gruppo : undefined, (parte, parti) => setStato({ fatti: i, totale: lista.length, parte, parti }));
        setStato({ fatti: i + 1, totale: lista.length });
      }
      setOk(lista.length === 1 ? "Caricato! Lo leggo appena posso." : `Caricati ${lista.length} file! Li leggo appena posso.`);
    } catch {
      setErrore("Il caricamento si è interrotto. Controlla la connessione e riprova con quelli mancanti.");
    } finally {
      setStato(null);
    }
  }

  return (
    <div className="pagina">
      <h1>Carica</h1>
      <Virgilio>
        <p>Dammi tutto quello che hai: lo leggo, lo controllo e lo trasformo in schede. Le pagine dello stesso capitolo caricale insieme, in ordine.</p>
      </Virgilio>

      {!esame && (
        <div className="avviso" style={{ marginTop: 14 }}>
          Prima dimmi che materia studiamo: <Link to="/materie">aggiungila qui</Link>.
        </div>
      )}
      {esame && (
        <div className="carta riga-spaziata" style={{ marginTop: 14 }}>
          <div>
            <div className="etichetta">I file vanno nella cartella di</div>
            <strong>{esame.nome}</strong>
          </div>
          <Link to="/materie" className="piccolo">
            Cambia
          </Link>
        </div>
      )}

      <div className="colonna" style={{ margin: "18px 0" }}>
        <button className="btn btn-largo btn-terra" disabled={!esame || !!stato} onClick={() => scatta.current?.click()}>
          📷 Fotografa
        </button>
        <button className="btn btn-largo" disabled={!esame || !!stato} onClick={() => galleria.current?.click()}>
          🖼️ Foto dalla galleria
        </button>
        <button className="btn btn-largo btn-tenue" disabled={!esame || !!stato} onClick={() => documento.current?.click()}>
          📄 PDF o documento
        </button>
        <button className="btn btn-largo btn-tenue" disabled={!esame || !!stato} onClick={() => audio.current?.click()}>
          🎙️ Audio di una lezione
        </button>
      </div>
      <input ref={scatta} type="file" accept="image/*" capture="environment" hidden onChange={(e) => carica(e.target.files, "foto").finally(() => (e.target.value = ""))} />
      <input ref={galleria} type="file" accept="image/*" multiple hidden onChange={(e) => carica(e.target.files, "foto").finally(() => (e.target.value = ""))} />
      <input
        ref={documento}
        type="file"
        accept=".pdf,.txt,.md,.doc,.docx,application/pdf"
        multiple
        hidden
        onChange={(e) => carica(e.target.files, "documento").finally(() => (e.target.value = ""))}
      />
      <input ref={audio} type="file" accept="audio/*" multiple hidden onChange={(e) => carica(e.target.files, "audio").finally(() => (e.target.value = ""))} />

      {stato && (
        <div className="carta riga">
          <Attesa />
          <span>
            Carico {stato.fatti + 1} di {stato.totale}
            {stato.parti ? ` (pezzo ${stato.parte} di ${stato.parti}: non chiudere l'app)` : ""}…
          </span>
        </div>
      )}
      {errore && <div className="avviso">{errore}</div>}
      {ok && <div className="carta verifica-ok">{ok}</div>}

      {materiali.length > 0 && (
        <>
          <h2 style={{ marginTop: 22 }}>I tuoi materiali</h2>
          {materiali.map((m) => (
            <div key={m.id} className="carta" style={{ padding: "12px 14px" }}>
              <div className="riga-spaziata">
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.titolo || m.nome}</strong>
                <span className="tenue piccolo" style={{ flex: "none" }}>
                  {ETICHETTE[m.stato]}
                </span>
              </div>
              <div className="tenue piccolo">
                {{ foto: "Foto", audio: "Audio", documento: "Documento" }[m.tipo]}
                {m.caricato && " · " + new Date(m.caricato).toLocaleDateString("it-IT")}
              </div>
              {m.avvisi?.map((a, i) => (
                <div key={i} className="piccolo" style={{ color: "var(--terra)", marginTop: 4 }}>
                  ⚠️ {a}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
