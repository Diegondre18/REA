@echo off
rem Muestra cuanto espacio total, usado y libre tiene el NAS.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0espacio_nas.ps1"
echo.
pause
