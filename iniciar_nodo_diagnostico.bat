@echo off
rem Abre REA Node con una ventana visible para ver errores (solo para diagnostico).
set "NODE=%APPDATA%\Autodesk\ApplicationPlugins\REASceneManager\Contents\node\REA_Node.ps1"
if not exist "%NODE%" (
	echo REA Scene Manager no esta instalado en este PC. Ejecuta antes instalar.bat.
	pause
	exit /b 1
)
echo Abriendo REA Node en modo diagnostico. Si hay un error aparecera aqui en rojo.
echo Deja esta ventana abierta mientras pruebas.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%NODE%"
