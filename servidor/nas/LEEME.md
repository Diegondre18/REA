# LAP Cerebro en el NAS

El NAS hace de servidor del estudio, como un PC que nunca se apaga:

- **Arranca solo** cada vez que el NAS prende.
- **Los PC lo encuentran solos** en la red; nadie escribe direcciones.
- **Se actualiza solo**: cada 6 horas revisa si hay una versión nueva publicada y la instala.
- **Solo guarda texto** (proyectos, tareas, planes, reuniones). Ocupa muy poco: menos de 100 a 200 MB en varios años, incluidas las copias automáticas de cada madrugada.
- **No da acceso al NAS a nadie.** El Cerebro corre aislado en su propia carpeta; los demás PC solo hablan con él por el puerto 8090, con su cuenta del Cerebro. Las carpetas y permisos del NAS no cambian.

Necesitas: un NAS con Docker (Synology con *Container Manager* o QNAP con *Container Station*), acceso de administrador al NAS para instalarlo, y que el NAS tenga internet (para descargar el servidor y sus actualizaciones).

## 1. Preparar la carpeta

1. Descarga **`LAP-Cerebro-NAS.zip`** de la página de *Releases* del repositorio y descomprímelo en tu PC. Trae `docker-compose.yml`, `cerebro.js`, `host.js` y este archivo.
2. En el NAS, crea una carpeta compartida nueva llamada **`cerebro`**, con acceso solo para administradores. (Synology: *Panel de control → Carpeta compartida → Crear*. QNAP: *Panel de control → Carpetas compartidas → Crear*.)
3. Copia los archivos del zip dentro de esa carpeta.

## 2. Crear el contenedor

**Synology (Container Manager)**

1. Abre *Container Manager → Proyecto → Crear*.
2. Nombre: `lap-cerebro`. Ruta: la carpeta `cerebro`. Origen: *Usar docker-compose.yml existente*.
3. Siguiente, sin portal web, y *Hecho*. El proyecto descarga la imagen de Node.js y arranca.

**QNAP (Container Station)**

1. Abre *Container Station → Aplicaciones → Crear*.
2. Nombre: `lap-cerebro`. Pega el contenido de `docker-compose.yml`, cambiando la línea `- ./:/data` por la ruta completa de la carpeta, por ejemplo `- /share/cerebro:/data`.
3. *Crear*.

La primera vez tarda un minuto: descarga el servidor desde *Releases*. En los registros del contenedor (Synology: *Contenedor → lap-cerebro → Registro*) debe aparecer **«servidor listo en el puerto 8090»**.

## 3. Crear el perfil maestro

El perfil maestro es la cuenta de soporte por si algo falla. Elige una de estas dos formas:

- **Con el archivo:** en `docker-compose.yml`, quita el `#` de las líneas `MAESTRO_EMAIL` y `MAESTRO_PASSWORD`, pon el correo y una contraseña de al menos 10 caracteres, y reconstruye el proyecto (Synology: *Proyecto → Acción → Construir*). Cuando el registro diga «perfil maestro: Listo», vuelve a poner el `#` en esas dos líneas y reconstruye otra vez, para que la contraseña no quede escrita.
- **Con la terminal del contenedor** (Synology: *Contenedor → lap-cerebro → Acción → Abrir terminal → Crear → sh*): escribe `node /data/cerebro.js maestro soporte@laparq.com UnaClaveSegura "Soporte LAP"`.

Para recuperar la contraseña se hace lo mismo con una nueva.

## Si alguien olvida su contraseña

1. *Container Manager → Proyecto → lap-cerebro → Detener*.
2. En la configuración YAML del proyecto (o en `docker-compose.yml` de la carpeta), quita el `#` de las líneas `CLAVE_EMAIL` y `CLAVE_PASSWORD` y escribe el correo de la persona y su contraseña nueva (8 caracteres o más). Respeta los espacios del principio de la línea.
3. *Iniciar* (o *Construir*). En el registro debe salir «cambio de contraseña: Listo…». Su rol no cambia.
4. Vuelve a poner el `#` en esas dos líneas (o bórralas) y reinicia, para que la contraseña no quede escrita.

Al arrancar, el registro también muestra un **Resumen** (personas, proyectos y tareas): sirve para comprobar que el servidor tiene los datos del estudio.

## 4. Conectar los PC

Instala la app en cada PC. Al abrirla, encuentra sola el servidor del NAS y se conecta. Si algún PC no lo encuentra, por ejemplo si el NAS está en otra subred, usa **Escribir la dirección a mano** con la IP del NAS y el puerto, por ejemplo `192.168.1.50:8090`.

Si el NAS tiene firewall activado, permite los puertos **8090 (TCP)** y **8091 (UDP)** desde la red local.

## Datos y copias

Todo queda en la carpeta `cerebro` del NAS:

| Carpeta | Qué es |
|---|---|
| `pb_data` | Los datos del Cerebro. Las copias automáticas quedan en `pb_data/backups` (las últimas 14). |
| `app` | El servidor y sus reglas. Se reemplaza solo con cada actualización. |
| `servidor.log` | El registro del servidor, por si hay que revisar algo. |

Si ya tenían un servidor en un PC y quieren pasar sus datos al NAS: detén el contenedor, copia la carpeta `pb_data` del PC (en el PC servidor está en `%APPDATA%\LAP Cerebro\servidor\pb_data`) dentro de la carpeta `cerebro`, reemplazando la que haya, y vuelve a arrancarlo. En el PC, en **Tu perfil → Dejar de ser el servidor**.
