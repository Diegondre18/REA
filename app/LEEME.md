# LAP Cerebro · App de Windows

App de escritorio del estudio. Reúne los proyectos de Arquitectura, Diseño Interior, Visualización y Administración: plan de entregables con vistos buenos, cronograma personal, reuniones con cliente, comités internos y quién está trabajando en qué. Todo se sincroniza en vivo con el servidor de la oficina (ver `../servidor/LEEME.md`).

## A cargo de cada proyecto

Cada proyecto tiene **2 personas a cargo, máximo 3**: el **Director creativo** (siempre, en todos los proyectos), la **directora o director del proyecto** (obligatorio, otra persona) y, si hace falta, un **apoyo**. Se eligen al crear o editar el proyecto. Quien dirige y el apoyo arman el plan de entregables, lo envían a visto bueno, lo aprueban y editan el proyecto; los dos quedan como integrantes y no dan visto bueno a su propio plan. Si un proyecto viejo quedó dirigido por el Director creativo, el agente Plan avisa para elegir a quien lo dirija.

## Cómo funciona el plan de entregables

1. Quien lidera el proyecto arma el plan: fecha, qué se entrega, área, quién está al mando y para qué reunión es.
2. Lo envía a visto bueno. Cada integrante lo revisa y da su visto bueno o pide cambios.
3. Con todos los vistos buenos, quien lidera lo aprueba (el director puede aprobar sin esperar).
4. Solo entonces cada entregable pasa al cronograma personal de sus responsables, y a cada uno le llega un aviso.
5. Para cambiar un plan aprobado se crea una versión nueva, que vuelve a pedir visto bueno. Al aprobarla se actualizan las tareas sin perder su avance.

## Herramientas del estudio

Cada proyecto tiene, además de su plan y sus tareas:

- **Semáforo** (verde, amarillo, rojo) con una nota de por qué, que ve todo el estudio.
- **Licencias**: trámites de curaduría con radicado, estado, plazo para responder observaciones y vigencia. La app avisa antes de que se venza un plazo.
- **Planos**: listado con su revisión vigente (A, B, C…) y la ruta del archivo; **Envíos** registra qué planos, en qué revisión, se enviaron a quién.
- **Obra**: bitácora de visitas con avance, carpeta de fotos y pendientes que se vuelven tareas.
- **Finanzas** (solo quien lidera, Dirección y Administración): honorarios y cobros por hitos.
- **Plantillas** para arrancar el plan de entregables de cada fase.

En el panel de cada tarea: subtareas, dependencias y **revisión de imágenes**: se elige la imagen desde su carpeta (no se sube a ningún lado) y el equipo deja comentarios con pines sobre ella. Las actas de reuniones y comités tienen compromisos que se vuelven tareas.

En la sección **Estudio**: solicitudes entre áreas (al aceptarlas se vuelven tarea), ausencias, directorio de clientes y proveedores y finanzas del estudio.

**Ausencias:** a quien registró vacaciones, permiso o incapacidad no se le pueden asignar tareas ni entregables del plan que empiecen o se entreguen en esas fechas. Quien asigna ve la advertencia al elegir responsables y la app (y el servidor) no deja guardar. Si la ausencia cae en medio de una tarea larga, solo se avisa.

El botón del sol y la luna arriba cambia entre modo claro, oscuro o el del sistema.

## Oficina y agentes

**Oficina** es el estudio en pixel art, en vista isométrica. Cada persona arma su muñeco y tiene su puesto en la fila de su área; Dirección tiene su oficina de vidrio. Se camina con las flechas (o WASD) o haciendo clic en el piso.

- **Menos texto:** en la vista general cada persona es un punto de color con su estado; con el mouse encima se ve su nombre, estado y tarea. *Mostrar nombres* los deja fijos.
- **Zoom:** clic en el nombre de un área (o en Dirección, Laboratorio, Sala de juntas, Cafetería, Nuevas tecnologías) para verla aislada, con la lista de en qué está trabajando cada persona. Clic en un puesto o en una persona → *Ver su puesto y premios*. *Mi puesto* va al tuyo. Esc o *Ver toda la oficina* para volver.
- **Sala de nuevas tecnologías:** impresoras 3D trabajando, estación de realidad virtual, cortadora láser, granja de render, dron y mesa holográfica.
- **Marca:** símbolo LAP en las paredes y en el piso, *Left Angle Partnership* y la frase *// Diseño de vanguardia con perspectiva global.* en azul brillante, con los signos + y círculos del manual.
- **TV de la sala de estar:** clic en ella (o en *Ranking y anuncios*) para ver en grande los anuncios vigentes y el **ranking de la semana**: entrega a tiempo 3 puntos, agradecimiento recibido 2, pausa activa asistida 1, descanso del Pomodoro 1. El ranking también está en la pantalla de la TV.

Si el muñeco se para de su puesto, el equipo lo ve **fuera del puesto**; En reunión va a la sala de juntas, Almuerzo y En pausa a la cafetería, No molestar lleva audífonos.

**Agentes** son seis muñequitos que revisan el estudio con reglas fijas: Vigía (atrasos y tareas bloqueadas), Agenda (reuniones, actas y avances de comité), Plan (planes y vistos buenos), Equipo (carga y ausencias), Trámites (licencias, planos y revisiones de imagen) y Cuentas (cobros vencidos y por facturar; solo Dirección y Administración). No usan inteligencia artificial ni internet ni consumo de ningún servicio: corren en cada PC con los datos que ya están sincronizados. Viven en el **laboratorio de agentes** de la oficina, disponibles para todos (clic en uno para ver lo que encontró), y lo urgente aparece en Inicio.

## Burbuja, estados y tocar el hombro

**Burbuja.** Al instalar, el muñeco de cada persona se asoma por el borde de la pantalla (solo la cabeza y las manos agarrando el borde), siempre encima, aunque la app esté minimizada o cerrada en la bandeja (junto al reloj). Se arrastra a cualquier borde o esquina (también a otro monitor) y recuerda dónde quedó. No tapa clics: solo responde con el mouse encima. Cuando llega un aviso, el muñeco salta, aparece un globito con el texto y un número rojo con los pendientes; clic en el globito abre la app en eso. Un clic en el muñeco abre el menú de estados; doble clic abre la app. Se esconde sola mientras alguien presenta o tiene algo a pantalla completa, y se puede ocultar desde su menú, el ícono de la bandeja o el perfil. Además: aviso de Windows, parpadeo y número sobre el ícono de la barra de tareas.

**Estados.** Disponible, No molestar (audífonos), En reunión (va a la sala de juntas), Almuerzo (va a la cafetería) y Fuera (sale de la oficina). Se eligen en la burbuja, en la barra superior o en el perfil. Las reuniones agendadas en la app ponen «En reunión» solas a la hora de inicio y lo quitan al terminar. En No molestar y En reunión los avisos solo suman al contador, sin globito ni sonido; **lo urgente pasa igual**: cambios de fecha de tareas y reuniones, y los mensajes directos de Dirección. Volver caminando al puesto deja a la persona Disponible.

**Sonido.** Un tono suave para lo normal y otro más notorio para lo urgente. Se silencia desde la burbuja o el perfil; lo urgente suena igual.

**Tocar el hombro.** Clic en otra persona en la oficina (o en su perfil) → Tocar el hombro, con un mensaje corto opcional. Le llega a su burbuja con tres botones: Voy, En 10 min, Ahora no; la respuesta vuelve a quien tocó.

## Bienestar, premios y celebraciones

**Pomodoro.** Desde la burbuja o el botón *Pomodoro* de arriba: bloques de 25/5, 50/10 o 90/20 (cada 4 bloques, un descanso largo). Mientras trabajas quedas en No molestar y la burbuja muestra la cuenta regresiva. **El descanso es clave:** suena aunque el sonido esté silenciado, su globito no se cierra solo e insiste cada 2 minutos; se puede pedir 5 minutos más una sola vez. En el descanso quedas "En pausa" y tu muñeco va a la cafetería.

**Pausas activas.** Dirección fija las horas para todo el estudio (Tu perfil → Pausas activas de todo el estudio) y cada quien puede sumar las suyas. A esa hora (lunes a viernes) aparece a todos un aviso a pantalla completa, encima de cualquier programa (Revit, Chrome…) aunque la app esté minimizada, con el fondo difuminado y los colores de la marca, con **Asistir** u **Omitir pausa activa** (y quién ya se sumó); si estás en una reunión, espera a que termine. Los descansos del Pomodoro usan el mismo aviso (Tomar el descanso, +5 min, +10 min u Omitir descanso). Solo lo asistido cuenta para la racha, los premios y el ranking. "Empezar" abre seis ejercicios guiados con tu muñeco (cuello, brazos, hombros, espalda, vista 20-20-20 y caminar).

**Cierre del día.** A la hora que elijas (por defecto 6 p. m.) se pregunta cuánto avanzaste en tus tareas y qué sigue mañana. Actualiza las tareas y queda guardado; en el comité, el botón *Traer mis cierres del día* llena tu avance.

**Racha de bienestar (privada).** En Mi semana: pausas y descansos de la semana, meta de 8 y semanas seguidas cumpliéndola. Solo la ves tú.

**Premios del muñeco.** Planta (5 entregas a tiempo), taza (10 pausas activas), trofeo de la semana (meta de bienestar), cuadro (20 entregas a tiempo), lámpara (3 semanas con la meta) y gorra (40 entregas a tiempo). Se ven en tu puesto de la oficina.

**Celebraciones y cumpleaños.** Confeti en la app y en la burbuja al terminar una tarea a tiempo o cuando se aprueba un plan; en la oficina sale confeti sobre quien termina una tarea. Cada quien pone su cumpleaños (día y mes) en el perfil: ese día tiene globos en su puesto, el equipo recibe un aviso y la app lo celebra al abrir.

**Pantalla de la oficina (TV).** Oficina → *Pantalla de la oficina*: la oficina en grande, la hora, las reuniones de hoy, las entregas de la semana, quién está y los cumpleaños. Para una TV fija, crea una cuenta y que Dirección le ponga el rol *Pantalla de la oficina*: abre siempre así y no aparece como persona.

## Equipo: agradecimientos, anuncios, bienvenida y duraciones reales

**Agradecimientos.** Desde el perfil de un compañero o haciendo clic en su muñeco en la oficina: *Dar las gracias*. Le llega a su burbuja con confeti y queda en Equipo. Con 5 agradecimientos su muñeco gana la medalla de compañerismo.

**Anuncios de Dirección.** Equipo → *Publicar un anuncio*, con fecha hasta la que se muestra. Llega a la burbuja de todos, queda arriba en la app y en la pantalla de la oficina. Si se marca *importante*, suena aunque estén en No molestar.

**Bienvenida.** En Inicio, una lista guiada (armar el muñeco, cumpleaños, conocer la oficina, cambiar el estado, marcar en qué trabajas, ver Mi semana) que se marca sola. Se puede ocultar.

**Cuánto tardan las cosas de verdad.** Con las tareas terminadas, la app calcula cuántos días hábiles toma cada tipo de trabajo (mediana), cuánto se planea y qué tan seguido se entrega a tiempo: Línea de tiempo → *Duraciones*, para todo el estudio o por persona. Al crear una tarea con tipo y fecha de inicio sugiere una entrega realista (con el historial de la persona si tiene al menos 3 de ese tipo) y avisa si quedó corta. Es estadística simple, sin IA.

**Agua.** Opcional en el perfil: un globito suave cada 45 a 120 minutos en horario laboral, botón *Tomé un vaso* y un vaso junto al muñeco de la burbuja que se llena durante el día. Cuenta en tu bienestar privado.

## Respaldo del estudio

En el PC servidor, **Tu perfil → Respaldo del estudio**: se elige una carpeta en un disco externo o en el NAS y una vez al día se guarda ahí una copia completa (las últimas 30). Hay botones para respaldar ahora, abrir la carpeta y restaurar cualquier respaldo; al restaurar, los datos de ese momento quedan guardados aparte en el PC servidor. Si el respaldo falla o lleva más de 2 días sin hacerse, Dirección recibe un aviso y ve un letrero arriba en la app.

## Mi semana y línea de tiempo

**Mi semana** muestra lo que vence en la semana (por día), lo atrasado, lo bloqueado esperando a otros, quién te espera a ti, las reuniones y quién del equipo no estará. Dirección ve además las entregas y atrasos de todo el estudio y la carga de cada persona. Cada lunes llega un aviso con el resumen y la app lo ofrece al abrir la primera vez en la semana.

**Línea de tiempo** junta todos los proyectos en un calendario: por proyecto (con entregas, reuniones con cliente y plazos de licencias) o por persona (tareas, ausencias y carga por semana, en amarillo desde 4 tareas y en rojo desde 6). Escalas de semanas, meses o trimestre y filtro por área. Por ahora es para mirar: las fechas se cambian en cada tarea.

## Actualizaciones

En tu perfil, abajo, está la versión instalada y el botón **Buscar actualizaciones**, que muestra si está buscando, el porcentaje de descarga o el error si algo falla. Los errores también quedan en `%APPDATA%\LAP Cerebro\actualizaciones.log`.

## Instalar en cada PC

1. Descarga `LAP-Cerebro-Setup-x.y.z.exe` desde *Releases* (o desde la ejecución más reciente de *Actions* → artefacto `LAP-Cerebro-Setup`).
2. Ábrelo. Como el instalador no tiene firma digital paga, Windows puede mostrar **"Windows protegió su PC"**: haz clic en **Más información → Ejecutar de todas formas**.
3. Al abrir la app, busca sola el servidor del estudio en la red y se conecta. Si es el primer PC, ofrece **Usar este PC como servidor del estudio**: elígelo en el PC que siempre está prendido (ver `../servidor/LEEME.md`).
4. Crea tu cuenta con tu correo @laparq.com y elige tu equipo.
5. Desde ese momento la app se abre sola al prender el PC y te deja conectado con el equipo. Cerrar la ventana la deja en la bandeja junto al reloj, para que sigas apareciendo conectado; para salir del todo, clic derecho en el ícono → Salir. El arranque automático se puede apagar en Tu perfil (en el PC servidor conviene dejarlo encendido).

## Actualizaciones automáticas

Cada PC busca versiones nuevas en *Releases* de GitHub al abrir la app y cada 4 horas. La descarga ocurre en segundo plano y la app muestra el aviso **«LAP Cerebro x.y.z está lista»** con el botón **Reiniciar y actualizar**. Si nadie lo pulsa, se instala sola la próxima vez que se cierre la app.

Para publicar una versión nueva: sube el número de `version` en `package.json` y, en GitHub, ve a *Actions → App de Windows y servidor → Run workflow*, marca **Publicar** y ejecútalo (o sube un tag con ese número, por ejemplo `v2.1.1`). GitHub Actions arma el instalador y lo publica en *Releases*; desde ahí cada PC se actualiza sola. Solo se actualizan solos los PC que ya tienen la 2.1.0 o posterior; la 2.0 se instala a mano una última vez.

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
npm run bundle-server
```

```bash
npm start
```

El instalador se arma en GitHub Actions (`.github/workflows/windows.yml`) en una máquina Windows. Para publicar una versión, sube un tag:

```bash
git tag v2.1.1 && git push origin v2.1.1
```

| Archivo | Para qué sirve |
|---|---|
| `main.js` | Ventana, bandeja, arranque con Windows, sesión cifrada, avisos, actualizaciones y carpetas. |
| `host.js` | El servidor dentro de la app y la búsqueda del servidor en la red. |
| `server-bundle/` | Se arma al construir: PocketBase y las reglas de `../servidor` que viajan dentro del instalador. |
| `preload.js` | Puente mínimo entre la interfaz y Windows. |
| `src/js/core.js` | Áreas, estados, fases, fechas y utilidades. |
| `src/js/store.js` | Conexión, sincronización en vivo, consultas y acciones. |
| `src/js/ui.js`, `src/js/sheets.js` | Piezas comunes: tablero, cronograma, archivo y formularios. |
| `src/js/views-*.js`, `src/js/app.js` | Las pantallas y el marco de la app. |
| `src/vendor/` | PocketBase, Preact y htm, y las tipografías Hanken Grotesk y Geist Mono (licencia OFL). |
| `build/icon.ico` | Ícono de la app, con el símbolo de LAP. |

La tipografía corporativa Whyte es de pago; la app usa Hanken Grotesk como sustituta con los mismos pesos (Light, Book, Medium). Con una licencia de escritorio de Whyte se puede cambiar en `src/styles.css`.

## Libretas y actas de obra (2.20)

- **Libretas** (menú lateral): cada persona tiene **Mi libreta**, su página personal con notas, pendientes propios y bloques vivos (mis tareas, reuniones de la semana, próximas entregas, mis proyectos). Puede crear más libretas:
  - **Página**: bloques como en Notion. `/` para elegir el tipo (título, lista, casilla, destacado, imagen, enlace…), atajos `#`, `-`, `1.`, `[]`, `>`, `---`; `@` para mencionar a una persona (le llega un aviso) o un proyecto. Se pegan imágenes con Ctrl+V. Los bloques se reordenan arrastrando.
  - **Tablero libre** (mini Miro): notas de colores, textos, imágenes, enlaces y marcos donde se quiera; rueda para acercar, arrastrar el fondo para moverse, soltar o pegar imágenes.
  - Plantillas: notas de reunión, pendientes, brief de cliente, checklist antes de entregar, referentes, lluvia de ideas, moodboard.
  - **Compartir**: la dueña elige quién puede **ver** y quién puede **editar**. Quien edita no puede borrarla ni compartirla. Aparece en *Compartidas conmigo* y llega un aviso.
- **Actas de obra** (proyecto → Obra): numeradas por proyecto; datos de la visita, avance, asistentes del equipo y externos, temas, compromisos del equipo (se vuelven tareas) y de contratistas o cliente, pendientes del acta anterior, fotos con nota, firmas en pantalla y **PDF con la marca LAP**. Al cerrarla ya no se cambia, salvo Dirección.
- **Entregar** en cada tarea, junto a «Estoy trabajando en esto»: la marca como terminada.

## Gestión: presupuestos, costos, pagos, caja, horas y rentabilidad (2.21)

**Quién la ve.** El área nueva **Gestión** (en el perfil de cada persona) junto con Dirección y Administración ven el menú *Gestión* y la pestaña *Finanzas* completa de cada proyecto. Quien lidera un proyecto ve la parte de su proyecto. El resto del equipo no ve valores.

**Pestañas de Gestión**
- **Tablero:** contratado, cobrado, lo que nos deben (y lo vencido), por facturar, lo que debemos a proveedores, gastos fijos, caja al cierre del mes y horas del mes (con las extra). Semáforo de los proyectos, flujo de caja, rentabilidad por proyecto y lo que dice el agente de Gestión.
- **Mapa de proyectos:** una tarjeta por proyecto con el semáforo y barras de entregas, cobrado, pagado a proveedores, costos y horas.
- **Estado de pagos:** cliente (contrato, facturado, pagado, nos debe, por facturar) y proveedores (contratos, adicionales, pagado, les debemos).
- **Presupuesto y costos:** presupuesto por capítulo contra lo gastado. Se importa desde Excel.
- **Flujo de caja:** ingresos y egresos por mes, reales y proyectados, con el saldo. Suma los cobros, los pagos a proveedores, los gastos fijos y los movimientos que se registren o importen.
- **Gastos fijos:** arriendo, servicios, nómina, software… Se reparten entre las horas trabajadas para que la rentabilidad incluya lo que cuesta la oficina.
- **Horas y rentabilidad:** horas de cada persona y de cada proyecto, en horario y extra, con su costo. Aquí se pone el **costo por hora** de cada persona.
- **Ajustes:** horario (8:45 a 6:00), almuerzo (1:15 a 2:00 de lunes a jueves), **recargo de la hora extra** (se pone a mano), saldo inicial de caja, margen objetivo y si se reparten los gastos fijos.

**Proveedores.** El cliente le paga al estudio el 100 % y el estudio les paga a los proveedores. Cada contrato lleva sus pagos y, **aparte**, sus adicionales (solo los aprobados suman a lo que se debe).

**Importar Excel.** Botón *Importar Excel*: se elige qué es (presupuesto, control de costos o flujo de caja), el proyecto, el archivo y la hoja. La app encuentra la fila de títulos y adivina las columnas; se pueden corregir antes de importar. En el presupuesto, las filas sin cantidades son títulos de capítulo y los subtotales se saltan. Entiende números como `$ 1.234.567,89` y fechas `05/11/2026`.

**Horas automáticas.** Mientras alguien tiene una tarea con «Estoy trabajando en esto» y la app abierta, cada minuto cuenta para el proyecto de esa tarea. Antes de las 8:45, después de las 6:00, en el almuerzo o el fin de semana cuenta como **extra** (y cuesta más con el recargo). No cuenta si la persona lleva más de 10 minutos sin tocar el computador ni si está en almuerzo, pausa o fuera. El viernes cada uno elige en su perfil si almuerza de 12 a 1 o de 1 a 2.

**Semáforo.** Cada proyecto se mide en entregas, cobros, costos, horas y margen; el color general es el peor de los cinco.

**Premio de la semana.** El lunes se guarda quién ganó el ranking de la semana anterior. Esa persona lleva una corona en su muñeco toda la semana y aparece arriba del ranking.
