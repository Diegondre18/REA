-- REA Scene Manager: granja de render en red (sin servidor).
-- Todo vive en una carpeta compartida (NAS):
--   <raiz>\jobs\<id>\job.json          trabajo (lo escribe el plugin)
--   <raiz>\jobs\<id>\scene.max         copia de la escena al enviar
--   <raiz>\jobs\<id>\tasks\<t>.txt     una imagen: salida + operaciones del setup
--   <raiz>\jobs\<id>\tasks\<t>.claim   el nodo que la tomo (se crea de forma atomica)
--   <raiz>\jobs\<id>\tasks\<t>.json    estado de la imagen (lo escribe el nodo)
--   <raiz>\jobs\<id>\pause.flag / cancel.flag / job.ready
--   <raiz>\nodes\<PC>.json             latido del nodo (cada pocos segundos)
--   <raiz>\nodes\<PC>.settings.json    disponibilidad del nodo (la cambia el plugin)

global REASM_GS = bit.intAsChar 29   -- separa id y texto de una imagen

fn REASM_readText f = (try ((dotNetClass "System.IO.File").ReadAllText f) catch (undefined))
fn REASM_writeText f txt =
(
	makeDir (getFilenamePath f) all:true
	local tmp = f + ".tmp"
	(dotNetClass "System.IO.File").WriteAllText tmp txt ((dotNetClass "System.Text.Encoding").UTF8)
	if doesFileExist f do deleteFile f
	renameFile tmp f
)

-- Ruta dentro de la raiz de la granja; nunca fuera de ella.
fn REASM_farmPath root rel =
(
	if (findString rel "..") != undefined do throw "Ruta no permitida"
	(trimRight root "\\") + "\\" + rel
)

fn REASM_farmSubmit root jobId jobJson tasks =
(
	local dir = REASM_farmPath root ("jobs\\" + jobId) + "\\"
	makeDir (dir + "tasks") all:true
	local scene = dir + "scene.max"
	local ok = saveMaxFile scene clearNeedSaveFlag:false useNewFile:false quiet:true
	if not (doesFileExist scene) do throw ("No se pudo guardar la escena en " + scene)
	for t in tasks where t != "" do
	(
		local i = findString t REASM_GS
		REASM_writeText (dir + "tasks\\" + (substring t 1 (i - 1)) + ".txt") (substring t (i + 1) -1)
	)
	REASM_writeText (dir + "job.json") jobJson
	REASM_writeText (dir + "job.ready") (localTime as string)
	dir
)

fn REASM_unixMs =
(
	local dto = dotNetClass "System.DateTimeOffset"
	(dto.UtcNow.ToUnixTimeMilliseconds()) as string
)

-- Lee todo el estado de la granja y lo devuelve como texto JSON sin interpretar (lo interpreta la interfaz).
fn REASM_farmState root =
(
	local r = trimRight root "\\"
	local nodes = for f in (getFiles (r + "\\nodes\\*.json")) where not (matchPattern f pattern:"*.settings.json") collect
		REASM_obj #(#("file", filenameFromPath f), #("text", REASM_readText f))
	local settings = for f in (getFiles (r + "\\nodes\\*.settings.json")) collect
		REASM_obj #(#("file", filenameFromPath f), #("text", REASM_readText f))
	local jobs = for d in (getDirectories (r + "\\jobs\\*")) where doesFileExist (d + "job.ready") collect
	(
		local tasks = for f in (getFiles (d + "tasks\\*.json")) collect REASM_obj #(#("file", filenameFromPath f), #("text", REASM_readText f))
		local claims = for f in (getFiles (d + "tasks\\*.claim")) collect (getFilenameFile f)
		REASM_obj #(#("dir", d), #("text", REASM_readText (d + "job.json")), #("tasks", tasks), #("claims", claims), \
			#("paused", doesFileExist (d + "pause.flag")), #("cancelled", doesFileExist (d + "cancel.flag")))
	)
	REASM_obj #(#("ok", doesDirectoryExist r), #("pc", sysInfo.computername), #("now", REASM_unixMs()), #("nodes", nodes), #("settings", settings), #("jobs", jobs))
)

-- Operaciones sobre archivos de la granja que pide la interfaz: write / delete / flag / unflag / rmdir.
fn REASM_farmFile root op rel txt =
(
	local f = REASM_farmPath root rel
	case op of
	(
		"write": REASM_writeText f txt
		"delete": if doesFileExist f do deleteFile f
		"flag": REASM_writeText f (localTime as string)
		"unflag": if doesFileExist f do deleteFile f
		"rmdir": try ((dotNetClass "System.IO.Directory").Delete f true) catch (throw "No se pudo borrar la carpeta (quizas esta en uso)")
		default: throw ("Operacion desconocida: " + op)
	)
	true
)

-- Guarda la raiz de la granja para el REA Node de este PC.
fn REASM_farmSetRoot root =
(
	local f = (systemTools.getEnvVariable "LOCALAPPDATA") + "\\REASceneManager\\node.json"
	REASM_writeText f ("{\"root\": " + (REASM_jStr root) + "}")
	true
)

-- ==================================================================== versiones de software

fn REASM_fileVersion f = (try (((dotNetClass "System.Diagnostics.FileVersionInfo").GetVersionInfo f).ProductVersion) catch (""))

fn REASM_findPlugin dirs pattern depth =
(
	local found = ""
	for d in dirs where found == "" and doesDirectoryExist d do
	(
		local list = getFiles (d + "\\" + pattern)
		if list.count > 0 then found = list[1]
		else if depth > 0 do found = REASM_findPlugin (for s in (getDirectories (d + "\\*")) collect (trimRight s "\\")) pattern (depth - 1)
	)
	found
)

-- Versiones de 3ds Max y de los plugins que importan para renderizar igual en todos los PCs.
fn REASM_versions =
(
	local root = trimRight (getDir #maxroot) "\\"
	local pf = systemTools.getEnvVariable "ProgramFiles"
	local dirs = #(root + "\\plugins", root, pf + "\\Corona", pf + "\\Itoo Software", pf + "\\tyFlow", (systemTools.getEnvVariable "ProgramData") + "\\Autodesk\\ApplicationPlugins")
	try (for i = 1 to pluginPaths.count() do appendIfUnique dirs (trimRight (pluginPaths.get i) "\\")) catch ()
	fn ver dirs pat = (local f = REASM_findPlugin dirs pat 3; if f == "" then "" else REASM_fileVersion f)
	-- la misma busqueda de archivos que hace REA Node, para comparar versiones iguales
	local corona = ver dirs "Corona*.dlr"
	if corona == "" do corona = try ((CoronaRenderer.CoronaFp.getVersion()) as string) catch ("")
	REASM_obj #( \
		#("max", ((2000 + ((maxVersion())[1] / 1000) - 2) as string)), \
		#("corona", corona), \
		#("forest", ver dirs "Forest*.dlo"), \
		#("railclone", ver dirs "RailClone*.dlo"), \
		#("tyflow", ver dirs "tyFlow*.dlo"))
)
