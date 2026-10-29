# LAP Cerebro · Servidor

El servidor guarda los renders, el cronograma, el archivo y quién está trabajando en qué. Todas las apps de la oficina se conectan a él y se sincronizan al instante. Es gratis: usa [PocketBase](https://pocketbase.io) (licencia MIT), un solo programa sin instalación.

Necesita estar encendido mientras el equipo trabaja. Ponlo en el NAS o en un PC que no se apague (por ejemplo, el de un nodo de render).

## Opción A · En un PC con Windows

1. Descarga `LAP-Cerebro-Servidor-Windows.zip` desde la página de *Releases* del repositorio (o desde la ejecución más reciente de *Actions*) y descomprímelo en una carpeta fija, por ejemplo `C:\LAP-Cerebro-Servidor`.
2. Clic derecho en `abrir-firewall.bat` → **Ejecutar como administrador**. Esto deja entrar a los demás PC por el puerto 8090.
3. Doble clic en `iniciar-servidor.bat`. La primera vez se abre el navegador para crear la **cuenta de administrador** del servidor (solo para mantenimiento; el equipo usa sus propias cuentas desde la app).
4. Anota la dirección del PC: en una ventana de comandos escribe `ipconfig` y busca *Dirección IPv4* (por ejemplo `192.168.1.20`). En la app, el servidor es `192.168.1.20:8090`.
5. Para que arranque solo cada vez que se enciende el PC: clic derecho en `iniciar-con-windows.bat` → **Ejecutar como administrador**.

Conviene darle a ese PC una IP fija en el router, para que la dirección no cambie.

## Opción B · En un NAS con Docker

Copia esta carpeta `servidor` al NAS y, desde ahí:

```bash
docker compose up -d --build
```

La primera vez, crea la cuenta de administrador:

```bash
docker exec -it lap-cerebro /pb/pocketbase superuser upsert tu-correo@laparq.com UnaClaveSegura --dir=/pb/pb_data
```

La app se conecta a `IP-del-NAS:8090`.

## Copias de seguridad

Todos los datos están en la carpeta `pb_data`. Para respaldar, copia esa carpeta con el servidor detenido, o usa el panel de administración (`http://IP:8090/_/` → *Settings* → *Backups*), que puede programar copias automáticas.

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `pocketbase.exe` | El servidor (viene en el zip de Releases). |
| `pb_migrations/` | Crea las tablas de renders, entregas, actividad y equipo la primera vez que arranca. |
| `pb_hooks/limpieza.pb.js` | Borra cada madrugada la actividad con más de 30 días. |
| `iniciar-servidor.bat` | Arranca el servidor en una ventana. |
| `iniciar-con-windows.bat` | Lo registra para que arranque con Windows. |
| `abrir-firewall.bat` | Abre el puerto 8090 en el firewall de Windows. |
| `Dockerfile`, `docker-compose.yml` | Para correrlo en un NAS con Docker. |

## Seguridad

- Cualquiera que llegue al servidor puede crear una cuenta desde la app. Está pensado para la red de la oficina; **no abras el puerto 8090 a internet**. Para trabajar desde casa, usen la VPN de la oficina.
- Si quieres cerrar el registro, en el panel de administración entra a la colección `users` → *API Rules* y pon el candado en *Create rule*. Desde ese momento solo el administrador crea cuentas, desde el mismo panel.
