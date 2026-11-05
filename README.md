# REA Scene Manager

Plugin para **3ds Max 2021 + Corona** para gestionar las vistas de una escena, renderizarlas por lotes
(en este PC o en la red de la oficina) y presentar los resultados.
La interfaz es una página web dentro de 3ds Max (Microsoft Edge WebView2). Funciona sin internet y sin cuenta.

## Qué hace

- **Setups**: cada setup guarda una vista de la escena con tarjetas que se activan o desactivan
  (Cámara, Resolución, Sol por hora del día, Entorno, Luces, Capas, Objetos, Render elements,
  Corona, Tone mapping y Región). Al aplicar el setup solo cambia lo que tiene la tarjeta activada.
  Botón rápido de **Clay** (material override de Corona).
- **Cámaras**: crear CoronaCam (también 360° / VR), seleccionar, bloquear, renombrar y borrar.
- **Iluminación**: presets por carpeta (`.rps` + `.hdr` + `.png`) o archivos `.max` con luces.
- **Render**: lote de setups con nombres versionados (`{setup}_v{v}`), formato, render elements,
  LightMix conservado y guardado como imagen final.
- **Producción**: progreso del lote en este PC y, en la pestaña **Red**, la granja de render.
- **Resultados**: galería por setup, comparar antes/después y **hoja de contactos en PDF** con el diseño LAP.

Los setups se guardan **dentro del archivo .max**.

## Instalar

1. Descarga el zip del enlace que te pasen y descomprímelo (no lo ejecutes desde dentro del zip).
2. Cierra 3ds Max.
3. Ejecuta `instalar.bat`. Muestra la versión instalada.
4. Abre 3ds Max: menú *Customize > Customize User Interface*, categoría **REA**, arrastra
   **REA Scene Manager** a una barra de herramientas.

Para la tipografía de la hoja de contactos, instala Whyte en Windows o pon los `.ttf` en una carpeta
`fonts` junto a `instalar.bat` (no está en el repositorio por su licencia).

## Granja de render en red

No necesita servidor: todo vive en una carpeta compartida del NAS
(por defecto `\\LAP-NAS\LAP Arquitectura NAS\Arch Viz Lap\00_RenderFarm`).

1. En cada PC que vaya a renderizar: instala el plugin y abre `iniciar_nodo.bat`.
   Aparece **REA Node**, un punto junto al reloj de Windows:
   verde libre, naranja renderizando, azul en uso, gris en pausa.
   Con clic eliges cuándo renderiza (**Siempre**, **Cuando no se use el PC**, **Solo de noche**),
   lo pausas o lo inicias con Windows.
2. En 3ds Max: **Render > Enviar a la red**. Se guarda una copia de la escena en la granja,
   así puedes seguir trabajando. Cada setup es una imagen de la cola.
3. **Producción > Red** muestra los PCs (estado, CPU, RAM, versiones de 3ds Max, Corona y plugins)
   y la cola (prioridad, pausar, cancelar, reintentar, ver el log).
   Las imágenes terminadas aparecen en **Resultados**.

Los nodos renderizan con `3dsmaxbatch` en segundo plano y con prioridad baja, para no molestar a quien use el PC.
Usa una carpeta de salida del NAS y procura tener la **misma versión de Corona** en todos los PCs.

## Estructura

```
REASceneManager/                 bundle de ApplicationPlugins
  PackageContents.xml
  Contents/scripts/              MAXScript (núcleo, ventana, granja, render del nodo)
  Contents/ui/                   interfaz web (HTML, CSS, JS)
  Contents/node/REA_Node.ps1     nodo de la granja (PowerShell, junto al reloj)
  Contents/bin/                  WebView2 SDK
instalar.bat                     instala el plugin para el usuario actual
iniciar_nodo.bat                 abre REA Node en este PC
```

Para probar la interfaz sin 3ds Max, abre `REASceneManager/Contents/ui/index.html` en un navegador:
funciona en modo demostración con una escena y una granja simuladas.
