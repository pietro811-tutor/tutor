@echo off
rem Collega Virgilio al tuo abbonamento Claude Pro. Si fa UNA volta sola.
rem Usa una cartella tutta per Tutor: non tocca il Claude che usi per le altre cose.
setlocal
cd /d "%~dp0"
set "CLAUDE_CONFIG_DIR=%~dp0accesso-claude"
title Virgilio - accesso a Claude

echo.
echo Si aprira' una pagina nel browser: accedi con il tuo account Claude (quello con il Pro)
echo e premi "Autorizza". Poi torna in questa finestra.
echo.
call claude auth login --claudeai

echo.
echo ---- Controllo che funzioni (qualche secondo) ----
call claude -p "Rispondi solo: funziona" --model sonnet
echo.
echo Se qui sopra leggi "funziona", e' tutto a posto: chiudi questa finestra
echo e fai doppio clic su "avvia-motore.bat".
echo Se leggi un errore, copialo o fotografalo e mandalo a Claude.
echo.
pause
