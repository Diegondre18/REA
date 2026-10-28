@echo off
rem Instala REA Scene Manager para el usuario actual (no requiere administrador).
set "DEST=%APPDATA%\Autodesk\ApplicationPlugins\REASceneManager"
if not exist "%DEST%" mkdir "%DEST%"
xcopy /E /I /Y "%~dp0REASceneManager" "%DEST%" >nul
echo.
echo REA Scene Manager instalado en:
echo %DEST%
echo.
echo Reinicia 3ds Max.
pause
