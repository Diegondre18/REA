@echo off
rem Instala REA Scene Manager para el usuario actual (no requiere administrador).
rem Cierra 3ds Max antes de ejecutarlo.
set "SRC=%~dp0REASceneManager"
set "DEST=%APPDATA%\Autodesk\ApplicationPlugins\REASceneManager"

if not exist "%SRC%\PackageContents.xml" (
	echo.
	echo ERROR: no se encuentra la carpeta REASceneManager junto a este instalador.
	echo Descomprime el zip primero ^(clic derecho - Extraer todo^) y ejecuta
	echo instalar.bat desde la carpeta descomprimida.
	echo.
	pause
	exit /b 1
)

if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
xcopy /E /I /Y "%SRC%" "%DEST%" >nul
rem Quitar la marca "descargado de internet" para que .NET pueda cargar las DLL
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:DEST -Recurse | Unblock-File" >nul 2>&1

if not exist "%DEST%\Contents\scripts\REASM_startup.ms" (
	echo.
	echo ERROR: no se pudieron copiar los archivos a:
	echo %DEST%
	echo Cierra 3ds Max y vuelve a intentarlo.
	echo.
	pause
	exit /b 1
)

echo.
echo REA Scene Manager instalado en:
echo %DEST%
echo.
findstr /C:"REASM_VERSION =" "%DEST%\Contents\scripts\REASM_core.ms"
echo.
echo Abre 3ds Max.
pause
