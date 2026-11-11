@echo off
rem Actualiza un servidor de LAP Cerebro instalado aparte (no el que corre dentro de la app).
rem Uso: descomprime el zip nuevo en cualquier carpeta y haz doble clic en este archivo.
rem Los datos (pb_data) no se tocan: antes de copiar, se guarda una copia de seguridad.
setlocal
cd /d "%~dp0"
set "DESTINO=C:\LAP-Cerebro-Servidor"
echo.
echo  Actualizar el servidor de LAP Cerebro
echo.
set /p "DESTINO=Carpeta de tu servidor actual [%DESTINO%]: "
if not exist "%DESTINO%\pb_data" (
  echo No encuentro un servidor en "%DESTINO%" ^(falta la carpeta pb_data^).
  pause
  exit /b 1
)
echo.
echo 1. Deteniendo el servidor...
taskkill /IM pocketbase.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo 2. Guardando copia de seguridad de los datos...
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "FECHA=%%i"
robocopy "%DESTINO%\pb_data" "%DESTINO%\copias\pb_data_%FECHA%" /E /NFL /NDL /NJH /NJS >nul
echo    Copia en %DESTINO%\copias\pb_data_%FECHA%
echo 3. Copiando la version nueva...
robocopy "%~dp0pb_migrations" "%DESTINO%\pb_migrations" /MIR /NFL /NDL /NJH /NJS >nul
robocopy "%~dp0pb_hooks" "%DESTINO%\pb_hooks" /MIR /NFL /NDL /NJH /NJS >nul
copy /Y "%~dp0pocketbase.exe" "%DESTINO%\" >nul
for %%f in ("%~dp0*.bat") do if /I not "%%~nxf"=="actualizar-servidor.bat" copy /Y "%%f" "%DESTINO%\" >nul
copy /Y "%~dp0LEEME.md" "%DESTINO%\" >nul
echo 4. Arrancando el servidor...
start "LAP Cerebro - Servidor" /D "%DESTINO%" "%DESTINO%\iniciar-servidor.bat"
echo.
echo Listo. Si algo falla, cierra el servidor y reemplaza pb_data por la copia de seguridad.
pause
