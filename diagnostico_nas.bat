@echo off
chcp 65001 >nul
rem Revisa si este PC ve el NAS de verdad o una copia local (Archivos sin conexion de Windows).
set "NAS=\\LAP-NAS\LAP Arquitectura NAS\Arch Viz Lap"
echo ==================================================
echo  Equipo: %COMPUTERNAME%
echo ==================================================
echo.
echo --- 1. Direccion IP del NAS (debe ser la misma en los dos PCs)
ping -n 1 -4 LAP-NAS | findstr /i "LAP-NAS"
echo.
echo --- 2. Archivos sin conexion de Windows (deben estar desactivados)
powershell -NoProfile -Command "try { $c = Get-CimInstance -ClassName Win32_OfflineFilesCache; 'Activado: ' + $c.Enabled + '    En uso: ' + $c.Active } catch { 'No se pudo leer' }"
echo.
echo --- 3. Unidades de red conectadas
net use
echo.
echo --- 4. Prueba: este PC escribe un archivo en el NAS
echo %COMPUTERNAME% %DATE% %TIME%> "%NAS%\prueba_%COMPUTERNAME%.txt" && echo Escrito: prueba_%COMPUTERNAME%.txt
echo.
echo --- 5. Archivos de prueba que ve este PC (deben salir los de los dos PCs)
dir /b "%NAS%\prueba_*.txt"
echo.
echo Haz una captura de esta ventana y mandala.
pause
