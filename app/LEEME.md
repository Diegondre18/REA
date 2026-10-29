# LAP Cerebro · App de Windows

App de escritorio del área de Visualización 3D: cronograma, renders en curso, archivo con la ruta de cada carpeta y quién está trabajando en qué, sincronizado en vivo con el servidor de la oficina (ver `../servidor/LEEME.md`).

## Instalar en cada PC

1. Descarga `LAP-Cerebro-Setup-x.y.z.exe` desde *Releases* (o desde la ejecución más reciente de *Actions* → artefacto `LAP-Cerebro-Setup`).
2. Ábrelo. Como el instalador no tiene firma digital paga, Windows puede mostrar **"Windows protegió su PC"**: haz clic en **Más información → Ejecutar de todas formas**.
3. Al abrir la app, escribe la dirección del servidor (por ejemplo `192.168.1.20:8090`) y crea tu cuenta con tu nombre. Ese nombre es el que ve el equipo.

## Qué hace la app además de la versión web

- **Abrir carpeta**: el botón de carpeta junto a cada ruta la abre en el Explorador. Por seguridad solo abre carpetas; si la ruta es un archivo, lo muestra seleccionado y nunca lo ejecuta.
- **Elegir…**: al editar un render, elige la carpeta con el explorador de Windows en vez de escribir la ruta.
- Avisa si la carpeta de un render guardado no existe desde ese PC (unidad de red desconectada o ruta mal escrita).
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
| `main.js` | Ventana, barra de título de Windows y acceso a carpetas. |
| `preload.js` | Puente mínimo entre la interfaz y Windows (abrir carpeta, elegir carpeta). |
| `src/index.html`, `src/styles.css`, `src/app.js` | La interfaz y la sincronización con el servidor. |
| `src/vendor/` | SDK de PocketBase y tipografías (Hanken Grotesk y Geist Mono, licencia OFL). |
| `build/icon.ico` | Ícono de la app, con el símbolo de LAP. |

La tipografía corporativa Whyte es de pago; la app usa Hanken Grotesk como sustituta con los mismos pesos (Light, Book, Medium). Con una licencia de escritorio de Whyte se puede cambiar en `src/styles.css`.
