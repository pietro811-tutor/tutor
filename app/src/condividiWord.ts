// SOLO PER PIETRO (funzione temporanea, da togliere): trasforma una scheda in un file Word e lo condivide.
import type { Scheda } from "./tipi";

type Pezzo = import("docx").Paragraph;

export type ParteScheda = "schema" | "dettaglio";

export async function schedaInWord(scheda: Scheda, parte: ParteScheda): Promise<File> {
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
  if (parte === "schema") {
    for (const v of scheda.schema ?? []) corpo.push(titolo(v.voce, HeadingLevel.HEADING_2), ...markdown(v.testo));
  } else {
    corpo.push(...markdown(scheda.dettaglio));
  }
  if (parte === "dettaglio" && scheda.fonti?.length) corpo.push(titolo("Fonti", HeadingLevel.HEADING_2), righe(scheda.fonti.map((f) => [f.materiale, f.dove].filter(Boolean).join(", ")).join(" · ")));

  const doc = new Document({ sections: [{ children: corpo }] });
  const blob = await Packer.toBlob(doc);
  const nome = (scheda.titolo + (parte === "schema" ? " - schema" : " - testo completo")).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "scheda";
  return new File([blob], `${nome}.docx`, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/**
 * Apre il "Condividi" del telefono con il file gia' pronto (va chiamata subito dal tocco, senza attese prima:
 * il telefono vuole che la condivisione parta dal tocco). Se non si puo', scarica il file e dice false.
 */
export async function condividiFile(file: File, titolo: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title: titolo });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return true; // hai chiuso tu il menu
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return false;
}
