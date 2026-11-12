// Ascolto e voce, gratis: li fa il telefono (Chrome su Android).

type Riconoscitore = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const CostruttoreSR = (): (new () => Riconoscitore) | undefined =>
  (window as unknown as Record<string, new () => Riconoscitore>).SpeechRecognition ??
  (window as unknown as Record<string, new () => Riconoscitore>).webkitSpeechRecognition;

export const ascoltoDisponibile = () => !!CostruttoreSR();

export interface Ascolto {
  ferma(): string;
}

/**
 * Ascolta finche' non chiami ferma(). Su Android il riconoscimento si interrompe
 * da solo dopo una pausa: lo riavvio e accumulo le frasi.
 */
export function ascolta(onTesto: (testo: string) => void, onErrore: (msg: string) => void): Ascolto {
  const SR = CostruttoreSR();
  if (!SR) {
    onErrore("Questo browser non sa ascoltare. Usa Chrome sul telefono.");
    return { ferma: () => "" };
  }
  let attivo = true;
  let definitivo = "";
  let parziale = "";
  let rec: Riconoscitore | null = null;

  const avvia = () => {
    rec = new SR();
    rec.lang = "it-IT";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      parziale = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) definitivo += (definitivo ? " " : "") + r[0].transcript.trim();
        else parziale += r[0].transcript;
      }
      onTesto((definitivo + " " + parziale).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        attivo = false;
        onErrore("Serve il permesso del microfono.");
      }
    };
    rec.onend = () => {
      if (parziale) {
        definitivo += (definitivo ? " " : "") + parziale.trim();
        parziale = "";
      }
      if (attivo) {
        try {
          avvia();
        } catch {
          /* riprovo al prossimo giro */
        }
      }
    };
    rec.start();
  };
  avvia();

  return {
    ferma() {
      attivo = false;
      rec?.stop();
      return (definitivo + " " + parziale).trim();
    },
  };
}

// ---------- lettura ad alta voce ----------

function voceItaliana() {
  const voci = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("it"));
  return voci.find((v) => /google/i.test(v.name)) ?? voci[0];
}

/** Divide in frasi brevi: su Android le frasi lunghe vengono tagliate. */
function aPezzi(testo: string) {
  return testo
    .replace(/[*#_`>]/g, "")
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Brano = string | { pausa: number };

/** Legge una sequenza di testi e pause. Restituisce una funzione per fermare. */
export function leggi(brani: Brano[], alla_fine?: () => void, ogniBrano?: (i: number) => void): () => void {
  let fermo = false;
  let timer: number | undefined;
  speechSynthesis.cancel();
  const coda: { brano: number; pezzo?: string; pausa?: number }[] = [];
  brani.forEach((b, i) => {
    if (typeof b === "string") aPezzi(b).forEach((pezzo) => coda.push({ brano: i, pezzo }));
    else coda.push({ brano: i, pausa: b.pausa });
  });
  let ultimoBrano = -1;
  const prossimo = () => {
    if (fermo) return;
    const v = coda.shift();
    if (!v) return alla_fine?.();
    if (v.brano !== ultimoBrano) {
      ultimoBrano = v.brano;
      ogniBrano?.(v.brano);
    }
    if (v.pausa != null) {
      timer = window.setTimeout(prossimo, v.pausa);
      return;
    }
    const u = new SpeechSynthesisUtterance(v.pezzo);
    u.lang = "it-IT";
    const voce = voceItaliana();
    if (voce) u.voice = voce;
    u.rate = 0.98;
    u.onend = prossimo;
    u.onerror = prossimo;
    speechSynthesis.speak(u);
  };
  // le voci a volte arrivano in ritardo
  if (speechSynthesis.getVoices().length === 0) window.setTimeout(prossimo, 300);
  else prossimo();
  return () => {
    fermo = true;
    window.clearTimeout(timer);
    speechSynthesis.cancel();
  };
}
