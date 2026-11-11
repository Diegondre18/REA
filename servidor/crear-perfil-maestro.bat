@echo off
rem Crea (o recupera, si olvidaste la clave) el perfil maestro de LAP Cerebro.
rem El perfil maestro puede corregir cualquier cosa: roles, proyectos y planes. Usalo solo para soporte.
cd /d "%~dp0"
echo.
echo  Perfil maestro de LAP Cerebro
echo.
set /p CORREO=Correo del perfil maestro: 
set /p CLAVE=Contrasena (minimo 10 caracteres): 
set /p NOMBRE=Nombre que vera el equipo (por ejemplo Soporte LAP): 
pocketbase.exe maestro "%CORREO%" "%CLAVE%" "%NOMBRE%" --dir="%~dp0pb_data" --migrationsDir="%~dp0pb_migrations" --hooksDir="%~dp0pb_hooks"
echo.
echo Si el servidor estaba abierto no hace falta reiniciarlo.
pause
