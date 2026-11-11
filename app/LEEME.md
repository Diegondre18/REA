# LAP Cerebro · App de Windows

App de escritorio del estudio. Reúne los proyectos de Arquitectura, Diseño Interior, Visualización y Administración: plan de entregables con vistos buenos, cronograma personal, reuniones con cliente, comités internos y quién está trabajando en qué. Todo se sincroniza en vivo con el servidor de la oficina (ver `../servidor/LEEME.md`).

## Cómo funciona el plan de entregables

1. Quien lidera el proyecto arma el plan: fecha, qué se entrega, área, quién está al mando y para qué reunión es.
2. Lo envía a visto bueno. Cada integrante lo revisa y da su visto bueno o pide cambios.
3. Con todos los vistos buenos, quien lidera lo aprueba (el director puede aprobar sin esperar).
4. Solo entonces cada entregable pasa al cronograma personal de sus responsables, y a cada uno le llega un aviso.
5. Para cambiar un plan aprobado se crea una versión nueva, que vuelve a pedir visto bueno. Al aprobarla se actualizan las tareas sin perder su avance.

## Instalar en cada PC

1. Descarga `LAP-Cerebro-Setup-x.y.z.exe` desde *Releases* (o desde la ejecución más reciente de *Actions* → artefacto `LAP-Cerebro-Setup`).
2. Ábrelo. Como el instalador no tiene firma digital paga, Windows puede mostrar **"Windows protegió su PC"**: haz clic en **Más información → Ejecutar de todas formas**.
3. Al abrir la app, escribe la dirección del servidor (por ejemplo `192.168.1.20:8090`) y crea tu cuenta con tu correo @laparq.com, eligiendo tu equipo.
4. Desde ese momento la app se abre sola al prender el PC y te deja conectado con el equipo. Cerrar la ventana la deja en la bandeja junto al reloj, para que sigas apareciendo conectado; para salir del todo, clic derecho en el ícono → Salir. El arranque automático se puede apagar en Tu perfil.

## Actualizaciones automáticas

Cada PC busca versiones nuevas en *Releases* de GitHub al abrir la app y cada 4 horas. La descarga ocurre en segundo plano y la app muestra el aviso **«LAP Cerebro x.y.z está lista»** con el botón **Reiniciar y actualizar**. Si nadie lo pulsa, se instala sola la próxima vez que se cierre la app.

Para publicar una versión nueva: sube el número de `version` en `package.json` y crea un tag con ese número (por ejemplo `v2.1.1`). GitHub Actions arma el instalador y lo publica; desde ahí cada PC se actualiza sola. Solo se actualizan solos los PC que ya tienen la 2.1.0 o posterior; la 2.0 se instala a mano una última vez.

## Integración con Windows y Google

- **Abrir carpeta**: el botón de carpeta junto a cada ruta la abre en el Explorador. Por seguridad solo abre carpetas; si la ruta es un archivo, lo muestra seleccionado y nunca lo ejecuta.
- **Elegir…**: al editar un render, elige la carpeta con el explorador de Windows en vez de escribir la ruta.
- Avisa si la carpeta de un render guardado no existe desde ese PC (unidad de red desconectada o ruta mal escrita).
- La sesión se guarda cifrada con la protección de datos de Windows, atada a tu cuenta de Windows.
- Los avisos (tareas asignadas, planes por revisar, reuniones, recordatorios) llegan como notificaciones de Windows; al hacer clic abren lo que corresponde.
- En cada reunión, **Agendar en Google Calendar** abre tu calendario con todo ya llenado: título, fecha, invitados y el contenido que se revisará. Al guardarla, Google le agrega el enlace de Meet; pégalo en la reunión para que todo el equipo lo tenga a mano.
- Funciona sin internet: tipografías y librerías van dentro de la app. Solo necesita llegar al servidor de la oficina.

## Desarrollo

```bash
npm install
```

```bash
npm run vendor
```

```bash
npm start
```

El instalador se arma en GitHub Actions (`.github/workflows/windows.yml`) en una máquina Windows. Para publicar una versión, sube un tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

| Archivo | Para qué sirve |
|---|---|
| `main.js` | Ventana, bandeja, arranque con Windows, sesión cifrada, avisos y carpetas. |
| `preload.js` | Puente mínimo entre la interfaz y Windows. |
| `src/js/core.js` | Áreas, estados, fases, fechas y utilidades. |
| `src/js/store.js` | Conexión, sincronización en vivo, consultas y acciones. |
| `src/js/ui.js`, `src/js/sheets.js` | Piezas comunes: tablero, cronograma, archivo y formularios. |
| `src/js/views-*.js`, `src/js/app.js` | Las pantallas y el marco de la app. |
| `src/vendor/` | PocketBase, Preact y htm, y las tipografías Hanken Grotesk y Geist Mono (licencia OFL). |
| `build/icon.ico` | Ícono de la app, con el símbolo de LAP. |

La tipografía corporativa Whyte es de pago; la app usa Hanken Grotesk como sustituta con los mismos pesos (Light, Book, Medium). Con una licencia de escritorio de Whyte se puede cambiar en `src/styles.css`.
