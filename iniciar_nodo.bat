@echo off
rem Abre REA Node: este PC renderiza trabajos de la granja de red de REA Scene Manager.
rem Primero instala el plugin con instalar.bat.
set "NODE=%APPDATA%\Autodesk\ApplicationPlugins\REASceneManager\Contents\node\REA_Node.ps1"
if not exist "%NODE%" (
	echo REA Scene Manager no esta instalado en este PC. Ejecuta antes instalar.bat.
	pause
	exit /b 1
)
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%NODE%"
echo REA Node abierto: busca el punto junto al reloj de Windows.
timeout /t 4 >nul
