// La voce che hai scelto per gli audio (la velocità si regola qui, subito, senza rifare gli audio).
export const VOCI = [
  { id: "if_sara", nome: "Sara" },
  { id: "im_nicola", nome: "Nicola" },
] as const;

export interface ScelteVoce {
  voce: string;
  velocita: number; // 1 = come l'ha registrata il PC
}

const CHIAVE = "tutor:voce-audio";
const predefinita: ScelteVoce = { voce: "if_sara", velocita: 1 };

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
