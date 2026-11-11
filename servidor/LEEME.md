# LAP Cerebro · Servidor

El servidor guarda los proyectos, los planes de entregables con sus vistos buenos, las tareas, las reuniones y comités, los avisos y quién está trabajando en qué. Todas las apps de la oficina se conectan a él y se sincronizan al instante. Es gratis: usa [PocketBase](https://pocketbase.io) (licencia MIT), un solo programa sin instalación.

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

## Primera vez

- **Al crear la cuenta, cada persona elige su equipo:** Arquitectura, Diseño Interior, Visualización, Administración o Dirección creativa.
- **Dirección creativa tiene un solo cupo.** Quien la elija primero queda como director; si ya está ocupada, el registro lo avisa.
- **Solo se aceptan correos @laparq.com.** Para cambiarlo, edita `DOMINIO` al inicio de `pb_hooks/lib.js` y reinicia el servidor.
- De lunes a viernes a las 8:05 a. m. (hora de Bogotá) el servidor manda los recordatorios del día: comités que esperan tu avance, reuniones de hoy y tareas por vencer.

## Perfil maestro

Es una cuenta de soporte por si algo falla: puede cambiar roles (incluida la Dirección creativa), corregir cualquier proyecto y aprobar planes. No aparece en el equipo ni en las listas de personas.

Para crearlo, o para recuperarlo si se olvida la contraseña, en el PC del servidor haz doble clic en `crear-perfil-maestro.bat` y escribe correo, contraseña (mínimo 10 caracteres) y nombre. Después se entra con ese correo desde la app, como cualquier persona. Solo lo puede crear quien tiene acceso al PC o NAS del servidor.

En Docker: `docker exec -it lap-cerebro /pb/pocketbase maestro correo contraseña "Soporte LAP" --dir=/pb/pb_data --hooksDir=/pb/pb_hooks`

## Actualizar desde la versión 1

Detén el servidor, haz una copia de la carpeta `pb_data`, reemplaza `pb_migrations`, `pb_hooks` y los `.bat` por los nuevos y vuelve a arrancarlo. Las actualizaciones del servidor se hacen así, a mano; las de la app de cada PC son automáticas. Los renders de la versión 1 pasan solos a tareas de Visualización, agrupadas en un proyecto por cada nombre de proyecto que tenían.

## Copias de seguridad

Todos los datos están en la carpeta `pb_data`. Para respaldar, copia esa carpeta con el servidor detenido, o usa el panel de administración (`http://IP:8090/_/` → *Settings* → *Backups*), que puede programar copias automáticas.

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `pocketbase.exe` | El servidor (viene en el zip de Releases). |
| `pb_migrations/` | Crea las tablas la primera vez que arranca y actualiza las de la versión 1. |
| `pb_hooks/lib.js` | Reglas del estudio: dominio de correo, aprobación de planes, avisos y recordatorios. |
| `pb_hooks/rutas.pb.js` | Envío, retiro, aprobación y nueva versión del plan de entregables. Solo los puede usar quien lidera el proyecto o el director. |
| `pb_hooks/avisos.pb.js` | Avisos al asignar tareas, agendar reuniones, sumar a un proyecto o responder un plan. |
| `pb_hooks/maestro.pb.js` | El comando que crea o recupera el perfil maestro. |
| `crear-perfil-maestro.bat` | Crea o recupera el perfil maestro desde Windows. |
| `pb_hooks/limpieza.pb.js` | Recordatorios de cada mañana y limpieza de avisos y actividad con más de 30 días. |
| `iniciar-servidor.bat` | Arranca el servidor en una ventana. |
| `iniciar-con-windows.bat` | Lo registra para que arranque con Windows. |
| `abrir-firewall.bat` | Abre el puerto 8090 en el firewall de Windows. |
| `Dockerfile`, `docker-compose.yml` | Para correrlo en un NAS con Docker. |

## Seguridad

- Solo se pueden crear cuentas con correo @laparq.com. Aun así, está pensado para la red de la oficina; **no abras el puerto 8090 a internet**. Para trabajar desde casa, usen la VPN de la oficina.
- Si quieres cerrar el registro, en el panel de administración entra a la colección `users` → *API Rules* y pon el candado en *Create rule*. Desde ese momento solo el administrador crea cuentas, desde el mismo panel.
