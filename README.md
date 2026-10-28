# REA Scene Manager

Plugin para **3ds Max 2021 + Corona** que permite:

1. **Estados de escena**: guardar la camara, las capas visibles, la resolucion, los render elements activos y los limites de Corona (pases, ruido, tiempo), y volver a cualquiera con un clic.
2. **Render por lotes**: renderizar varios estados seguidos. Cada uno se guarda en su propia carpeta.
3. **Camaras**: ver, seleccionar, crear desde la vista, renombrar, bloquear y borrar.
4. **Render elements y salida**: activar, desactivar, anadir y borrar elementos (de Corona), y poner la ruta de salida de la imagen y de todos los elementos a la vez.

Los estados se guardan **dentro del archivo .max**. Si abres el archivo en otro PC, siguen ahi.

Esta escrito desde cero en MAXScript. No hace falta compilar nada.

## Instalar

1. Descarga este repo: boton verde **Code > Download ZIP**, y descomprimelo.
2. Doble clic en **`instalar.bat`**. Copia la carpeta `REASceneManager` a
   `%APPDATA%\Autodesk\ApplicationPlugins\`.
3. Reinicia 3ds Max.
4. Pon el boton en la barra: **Customize > Customize User Interface > Toolbars**,
   categoria **REA**, y arrastra **REA Scene Manager** a una barra de herramientas.

### Probar sin instalar

En 3ds Max: **Scripting > Run Script...** y elige
`REASceneManager\Contents\scripts\REASM_probar_sin_instalar.ms`.

## Uso rapido

1. Prepara la escena: elige la camara en el visor, enciende o apaga capas y ajusta la resolucion.
2. En **Estados de escena** escribe un nombre y pulsa **Guardar escena actual como estado**.
3. Repite para cada vista que quieras.
4. Doble clic en un estado (o **Aplicar**) para volver a el.
5. En **Render por lotes**, marca los estados, elige la carpeta y el formato, y pulsa **Renderizar seleccionados**.

Resultado del render por lotes:

```
<carpeta>\<estado>\<estado>.exr
<carpeta>\<estado>\<estado>_<render element>.exr
```

## Notas

- Para que el render use la camara del estado, desactiva el **candado de vista** en Render Setup.
- Manten **ESC** pulsado entre dos renders para detener el lote.
- Version 0.1. Todavia no se ha probado dentro de 3ds Max; si sale un error, copia el texto
  del **MAXScript Listener** (F11) y pegalo.
