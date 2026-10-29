-- REA Scene Manager - nucleo
-- Funciones que la interfaz web llama para leer y modificar la escena de 3ds Max.
-- La interfaz guarda sus datos (setups) como un texto JSON dentro del .max (appData del nodo raiz).

global REASM_VERSION = "0.4.0"
global REASM_APPDATA_DATA = 7310
global REASM_US = bit.intAsChar 31   -- separa argumentos de un mensaje
global REASM_RS = bit.intAsChar 30   -- separa campos dentro de una operacion
global REASM_toJson
global REASM_batchBackup = undefined

-- ==================================================================== JSON (solo escritura)

struct REASM_JObj (keys = #(), vals = #())

fn REASM_obj pairs =
(
	local o = REASM_JObj()
	for p in pairs do
	(
		append o.keys p[1]
		append o.vals p[2]
	)
	o
)

fn REASM_jStr s =
(
	s = s as string
	local ss = stringStream ""
	format "\"" to:ss
	for i = 1 to s.count do
	(
		local c = s[i]
		local code = bit.charAsInt c
		case of
		(
			(c == "\""): format "\\\"" to:ss
			(c == "\\"): format "\\\\" to:ss
			(c == "\n"): format "\\n" to:ss
			(c == "\r"): format "\\r" to:ss
			(c == "\t"): format "\\t" to:ss
			(code < 32): format "\\u%" (formattedPrint code format:"04x") to:ss
			default: format "%" c to:ss
		)
	)
	format "\"" to:ss
	ss as string
)

fn REASM_toJson v =
(
	case of
	(
		(v == undefined): "null"
		(isKindOf v String): REASM_jStr v
		(isKindOf v BooleanClass): (if v then "true" else "false")
		(isKindOf v Integer): (v as string)
		(isKindOf v Float): (v as string)
		(isKindOf v Double): (v as string)
		(isKindOf v Array):
		(
			local ss = stringStream ""
			format "[" to:ss
			for i = 1 to v.count do
			(
				if i > 1 do format "," to:ss
				format "%" (REASM_toJson v[i]) to:ss
			)
			format "]" to:ss
			ss as string
		)
		((classOf v) == REASM_JObj):
		(
			local ss = stringStream ""
			format "{" to:ss
			for i = 1 to v.keys.count do
			(
				if i > 1 do format "," to:ss
				format "%:%" (REASM_jStr v.keys[i]) (REASM_toJson v.vals[i]) to:ss
			)
			format "}" to:ss
			ss as string
		)
		default: REASM_jStr (v as string)
	)
)

-- Divide un texto por un separador, conservando los campos vacios.
fn REASM_split s sep =
(
	local res = #()
	local rest = s
	local idx = findString rest sep
	while idx != undefined do
	(
		append res (substring rest 1 (idx - 1))
		rest = substring rest (idx + 1) -1
		idx = findString rest sep
	)
	append res rest
	res
)

-- ==================================================================== utilidades de escena

fn REASM_safeName s =
(
	local bad = "\\/:*?\"<>|"
	local out = ""
	for i = 1 to s.count do
		out += (if (findString bad s[i]) != undefined then "_" else s[i])
	if out == "" then "sin_nombre" else out
)

fn REASM_isCorona = (matchPattern ((classOf renderers.current) as string) pattern:"*Corona*")

fn REASM_cameras = (for c in cameras where (superClassOf c) == camera collect c)

fn REASM_findCamera nm =
(
	if nm == "" then undefined
	else
	(
		local c = getNodeByName nm exact:true
		if c != undefined and (superClassOf c) == camera then c else undefined
	)
)

fn REASM_isLocked c = (not ((getTransformLockFlags c).isEmpty))

fn REASM_suns =
(
	for l in lights where (superClassOf l) == light and \
		(matchPattern ((classOf l) as string) pattern:"*Sun*" or matchPattern ((classOf l) as string) pattern:"*Daylight*") collect l
)

fn REASM_lightOn l =
(
	if isProperty l #on then l.on
	else if isProperty l #enabled then l.enabled
	else true
)

fn REASM_setLightOn l val =
(
	if isProperty l #on then l.on = val
	else if isProperty l #enabled do l.enabled = val
)

-- Mapas candidatos a entorno: CoronaSky, y bitmaps HDR/EXR.
fn REASM_envMaps =
(
	local res = #()
	for cn in #("CoronaSky", "CoronaBitmap", "Bitmaptexture") do
	(
		local cls = try (execute cn) catch (undefined)
		if cls != undefined do
		(
			local insts = try (getClassInstances cls) catch (#())
			for m in insts do
			(
				local ok2 = (cn == "CoronaSky")
				if not ok2 do
				(
					local f = try (m.filename as string) catch ("")
					ok2 = matchPattern f pattern:"*.hdr" or matchPattern f pattern:"*.exr"
				)
				if ok2 do appendIfUnique res m
			)
		)
	)
	if environmentMap != undefined do appendIfUnique res environmentMap
	res
)

fn REASM_elementClasses =
(
	local all = RenderElement.classes
	local cor = for c in all where matchPattern (c as string) pattern:"C*" collect c
	local src = if cor.count > 0 then cor else all
	sort (for c in src collect (c as string))
)

-- ==================================================================== consultas

fn REASM_getScene =
(
	local cams = for c in REASM_cameras() collect \
		REASM_obj #(#("name", c.name), #("locked", REASM_isLocked c), #("cls", (classOf c) as string))
	local ac = getActiveCamera()
	local layers = for i = 0 to (LayerManager.count - 1) collect \
		REASM_obj #(#("name", (LayerManager.getLayer i).name), #("on", (LayerManager.getLayer i).on))
	local re = maxOps.GetCurRenderElementMgr()
	local elems = for i = 0 to (re.NumRenderElements() - 1) collect
	(
		local e = re.GetRenderElement i
		REASM_obj #(#("index", i), #("name", e.elementName), #("enabled", e.enabled), #("cls", (classOf e) as string))
	)
	local suns = for s in REASM_suns() collect REASM_obj #(#("name", s.name), #("on", REASM_lightOn s))
	local envs = for m in REASM_envMaps() collect m.name
	local corona = REASM_obj #(#("isCorona", REASM_isCorona()))
	if REASM_isCorona() do
	(
		local r = renderers.current
		corona = REASM_obj #( \
			#("isCorona", true), \
			#("passLimit", (if isProperty r #progressive_passLimit then r.progressive_passLimit else undefined)), \
			#("noiseLimit", (if isProperty r #adaptivity_targetError then r.adaptivity_targetError else undefined)), \
			#("timeLimit", (if isProperty r #progressive_timeLimit then r.progressive_timeLimit else undefined)))
	)
	REASM_obj #( \
		#("version", REASM_VERSION), \
		#("file", maxFileName), \
		#("filePath", maxFilePath), \
		#("renderer", (classOf renderers.current) as string), \
		#("cameras", cams), \
		#("activeCamera", (if ac != undefined then ac.name else "")), \
		#("layers", layers), \
		#("elements", elems), \
		#("elementClasses", REASM_elementClasses()), \
		#("res", REASM_obj #(#("w", renderWidth), #("h", renderHeight))), \
		#("suns", suns), \
		#("envMaps", envs), \
		#("activeEnv", (if environmentMap != undefined and useEnvironmentMap then environmentMap.name else "")), \
		#("corona", corona), \
		#("selection", (for o in selection collect o.name)), \
		#("outputFile", rendOutputFilename), \
		#("defaultFolder", (if maxFilePath != "" then (maxFilePath + "render") else (getDir #renderoutput))))
)

fn REASM_loadData =
(
	local d = getAppData rootNode REASM_APPDATA_DATA
	if d == undefined then "" else d
)

fn REASM_saveData txt =
(
	setAppData rootNode REASM_APPDATA_DATA txt
	setSaveRequired true
	true
)

-- ==================================================================== aplicar un setup

-- Cada operacion es un texto con campos separados por REASM_RS:
--   cam|nombre   res|ancho|alto   layer|nombre|1/0   elem|nombre|1/0   obj|nombre|1/0 (1 = oculto)
--   sun|nombre ("" = apagar todos)   env|nombre ("" = sin entorno)   corona|passLimit|valor
-- Devuelve la lista de cosas que no se encontraron.
fn REASM_applyOps ops =
(
	local missing = #()
	local wasOpen = renderSceneDialog.isOpen()
	if wasOpen do renderSceneDialog.close()
	local re = maxOps.GetCurRenderElementMgr()
	local camToSet = undefined
	for op in ops where op != "" do
	(
		local f = REASM_split op REASM_RS
		case f[1] of
		(
			"cam":
			(
				local c = REASM_findCamera f[2]
				if c == undefined then append missing ("Camara: " + f[2]) else camToSet = c
			)
			"res":
			(
				renderWidth = f[2] as integer
				renderHeight = f[3] as integer
			)
			"layer":
			(
				local l = LayerManager.getLayerFromName f[2]
				if l == undefined then append missing ("Capa: " + f[2]) else l.on = (f[3] == "1")
			)
			"elem":
			(
				local found = false
				for i = 0 to (re.NumRenderElements() - 1) do
				(
					local e = re.GetRenderElement i
					if e.elementName == f[2] do
					(
						e.enabled = (f[3] == "1")
						found = true
					)
				)
				if not found do append missing ("Render element: " + f[2])
			)
			"obj":
			(
				local o = getNodeByName f[2] exact:true
				if o == undefined then append missing ("Objeto: " + f[2]) else o.isHidden = (f[3] == "1")
			)
			"sun":
			(
				for s in REASM_suns() do REASM_setLightOn s (s.name == f[2])
			)
			"env":
			(
				if f[2] == "" then useEnvironmentMap = false
				else
				(
					local m = undefined
					for x in REASM_envMaps() where x.name == f[2] do m = x
					if m == undefined then append missing ("Entorno: " + f[2])
					else
					(
						environmentMap = m
						useEnvironmentMap = true
					)
				)
			)
			"corona":
			(
				local r = renderers.current
				if REASM_isCorona() and f[3] != "" do
				(
					case f[2] of
					(
						"passLimit": if isProperty r #progressive_passLimit do r.progressive_passLimit = (f[3] as integer)
						"noiseLimit": if isProperty r #adaptivity_targetError do r.adaptivity_targetError = (f[3] as float)
						"timeLimit": if isProperty r #progressive_timeLimit do r.progressive_timeLimit = (f[3] as integer)
					)
				)
			)
		)
	)
	if wasOpen do renderSceneDialog.open()
	if camToSet != undefined do viewport.setCamera camToSet
	redrawViews()
	missing
)

-- ==================================================================== salida y render

fn REASM_setElementFilenames folder prefix ext =
(
	local re = maxOps.GetCurRenderElementMgr()
	re.SetElementsActive true
	for i = 0 to (re.NumRenderElements() - 1) do
	(
		local e = re.GetRenderElement i
		re.SetRenderElementFilename i (folder + "\\" + prefix + "_" + (REASM_safeName e.elementName) + ext)
	)
)

fn REASM_setOutput folder nm ext =
(
	makeDir folder all:true
	local wasOpen = renderSceneDialog.isOpen()
	if wasOpen do renderSceneDialog.close()
	local base = REASM_safeName nm
	rendOutputFilename = folder + "\\" + base + ext
	rendSaveFile = true
	REASM_setElementFilenames folder base ext
	if wasOpen do renderSceneDialog.open()
	rendOutputFilename
)

-- Guarda todo lo que un setup puede cambiar, para restaurarlo al terminar un lote.
fn REASM_batchBegin =
(
	local re = maxOps.GetCurRenderElementMgr()
	local r = renderers.current
	REASM_batchBackup = #( \
		getActiveCamera(), renderWidth, renderHeight, \
		(for i = 0 to (LayerManager.count - 1) collect #((LayerManager.getLayer i), (LayerManager.getLayer i).on)), \
		(for i = 0 to (re.NumRenderElements() - 1) collect #((re.GetRenderElement i), (re.GetRenderElement i).enabled, (re.GetRenderElementFilename i))), \
		(for o in objects collect #(o, o.isHidden)), \
		(for s in REASM_suns() collect #(s, REASM_lightOn s)), \
		environmentMap, useEnvironmentMap, \
		rendOutputFilename, rendSaveFile, rendTimeType, \
		(if REASM_isCorona() then #( \
			(if isProperty r #progressive_passLimit then r.progressive_passLimit else undefined), \
			(if isProperty r #adaptivity_targetError then r.adaptivity_targetError else undefined), \
			(if isProperty r #progressive_timeLimit then r.progressive_timeLimit else undefined)) else undefined))
	true
)

fn REASM_batchEnd restore =
(
	local b = REASM_batchBackup
	if b == undefined do return false
	local wasOpen = renderSceneDialog.isOpen()
	if wasOpen do renderSceneDialog.close()
	local re = maxOps.GetCurRenderElementMgr()
	rendOutputFilename = b[10]
	rendSaveFile = b[11]
	rendTimeType = b[12]
	for i = 1 to b[5].count where i <= re.NumRenderElements() do
		re.SetRenderElementFilename (i - 1) b[5][i][3]
	if restore do
	(
		renderWidth = b[2]
		renderHeight = b[3]
		for p in b[4] do try (p[1].on = p[2]) catch ()
		for p in b[5] do try (p[1].enabled = p[2]) catch ()
		for p in b[6] where isValidNode p[1] do p[1].isHidden = p[2]
		for p in b[7] where isValidNode p[1] do REASM_setLightOn p[1] p[2]
		environmentMap = b[8]
		useEnvironmentMap = b[9]
		if b[13] != undefined do
		(
			local r = renderers.current
			if b[13][1] != undefined do try (r.progressive_passLimit = b[13][1]) catch ()
			if b[13][2] != undefined do try (r.adaptivity_targetError = b[13][2]) catch ()
			if b[13][3] != undefined do try (r.progressive_timeLimit = b[13][3]) catch ()
		)
		if b[1] != undefined and isValidNode b[1] do viewport.setCamera b[1]
	)
	if wasOpen do renderSceneDialog.open()
	REASM_batchBackup = undefined
	redrawViews()
	true
)

-- Renderiza la vista activa (la camara del setup ya aplicada) en <carpeta>\<nombre>\<nombre>.<ext>.
fn REASM_render folder nm ext =
(
	local base = REASM_safeName nm
	local dir = folder + "\\" + base
	makeDir dir all:true
	if renderSceneDialog.isOpen() do renderSceneDialog.close()
	rendTimeType = 1
	rendOutputFilename = dir + "\\" + base + ext
	rendSaveFile = true
	REASM_setElementFilenames dir base ext
	max quick render
	REASM_obj #(#("file", rendOutputFilename), #("aborted", keyboard.escPressed))
)

-- ==================================================================== camaras y render elements

fn REASM_camCreate nm =
(
	local tm = inverse (getViewTM())
	local fovv = viewport.GetFOV()
	local cam = undefined
	-- Preferencia: CoronaCam > Physical > Free camera
	local coronaCls = try (execute "CoronaCam") catch (undefined)
	if coronaCls != undefined do
	(
		try
		(
			cam = coronaCls()
			try (cam.targeted = false) catch ()
			try (cam.fov = fovv) catch ()
		)
		catch
		(
			if cam != undefined and isValidNode cam do delete cam
			cam = undefined
		)
	)
	if cam == undefined do
	(
		try
		(
			cam = Physical()
			cam.targeted = false
			cam.specify_fov = true
			cam.fov = fovv
		)
		catch
		(
			if cam != undefined and isValidNode cam do delete cam
			cam = Freecamera fov:fovv
		)
	)
	cam.transform = tm
	cam.name = if nm == "" then (uniqueName "REA_Cam_") else nm
	viewport.setCamera cam
	cam.name
)

fn REASM_camCommand action nm arg =
(
	local c = REASM_findCamera nm
	if c == undefined then false
	else
	(
		case action of
		(
			"view": viewport.setCamera c
			"select": select c
			"lock": if REASM_isLocked c then setTransformLockFlags c #none else setTransformLockFlags c #all
			"rename": if arg != "" do c.name = arg
			"delete":
			(
				try (if c.target != undefined do delete c.target) catch ()
				delete c
			)
		)
		redrawViews()
		true
	)
)

fn REASM_elemCommand action idx arg =
(
	local re = maxOps.GetCurRenderElementMgr()
	local wasOpen = renderSceneDialog.isOpen()
	if wasOpen do renderSceneDialog.close()
	local res = true
	case action of
	(
		"toggle":
		(
			local e = re.GetRenderElement idx
			if e != undefined then e.enabled = not e.enabled else res = false
		)
		"remove":
		(
			local e = re.GetRenderElement idx
			if e != undefined then re.RemoveRenderElement e else res = false
		)
		"add":
		(
			local cls = try (execute arg) catch (undefined)
			if cls != undefined then re.AddRenderElement (cls()) else res = false
		)
	)
	if wasOpen do renderSceneDialog.open()
	res
)

-- ==================================================================== miniaturas

fn REASM_thumbDir =
(
	local d = (systemTools.getEnvVariable "LOCALAPPDATA") + "\\REASceneManager\\thumbs"
	makeDir d all:true
	d
)

-- Guarda una copia reducida (480 px de ancho) de un bitmap como JPG y devuelve la ruta.
fn REASM_saveThumb src id =
(
	local w = 480
	local h = amax 1 (((w as float) * src.height / src.width) as integer)
	local b = bitmap w h
	copy src b
	local f = REASM_thumbDir() + "\\" + (REASM_safeName id) + ".jpg"
	b.filename = f
	save b
	close b
	f
)

-- Miniatura del visor activo.
fn REASM_thumbViewport id =
(
	completeRedraw()
	local dib = gw.getViewportDib()
	REASM_saveThumb dib id
)

-- Miniatura a partir de una imagen renderizada (png/jpg/tif).
fn REASM_thumbFromFile id file =
(
	if not (doesFileExist file) then ""
	else
	(
		local src = openBitmap file
		local f = REASM_saveThumb src id
		close src
		f
	)
)
