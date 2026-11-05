@echo off
chcp 65001 >nul
setlocal
rem Copia lo que quedo en la carpeta local de Synology Drive al NAS compartido.
rem No borra nada. No reemplaza archivos del NAS que sean mas nuevos. Se puede repetir sin problema.

set "SRC=D:\Synology\SynologyDrive\Arch Viz Lap"
set "DST=\\LAP-NAS\LAP Arquitectura NAS\Arch Viz Lap"
set "LOG=%USERPROFILE%\Desktop\copia_al_nas_%COMPUTERNAME%.txt"

echo ==================================================
echo  Copiar de Synology Drive (disco local) al NAS
echo ==================================================
echo  Desde: %SRC%
echo  Hacia: %DST%
echo.
if not exist "%SRC%" ( echo No existe la carpeta de origen. & pause & exit /b 1 )
if not exist "%DST%" ( echo No se encuentra la carpeta del NAS. & pause & exit /b 1 )

set "OPTS=/E /XO /COPY:DAT /DCOPY:T /R:2 /W:3 /MT:8 /NP /XD "#SynoRecycle" "@eaDir" ".SynologyWorkingDirectory" "#recycle" /XF "~$*" "*.tmp" "Thumbs.db" "desktop.ini" "*.SynologyWorkingDirectory""

echo Paso 1: revisando que falta en el NAS (no copia nada todavia)...
robocopy "%SRC%" "%DST%" %OPTS% /L /NFL /NDL /NJH > "%LOG%"
type "%LOG%" | findstr /r /c:"Dirs" /c:"Archivos" /c:"Files" /c:"Bytes"
echo.
echo Arriba, en la columna "Copiado" / "Copied", sale cuanto falta por copiar.
echo.
choice /c SN /m "Copiar ahora al NAS"
if errorlevel 2 ( echo Cancelado. & pause & exit /b 0 )

echo.
echo Paso 2: copiando. Puede tardar mucho si son muchos GB. No cierres esta ventana.
robocopy "%SRC%" "%DST%" %OPTS% /TEE /LOG:"%LOG%"
echo.
if %errorlevel% GEQ 8 (
  echo Hubo errores al copiar algunos archivos. Revisa el registro en el Escritorio:
  echo %LOG%
) else (
  echo Copia terminada. Registro en el Escritorio: %LOG%
)
echo Si se corto o hubo errores, vuelve a ejecutar este archivo: solo copia lo que falte.
pause
