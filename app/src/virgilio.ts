// Il carattere di Virgilio: caldo, un po' ironico, parla al "noi",
// esigente quando interroga, mai sensi di colpa.

import type { Umore } from "./tipi";

const scegli = <T,>(lista: T[], seme: string) => {
  let h = 0;
  for (const c of seme) h = (h * 31 + c.charCodeAt(0)) | 0;
  return lista[Math.abs(h) % lista.length];
};

export function saluto(nome: string, adesso = new Date()) {
  const ora = adesso.getHours();
  const chi = nome ? `, ${nome}` : "";
  if (ora < 5) return `Ancora sveglio${chi}? Facciamo una cosa breve, poi a dormire.`;
  if (ora < 12) return `Buongiorno${chi}!`;
  if (ora < 18) return `Buon pomeriggio${chi}!`;
  return `Buonasera${chi}!`;
}

export function fraseDelGiorno(giorno: string) {
  return scegli(
    [
      "Un passo alla volta: oggi ne facciamo uno buono.",
      "Non serve studiare tutto oggi. Serve studiare bene quello di oggi.",
      "Ripetere ad alta voce vale doppio. Te lo dico per esperienza.",
      "Le cose difficili diventano facili quando le spieghi a qualcuno. Spiegale a me.",
      "Pochi minuti fatti bene battono tre ore fatte male.",
      "Il professore vuole sentire che hai capito, non che hai memorizzato. Lavoriamo su questo.",
      "Una cosa alla volta, e la mettiamo al sicuro.",
    ],
    giorno,
  );
}

export function rispostaUmore(u: Umore) {
  return {
    stanco: "Ci sta. Oggi andiamo leggeri: una cosa sola, fatta con calma. Conta anche questa.",
    normale: "Bene. Facciamo il nostro, con ordine.",
    carico: "Ottimo! Approfittiamone: oggi ti propongo qualcosa in più.",
  }[u];
}

export function bentornato(giorniAssenza: number) {
  if (giorniAssenza >= 7) return "Bentornato! È passato un po', ma niente paura: ho già risistemato il piano.";
  if (giorniAssenza >= 2) return "Bentornato! Ripartiamo da dove eravamo, senza fretta.";
  return null;
}

export function commentoVoto(voto: number) {
  if (voto >= 28) return "Da applauso. Così all'esame fai bella figura.";
  if (voto >= 25) return "Bene! Ci sei quasi del tutto.";
  if (voto >= 21) return "Buona base. Sistemiamo i punti che mancano e ci siamo.";
  return "Non ancora, ed è normale: è proprio per questo che ripetiamo.";
}

export function fineRipasso(fatte: number) {
  if (fatte === 0) return "Per oggi niente ripasso: la memoria è a posto.";
  return scegli(
    [`Fatto! ${fatte} carte messe al sicuro.`, `${fatte} carte ripassate. La memoria ringrazia.`, `Bravo: ${fatte} carte. Piano piano si fissa tutto.`],
    String(fatte),
  );
}
