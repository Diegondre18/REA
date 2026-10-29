@echo off
rem Registra el servidor para que arranque solo cada vez que se enciende este PC.
rem Ejecutalo una vez con clic derecho > "Ejecutar como administrador".
cd /d "%~dp0"
schtasks /Create /F /TN "LAP Cerebro Servidor" /SC ONSTART /RU SYSTEM /RL HIGHEST ^
  /TR "\"%~dp0pocketbase.exe\" serve --http=0.0.0.0:8090 --dir=\"%~dp0pb_data\" --migrationsDir=\"%~dp0pb_migrations\" --hooksDir=\"%~dp0pb_hooks\""
if errorlevel 1 (
  echo No se pudo registrar. Ejecuta este archivo como administrador.
) else (
  echo Listo. El servidor arrancara solo al encender el PC.
  echo Para arrancarlo ahora sin reiniciar:  schtasks /Run /TN "LAP Cerebro Servidor"
)
pause
