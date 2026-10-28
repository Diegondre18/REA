# REA Scene Manager

Plugin para **3ds Max 2021 + Corona** para gestionar vistas de una escena y renderizarlas por lotes.
La interfaz es una pagina web oscura, con tarjetas, que se muestra dentro de 3ds Max (Microsoft Edge WebView2).
Funciona sin internet y sin cuenta.

- **Setups**: cada setup guarda una vista de la escena. Tiene tarjetas que se activan o desactivan;
  al aplicar el setup solo cambia lo que tiene la tarjeta activada:
  Camara, Resolucion, Sol, Entorno (CoronaSky / HDRI), Capas, Objetos (ocultar / mostrar),
  Render elements y limites de Corona (pases, ruido, tiempo).
- **Render por lotes**: renderiza los setups marcados, cada uno en su carpeta con sus render elements.
- **Camaras**: ver, seleccionar, crear desde la vista, bloquear, renombrar y borrar.
- **Render elements y salida**: activar, anadir, borrar, y poner la ruta de salida de todo a la vez.

Los setups se guardan **dentro del archivo .max**.

## Instalar

1. Descarga este repo (**Code > Download ZIP**) y descomprimelo.
2. Si tenias instalada la version 0.1, borra la carpeta
   `%APPDATA%\Autodesk\ApplicationPlugins\REASceneManager`.
3. Doble clic en **`instalar.bat`**.
4. Reinicia 3ds Max.
5. **Customize > Customize User Interface > Toolbars**, categoria **REA**, y arrastra
   **REA Scene Manager** a una barra de herramientas.

Requiere **Microsoft Edge WebView2 Runtime**, que ya viene con Windows 10 y 11. Si faltara, el plugin
avisa y da el enlace de descarga.

### Probar sin instalar

En 3ds Max: **Scripting > Run Script...** y elige
`REASceneManager\Contents\scripts\REASM_probar_sin_instalar.ms`.

## Uso rapido

1. Prepara la escena: camara en el visor, capas, resolucion, sol, entorno...
2. En **Setups** pulsa **+**: se crea un setup con lo que ves.
3. Repite para cada vista. Doble clic en un setup (o el boton de play) para volver a el.
4. En **Render por lotes**, marca los setups, elige carpeta y formato, y pulsa **Renderizar**.

```
<carpeta>\<setup>\<setup>.exr
<carpeta>\<setup>\<setup>_<render element>.exr
```

## Notas

- Desactiva el **candado de vista** en Render Setup para que se use la camara de cada setup.
- Manten **ESC** pulsado entre dos renders para detener el lote.
- La interfaz se puede abrir en un navegador (`REASceneManager/Contents/ui/index.html`) con una escena
  de ejemplo, para disenarla sin 3ds Max.
- Si sale un error, copia el texto del **MAXScript Listener** (F11). Dentro de la ventana, **F12** abre
  las herramientas de desarrollo de la web.

## Estructura

```
REASceneManager/
  PackageContents.xml        registro del plugin para 3ds Max
  Contents/scripts/          MAXScript: arranque, ventana WebView2, funciones de escena
  Contents/ui/               interfaz web (HTML, CSS, JS)
  Contents/bin/              Microsoft WebView2 SDK (licencia en WebView2_LICENSE.txt)
```
