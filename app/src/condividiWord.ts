// SOLO PER PIETRO (funzione temporanea, da togliere): trasforma una scheda in un file Word e lo condivide.
import type { Scheda } from "./tipi";

type Pezzo = import("docx").Paragraph;

export async function schedaInWord(scheda: Scheda): Promise<File> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  // **grassetto** dentro una riga
  const righe = (t: string, extra: { bullet?: boolean } = {}): Pezzo => {
    const pezzi = t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return new Paragraph({
      spacing: { after: 100 },
      ...(extra.bullet ? { bullet: { level: 0 } } : {}),
      children: pezzi.map((p) => (p.startsWith("**") && p.endsWith("**") ? new TextRun({ text: p.slice(2, -2), bold: true }) : new TextRun(p))),
    });
  };
  const titolo = (t: string, livello: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ heading: livello, spacing: { before: 240, after: 100 }, children: [new TextRun(t)] });
  const markdown = (t: string): Pezzo[] =>
    t
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        if (/^[-*•]\s+/.test(r)) return righe(r.replace(/^[-*•]\s+/, ""), { bullet: true });
        if (/^#{1,4}\s/.test(r)) return titolo(r.replace(/^#+\s/, ""), HeadingLevel.HEADING_3);
        return righe(r);
      });

  const corpo: Pezzo[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(scheda.titolo)] })];
  corpo.push(titolo("In parole semplici", HeadingLevel.HEADING_1), ...markdown(scheda.semplice));
  if (scheda.analogia) corpo.push(titolo("Immagina così", HeadingLevel.HEADING_2), ...markdown(scheda.analogia));
  if (scheda.schema?.length) {
    corpo.push(titolo("Schema", HeadingLevel.HEADING_1));
    for (const v of scheda.schema) corpo.push(titolo(v.voce, HeadingLevel.HEADING_3), ...markdown(v.testo));
  }
  corpo.push(titolo("Dettaglio", HeadingLevel.HEADING_1), ...markdown(scheda.dettaglio));
  if (scheda.parole_chiave?.length) {
    corpo.push(titolo("Parole chiave", HeadingLevel.HEADING_1));
    for (const p of scheda.parole_chiave) {
      corpo.push(titolo(p.termine, HeadingLevel.HEADING_3), ...markdown(p.spiegazione));
      if (p.all_esame) corpo.push(righe("**All'esame:** " + p.all_esame));
    }
  }
  if (scheda.domande?.length) {
    corpo.push(titolo("Domande", HeadingLevel.HEADING_1));
    for (const d of scheda.domande) corpo.push(righe("**" + d.domanda + "**"), ...markdown(d.risposta));
  }
  if (scheda.fonti?.length) corpo.push(titolo("Fonti", HeadingLevel.HEADING_2), righe(scheda.fonti.map((f) => [f.materiale, f.dove].filter(Boolean).join(", ")).join(" · ")));

  const doc = new Document({ sections: [{ children: corpo }] });
  const blob = await Packer.toBlob(doc);
  const nome = scheda.titolo.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "scheda";
  return new File([blob], `${nome}.docx`, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** Apre il "Condividi" del telefono; se non c'è, scarica il file. */
export async function condividiScheda(scheda: Scheda) {
  const file = await schedaInWord(scheda);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: scheda.titolo });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
