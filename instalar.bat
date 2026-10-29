@echo off
rem Instala REA Scene Manager para el usuario actual (no requiere administrador).
rem Cierra 3ds Max antes de ejecutarlo.
set "DEST=%APPDATA%\Autodesk\ApplicationPlugins\REASceneManager"
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
xcopy /E /I /Y "%~dp0REASceneManager" "%DEST%" >nul
rem Quitar la marca "descargado de internet" para que .NET pueda cargar las DLL
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:DEST -Recurse | Unblock-File" >nul 2>&1
echo.
echo REA Scene Manager instalado en:
echo %DEST%
echo.
findstr /C:"REASM_VERSION =" "%DEST%\Contents\scripts\REASM_core.ms"
echo.
echo Abre 3ds Max.
pause
