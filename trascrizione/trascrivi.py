"""Trascrive gli audio delle lezioni per Tutor.

Per ogni audio crea due file accanto all'originale:
  <nome>_trascrizione.txt   testo leggibile, con il minuto di ogni frase
  <nome>_trascrizione.json  gli stessi dati per l'app (inizio e fine di ogni frase)

Uso:
  python trascrivi.py CARTELLA_O_FILE [...] --materia "anatomia patologica"
                      [--termini termini.txt] [--modo leggero|pesante] [--rifai]

Gli audio gia' trascritti vengono saltati, a meno di usare --rifai.
"""

import argparse
import json
import sys
import time
from pathlib import Path

ESTENSIONI_AUDIO = {".mp3", ".m4a", ".wav", ".aac", ".ogg", ".wma", ".flac", ".mp4"}

MODELLI = {
    "leggero": ("large-v3-turbo", dict(beam_size=5, temperature=(0.0, 0.4, 0.8))),
    "pesante": ("large-v3", dict(beam_size=5, best_of=5, temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0))),
}

# Whisper accetta un suggerimento di circa 220 token: oltre viene tagliato.
LUNGHEZZA_MAX_PROMPT = 600


def trova_audio(percorsi):
    trovati = []
    for p in map(Path, percorsi):
        if p.is_dir():
            trovati += sorted(f for f in p.iterdir() if f.suffix.lower() in ESTENSIONI_AUDIO)
        elif p.is_file():
            trovati.append(p)
        else:
            print(f"Non trovato: {p}")
    return trovati


def leggi_termini(percorso):
    """Una parola o espressione per riga (o separate da virgole). Le righe con # sono commenti."""
    if not percorso:
        return []
    termini = []
    for riga in Path(percorso).read_text(encoding="utf-8").splitlines():
        riga = riga.strip()
        if riga and not riga.startswith("#"):
            termini += [t.strip() for t in riga.split(",") if t.strip()]
    return termini


def crea_prompt(materia, termini):
    prompt = f"Lezione universitaria di {materia}."
    for termine in termini:
        aggiunta = (" Termini: " if prompt.endswith(".") else ", ") + termine
        if len(prompt) + len(aggiunta) + 1 > LUNGHEZZA_MAX_PROMPT:
            break
        prompt += aggiunta
    if not prompt.endswith("."):
        prompt += "."
    return prompt


def orario(secondi):
    secondi = int(secondi)
    return f"{secondi // 3600:02d}:{secondi % 3600 // 60:02d}:{secondi % 60:02d}"


def trascrivi(modello, audio, prompt, parametri):
    risultato = modello.transcribe(
        str(audio),
        language="italian",
        initial_prompt=prompt,
        # Ripete il suggerimento (materia e termini) per tutta la lezione,
        # non solo nei primi 30 secondi.
        carry_initial_prompt=True,
        condition_on_previous_text=False,
        compression_ratio_threshold=2.4,
        logprob_threshold=-1.0,
        no_speech_threshold=0.6,
        **parametri,
    )
    return [
        {"inizio": round(s["start"], 2), "fine": round(s["end"], 2), "testo": s["text"].strip()}
        for s in risultato["segments"]
        if s["text"].strip()
    ]


def salva(audio, segmenti, info):
    base = audio.with_name(audio.stem + "_trascrizione")

    righe = [f"# {audio.name}", f"# Materia: {info['materia']} | Modello: {info['modello']}", ""]
    righe += [f"[{orario(s['inizio'])}] {s['testo']}" for s in segmenti]
    base.with_suffix(".txt").write_text("\n".join(righe) + "\n", encoding="utf-8")

    dati = {"audio": audio.name, **info, "segmenti": segmenti}
    base.with_suffix(".json").write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    return base.with_suffix(".txt")


def main():
    parser = argparse.ArgumentParser(description="Trascrive gli audio delle lezioni per Tutor.")
    parser.add_argument("percorsi", nargs="+", help="file audio o cartelle che li contengono")
    parser.add_argument("--materia", required=True, help='es. "anatomia patologica"')
    parser.add_argument("--termini", help="file .txt con i termini tecnici del corso")
    parser.add_argument("--modo", choices=MODELLI, default="leggero")
    parser.add_argument("--rifai", action="store_true", help="ritrascrive anche gli audio gia' fatti")
    args = parser.parse_args()

    audio_da_fare = []
    for audio in trova_audio(args.percorsi):
        if audio.with_name(audio.stem + "_trascrizione.json").exists() and not args.rifai:
            print(f"Gia' trascritto, salto: {audio.name}")
        else:
            audio_da_fare.append(audio)
    if not audio_da_fare:
        print("Nessun audio da trascrivere.")
        return 0

    prompt = crea_prompt(args.materia, leggi_termini(args.termini))
    nome_modello, parametri = MODELLI[args.modo]

    import torch
    import whisper

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Carico {nome_modello} su {device}...")
    modello = whisper.load_model(nome_modello, device=device)

    errori = 0
    for n, audio in enumerate(audio_da_fare, 1):
        print(f"[{n}/{len(audio_da_fare)}] Trascrivo: {audio.name}")
        inizio = time.time()
        try:
            segmenti = trascrivi(modello, audio, prompt, parametri)
            info = {
                "materia": args.materia,
                "modello": nome_modello,
                "durata_secondi": segmenti[-1]["fine"] if segmenti else 0,
                "suggerimento": prompt,
            }
            uscita = salva(audio, segmenti, info)
            print(f"    Fatto in {time.time() - inizio:.0f} s -> {uscita.name}")
        except Exception as e:
            errori += 1
            print(f"    ERRORE: {e}")

    print(f"Finito: {len(audio_da_fare) - errori} ok, {errori} con errori.")
    return 1 if errori else 0


if __name__ == "__main__":
    sys.exit(main())
