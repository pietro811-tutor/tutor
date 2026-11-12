@echo off
rem Avvia il motore di Virgilio in una finestra (utile per vedere cosa fa).
rem Di solito parte da solo, nascosto, quando accendi il PC.
cd /d "%~dp0"
title Virgilio - motore
node motore.js
pause
