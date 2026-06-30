@echo off
title QA Database
REM Launches the local server and opens QA Database in your default browser.
cd /d "%~dp0"
start "" http://localhost:8777/
powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8777
