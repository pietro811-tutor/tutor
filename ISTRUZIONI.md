# Come iniziare con Virgilio

Ti servono 5 minuti, una volta sola.

## 1. Crea la chiave per il telefono (sul PC o sul telefono)

La chiave permette all'app di leggere e scrivere **solo** il tuo archivio privato `tutor-dati`, nient'altro.

1. Apri **https://github.com/settings/personal-access-tokens/new** (entra con il tuo account GitHub `pietro811-tutor`).
2. **Token name**: `Tutor telefono`
3. **Expiration**: scegli **No expiration** (oppure 1 anno).
4. **Repository access**: scegli **Only select repositories** e seleziona **tutor-dati**.
5. **Permissions** → **Repository permissions** → **Contents**: metti **Read and write**.
6. In fondo premi **Generate token** e **copia** la chiave (inizia con `github_pat_`).
   GitHub te la mostra una volta sola: se la perdi, ne crei un'altra.

## 2. Installa l'app sul telefono

1. Sul telefono apri **Chrome** e vai su **https://pietro811-tutor.github.io/tutor/**
2. Incolla la chiave e premi **Entra**.
3. Menu **⋮** in alto a destra → **Installa app** (o **Aggiungi a schermata Home**).
   Ora Virgilio ha la sua icona, come le altre app.
4. In **Impostazioni** (in alto a destra nella schermata Oggi) scrivi il tuo nome e la **data dell'orale**.

## 3. Il PC

Il motore di Virgilio parte da solo quando accendi il PC: lavora con il tuo Claude Pro.
- Se il PC è spento, l'app funziona lo stesso con quello che è già pronto; le cose nuove (foto da leggere,
  valutazioni, penna) restano in coda e partono appena lo accendi.
- Gli **audio lunghi delle lezioni** mettili nella cartella `Tutor\audio-lezioni\anatomia-patologica` del PC:
  Virgilio li trascrive da solo.
- Se vuoi vedere cosa sta facendo: doppio clic su `Tutor\motore\avvia-motore.bat` (o leggi `Tutor\motore\log.txt`).

## Come si usa

- **Oggi**: Virgilio ti dice cosa fare adesso. Una cosa alla volta.
- **Programma**: tutti gli argomenti. Pallino grigio = da iniziare, rosso = iniziato, giallo = quasi, verde = lo sai.
- Ogni argomento ha **5 tappe**: Semplice → Schema → Dettaglio → **Ripeti tu** (a voce, ti valuta) → Domande.
- **La penna**: nel Dettaglio tocca le parole evidenziate, oppure seleziona un pezzo di testo e premi **Approfondisci**.
- **Ripasso**: flashcard che tornano quando stai per dimenticarle. Con **Ascolta** te le legge lui (domanda, pausa, risposta).
- **Carica**: fotografa pagine, carica PDF o audio. Le pagine dello stesso capitolo caricale insieme.
