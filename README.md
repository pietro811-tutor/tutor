# Tutor – Virgilio

App personale per preparare gli esami universitari, con un tutor (Virgilio) che segue lo studente passo passo.
Funziona a costo zero: l'intelligenza passa da Claude Code sul PC (abbonamento Claude Pro),
l'app sul telefono è una pagina web installabile e i dati stanno in un archivio GitHub privato.

```
 📱 app (GitHub Pages)  ⇄  🔒 archivio dati privato (GitHub)  ⇄  💻 motore sul PC (claude -p)
```

## Cartelle

| Cartella | Cosa contiene |
|---|---|
| `app/` | L'app per il telefono (React + Vite, installabile). In sviluppo legge `../dati` invece di GitHub. |
| `motore/` | Il motore di Virgilio: legge le richieste e i materiali, chiede a Claude Code, scrive schede e risposte. |
| `trascrizione/` | Trascrizione locale degli audio con Whisper (sulla scheda video). |
| `dati/` | *Non pubblicata*: copia locale dell'archivio privato `tutor-dati`. |
| `audio-lezioni/<esame>/` | *Non pubblicata*: audio lunghi lasciati sul PC, trascritti dal motore. |

## Come funziona il motore

Ogni pochi secondi controlla l'archivio dati e:

1. risponde alle **richieste** del telefono (`richieste/` → `risposte/`): valutazione di una ripetizione a voce, la penna;
2. con calma **legge i materiali nuovi** (foto, PDF, audio) e ne fa testo e indice (`testi/`);
3. aggiorna il **programma** (`programma.json`, con Opus) e scrive le **schede** degli argomenti (`schede/`, con Opus).

Se si raggiunge il limite dell'abbonamento, si ferma 20 minuti e riprende da solo.

Avvio a mano: `motore/avvia-motore.bat`. Prova senza GitHub: `node motore.js --locale --dati <cartella>`.
