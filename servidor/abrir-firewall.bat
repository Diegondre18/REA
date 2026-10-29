@echo off
rem Permite que los demas PC de la red lleguen al servidor (puerto 8090).
rem Ejecutalo una vez con clic derecho > "Ejecutar como administrador".
netsh advfirewall firewall add rule name="LAP Cerebro 8090" dir=in action=allow protocol=TCP localport=8090 profile=private,domain
pause
