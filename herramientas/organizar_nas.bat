@echo off
rem Ordena el NAS como el disco local de Synology Drive. Primero solo hace un informe; no cambia nada sin confirmar.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0organizar_nas.ps1"
echo.
pause
