# LAP Cerebro · Servidor

El servidor guarda los proyectos, los planes de entregables con sus vistos buenos, las tareas, las reuniones y comités, los avisos y quién está trabajando en qué. Todas las apps de la oficina se conectan a él y se sincronizan al instante. Es gratis: usa [PocketBase](https://pocketbase.io) (licencia MIT).

## La forma fácil: la app es el servidor (recomendada)

No hace falta instalar nada aparte. El servidor viaja dentro de la app de Windows.

1. Instala LAP Cerebro en el PC del estudio que **siempre está prendido**.
2. Al abrirla por primera vez, la app busca el servidor en la red. Como todavía no hay, ofrece **«Usar este PC como servidor del estudio»**. Púlsalo y acepta el permiso de Windows (es para que los demás PC puedan entrar).
3. Listo. Desde ahí, cada vez que ese PC prende, la app abre sola y arranca el servidor por dentro, sin ventanas.
4. En los demás PC solo se instala la app: al abrirla, **encuentra el servidor sola** y se conecta. Nadie escribe direcciones.
5. Cuando la app se actualiza sola, el servidor también.

Mientras ese PC esté prendido y con la app abierta (aunque sea en la bandeja junto al reloj), el equipo trabaja conectado. Si se sale de la app desde la bandeja, el equipo se queda sin servidor hasta que se vuelva a abrir.

- **Perfil maestro:** en el PC servidor, en la pantalla de entrar, aparece **Crear perfil maestro**; o ya dentro, en **Tu perfil → Crear o recuperar perfil maestro**.
- **Datos y copias:** quedan en `%APPDATA%\LAP Cerebro\servidor\pb_data`. Cada madrugada se hace una copia automática y se guardan las últimas 14, en `pb_data\backups`.
- **Cambiar de PC servidor:** en el PC actual, **Tu perfil → Dejar de ser el servidor**; copia la carpeta `pb_data` al mismo lugar del PC nuevo y actívalo ahí.

## Servidor aparte (NAS o PC dedicado)

Si prefieren tenerlo fuera de la app, por ejemplo en el NAS, usen el zip `LAP-Cerebro-Servidor-Windows.zip` de *Releases* o la carpeta `servidor` con Docker. En ese caso las actualizaciones del servidor son a mano (ver más abajo).

### En un PC con Windows

1. Descarga `LAP-Cerebro-Servidor-Windows.zip` desde la página de *Releases* del repositorio (o desde la ejecución más reciente de *Actions*) y descomprímelo en una carpeta fija, por ejemplo `C:\LAP-Cerebro-Servidor`.
2. Clic derecho en `abrir-firewall.bat` → **Ejecutar como administrador**. Esto deja entrar a los demás PC por el puerto 8090.
3. Doble clic en `iniciar-servidor.bat`. La primera vez se abre el navegador para crear la **cuenta de administrador** del servidor (solo para mantenimiento; el equipo usa sus propias cuentas desde la app).
4. Anota la dirección del PC: en una ventana de comandos escribe `ipconfig` y busca *Dirección IPv4* (por ejemplo `192.168.1.20`). En la app, el servidor es `192.168.1.20:8090`.
5. Para que arranque solo cada vez que se enciende el PC: clic derecho en `iniciar-con-windows.bat` → **Ejecutar como administrador**.

Conviene darle a ese PC una IP fija en el router, para que la dirección no cambie.

### En un NAS con Docker

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

## Actualizar un servidor aparte

Descarga el zip nuevo de *Releases*, descomprímelo en cualquier carpeta y haz doble clic en **`actualizar-servidor.bat`**. Te pregunta dónde está tu servidor (por defecto `C:\LAP-Cerebro-Servidor`), lo detiene, guarda una copia de los datos en `copias\`, copia la versión nueva y lo vuelve a arrancar. Los datos no se tocan. Si vienes de la versión 1, los renders pasan solos a tareas de Visualización.

## Copias de seguridad

Todos los datos están en la carpeta `pb_data`. El servidor hace una copia automática cada madrugada y guarda las últimas 14 en `pb_data/backups`. Para una copia a mano, copia la carpeta `pb_data` con el servidor detenido.

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
| `actualizar-servidor.bat` | Actualiza un servidor aparte sin tocar los datos. |
| `pb_hooks/limpieza.pb.js` | Recordatorios de cada mañana y limpieza de avisos y actividad con más de 30 días. |
| `iniciar-servidor.bat` | Arranca el servidor en una ventana. |
| `iniciar-con-windows.bat` | Lo registra para que arranque con Windows. |
| `abrir-firewall.bat` | Abre el puerto 8090 en el firewall de Windows. |
| `Dockerfile`, `docker-compose.yml` | Para correrlo en un NAS con Docker. |

## Seguridad

- Solo se pueden crear cuentas con correo @laparq.com. Aun así, está pensado para la red de la oficina; **no abras el puerto 8090 a internet**. Para trabajar desde casa, usen la VPN de la oficina.
- Si quieres cerrar el registro, en el panel de administración entra a la colección `users` → *API Rules* y pon el candado en *Create rule*. Desde ese momento solo el administrador crea cuentas, desde el mismo panel.
