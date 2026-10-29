@echo off
rem Arranca el servidor del Cerebro de Visualizacion de LAP en el puerto 8090.
rem Deja esta ventana abierta mientras el equipo trabaja (o usa iniciar-con-windows.bat).
cd /d "%~dp0"
title LAP Cerebro - Servidor
echo.
echo  LAP Cerebro - Servidor
echo  Los PC de la oficina se conectan a:  http://%COMPUTERNAME%:8090
echo  (o a la IP de este PC, por ejemplo 192.168.1.20:8090; la ves con el comando ipconfig)
echo.
pocketbase.exe serve --http=0.0.0.0:8090 --dir="%~dp0pb_data" --migrationsDir="%~dp0pb_migrations" --hooksDir="%~dp0pb_hooks"
pause
