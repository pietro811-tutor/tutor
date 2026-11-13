// La voce che hai scelto per gli audio (la velocità si regola qui, subito, senza rifare gli audio).
export const VOCI = [{ id: "elsa", nome: "Elsa" }] as const;

export interface ScelteVoce {
  voce: string;
  velocita: number; // 1 = come l'ha registrata il PC
  volume: number; // 1 = normale; sopra 1 amplifica (fino a 2)
  timbro: number; // da -1 (caldo, profondo) a +1 (chiaro, brillante); 0 = come registrata
}

const CHIAVE = "tutor:voce-audio";
const predefinita: ScelteVoce = { voce: "elsa", velocita: 1, volume: 1, timbro: 0 };

export function leggiScelteVoce(): ScelteVoce {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) ?? "null") as Partial<ScelteVoce> | null;
    const scelte = { ...predefinita, ...(v ?? {}) };
    // una voce che non esiste piu' (Sara, Nicola) torna a quella di Virgilio
    if (!VOCI.some((x) => x.id === scelte.voce)) scelte.voce = predefinita.voce;
    return scelte;
  } catch {
    return predefinita;
  }
}

export function salvaScelteVoce(v: ScelteVoce) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(v));
  } catch {
    /* pazienza */
  }
}

export interface ControlloAudio {
  ferma(): void; // si ferma e ricorda dove eri
  pausa(): void;
  riprendi(): void;
}

const chiavePos = (k: string) => `tutor:pos:${k}`;
export function posizioneSalvata(k: string): number {
  try {
    return Number(localStorage.getItem(chiavePos(k)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
export function dimenticaPosizione(k: string) {
  try {
    localStorage.removeItem(chiavePos(k));
  } catch {
    /* pazienza */
  }
}
function salvaPosizione(k: string, t: number) {
  try {
    if (t > 3) localStorage.setItem(chiavePos(k), String(Math.floor(t)));
  } catch {
    /* pazienza */
  }
}

/**
 * Fa partire un audio con velocita', volume e timbro scelti.
 * Con una chiave ricorda dove sei arrivato: la volta dopo riparte da li'.
 */
export async function avviaAudio(
  url: string,
  scelte: ScelteVoce,
  alTermine: () => void,
  opzioni: { massimoMs?: number; chiave?: string; alTempo?: (secondi: number) => void } = {},
): Promise<ControlloAudio> {
  const { massimoMs, chiave, alTempo } = opzioni;
  const a = new Audio(url);
  a.playbackRate = scelte.velocita;
  a.volume = scelte.volume > 1 || scelte.timbro !== 0 ? 1 : scelte.volume;
  const partenza = chiave ? posizioneSalvata(chiave) : 0;
  if (partenza > 0)
    a.addEventListener(
      "loadedmetadata",
      () => {
        if (partenza < a.duration - 4) a.currentTime = partenza;
      },
      { once: true },
    );
  let contesto: AudioContext | null = null;
  if (scelte.volume > 1 || scelte.timbro !== 0) {
    try {
      // volume oltre il normale e timbro si ottengono con un amplificatore e due filtri (bassi / acuti)
      contesto = new AudioContext();
      const guadagno = contesto.createGain();
      guadagno.gain.value = scelte.volume;
      const bassi = contesto.createBiquadFilter();
      bassi.type = "lowshelf";
      bassi.frequency.value = 250;
      bassi.gain.value = -scelte.timbro * 9;
      const acuti = contesto.createBiquadFilter();
      acuti.type = "highshelf";
      acuti.frequency.value = 3000;
      acuti.gain.value = scelte.timbro * 9;
      contesto.createMediaElementSource(a).connect(bassi).connect(acuti).connect(guadagno).connect(contesto.destination);
      await contesto.resume();
    } catch {
      contesto = null;
    }
  }
  let timer: number | undefined;
  let chiuso = false;
  const chiudi = () => {
    if (chiuso) return;
    chiuso = true;
    window.clearTimeout(timer);
    if (chiave) salvaPosizione(chiave, a.currentTime);
    a.pause();
    void contesto?.close().catch(() => {});
    URL.revokeObjectURL(url);
  };
  // ogni 5 secondi ricordo a che punto sei, anche se chiudi l'app di colpo
  let ultimoSalvato = 0;
  a.addEventListener("timeupdate", () => {
    alTempo?.(a.currentTime);
    if (chiave && a.currentTime - ultimoSalvato > 5) {
      ultimoSalvato = a.currentTime;
      salvaPosizione(chiave, a.currentTime);
    }
  });
  const finito = () => {
    if (chiave) dimenticaPosizione(chiave);
    chiuso = true;
    window.clearTimeout(timer);
    void contesto?.close().catch(() => {});
    URL.revokeObjectURL(url);
    alTermine();
  };
  a.onended = finito;
  a.onerror = finito;
  await a.play().catch(finito);
  if (massimoMs)
    timer = window.setTimeout(() => {
      chiudi();
      alTermine();
    }, massimoMs);
  return {
    ferma: chiudi,
    pausa: () => {
      a.pause();
      if (chiave) salvaPosizione(chiave, a.currentTime);
    },
    riprendi: () => {
      void contesto?.resume().catch(() => {});
      void a.play().catch(() => {});
    },
  };
}
