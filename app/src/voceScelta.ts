// La voce che hai scelto per gli audio (la velocità si regola qui, subito, senza rifare gli audio).
export const VOCI = [
  { id: "if_sara", nome: "Sara" },
  { id: "im_nicola", nome: "Nicola" },
] as const;

export interface ScelteVoce {
  voce: string;
  velocita: number; // 1 = come l'ha registrata il PC
  volume: number; // 1 = normale; sopra 1 amplifica (fino a 2)
  timbro: number; // da -1 (caldo, profondo) a +1 (chiaro, brillante); 0 = come registrata
}

const CHIAVE = "tutor:voce-audio";
const predefinita: ScelteVoce = { voce: "if_sara", velocita: 1, volume: 1, timbro: 0 };

export function leggiScelteVoce(): ScelteVoce {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) ?? "null") as Partial<ScelteVoce> | null;
    return { ...predefinita, ...(v ?? {}) };
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

/** Fa partire un audio con velocita' e volume scelti. Ritorna la funzione per fermarlo. */
export async function avviaAudio(url: string, scelte: ScelteVoce, alTermine: () => void, massimoMs?: number): Promise<() => void> {
  const a = new Audio(url);
  a.playbackRate = scelte.velocita;
  a.volume = scelte.volume > 1 || scelte.timbro !== 0 ? 1 : scelte.volume;
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
  const ferma = () => {
    window.clearTimeout(timer);
    a.pause();
    void contesto?.close().catch(() => {});
    URL.revokeObjectURL(url);
  };
  a.onended = () => {
    ferma();
    alTermine();
  };
  a.onerror = () => {
    ferma();
    alTermine();
  };
  await a.play().catch(() => {
    ferma();
    alTermine();
  });
  if (massimoMs)
    timer = window.setTimeout(() => {
      ferma();
      alTermine();
    }, massimoMs);
  return ferma;
}
