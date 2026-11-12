@echo off
setlocal
rem Trascrive a mano gli audio in audio-lezioni\anatomia-patologica.
rem Di solito non serve: il motore di Virgilio li trascrive da solo.

rem Usa il Whisper gia' installato in Sbobbinare (lo usa soltanto, non lo modifica)
set "PYTHON=%USERPROFILE%\Desktop\Sbobbinare\whisper_env\Scripts\python.exe"

set "AUDIO=%~dp0..\audio-lezioni\anatomia-patologica"
set "TERMINI=%~dp0..\dati\esami\anatomia-patologica\termini.txt"
set "MATERIA=anatomia patologica"

echo.
echo Trascrivo gli audio in: audio-lezioni\anatomia-patologica
echo.
echo Scegli la modalita di trascrizione:
echo 1 = Pesante (large-v3, massima precisione, piu lenta)
echo 2 = Leggera (large-v3-turbo, veloce, qualita quasi identica)
set /p scelta="Inserisci 1 o 2: "

if "%scelta%"=="1" (set "MODO=pesante") else (set "MODO=leggero")

"%PYTHON%" "%~dp0trascrivi.py" "%AUDIO%" --materia "%MATERIA%" --termini "%TERMINI%" --modo %MODO%

echo.
pause
