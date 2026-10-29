-- REA Scene Manager - nucleo
-- Funciones que la interfaz web llama para leer y modificar la escena de 3ds Max.
-- La interfaz guarda sus datos (setups) como un texto JSON dentro del .max (appData del nodo raiz).

global REASM_VERSION = "0.6.0"
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

-- ==================================================================== propiedades de Corona (se detectan por nombre)

-- Devuelve el nombre de la primera propiedad de obj que coincide con alguno de los patrones ("" si ninguna).
fn REASM_findProp obj patterns =
(
	local names = try (getPropNames obj) catch (#())
	local res = ""
	for pat in patterns while res == "" do
		for n in names while res == "" do
			if matchPattern (n as string) pattern:pat do res = n as string
	res
)

fn REASM_coronaProp key =
(
	local r = renderers.current
	case key of
	(
		"passLimit": "progressive_passLimit"
		"noiseLimit": "adaptivity_targetError"
		"timeLimit": "progressive_timeLimit"
		"denoiseType": REASM_findProp r #("denoise_filterType", "*denois*filter*", "*denois*type*", "*denois*mode*")
		"denoiseAmount": REASM_findProp r #("denoise_blendAmount", "*denois*blend*", "*denois*amount*")
		"overrideOn": REASM_findProp r #("mtlOverride_enabled", "*override*enable*", "*override*on")
		"overrideMtl": REASM_findProp r #("mtlOverride", "*mtl*override", "*override*mtl", "*override*material")
		default: ""
	)
)

fn REASM_getCorona key =
(
	local r = renderers.current
	local pn = REASM_coronaProp key
	if pn == "" or not (isProperty r (pn as name)) then undefined else (getProperty r (pn as name))
)

-- Asigna un valor (texto) respetando el tipo actual de la propiedad.
fn REASM_setCorona key txt =
(
	local r = renderers.current
	local pn = REASM_coronaProp key
	if pn != "" and isProperty r (pn as name) do
	(
		local cur = getProperty r (pn as name)
		local v = case of
		(
			(isKindOf cur Integer): (txt as integer)
			(isKindOf cur BooleanClass): (txt == "1" or txt == "true")
			default: (txt as float)
		)
		setProperty r (pn as name) v
	)
)

-- Material clay: usa "REA_Clay" si ya existe en la escena; si no, crea uno (CoronaPhysicalMtl > CoronaMtl > Standard).
fn REASM_clayMtl =
(
	local cur = REASM_getCorona "overrideMtl"
	local found = for m in sceneMaterials where m.name == "REA_Clay" collect m
	if cur != undefined and (try (cur.name == "REA_Clay") catch (false)) then cur
	else if found.count > 0 then found[1]
	else
	(
		local m = undefined
		local cls = try (execute "CoronaPhysicalMtl") catch (undefined)
		if cls != undefined then
		(
			m = cls()
			try (m.baseColor = color 200 200 200) catch ()
			try (m.baseRoughness = 0.55) catch ()
		)
		else
		(
			cls = try (execute "CoronaMtl") catch (undefined)
			if cls != undefined then
			(
				m = cls()
				try (m.colorDiffuse = color 200 200 200) catch ()
			)
			else m = StandardMaterial diffuse:(color 200 200 200)
		)
		m.name = "REA_Clay"
		m
	)
)

fn REASM_clayOn =
(
	local v = REASM_getCorona "overrideOn"
	v == true
)

fn REASM_setClay val =
(
	local r = renderers.current
	local pOn = REASM_coronaProp "overrideOn"
	if pOn == "" do throw "No se encontro el Material Override de Corona en esta version."
	local wasOpen = renderSceneDialog.isOpen()
	if wasOpen do renderSceneDialog.close()
	if val do
	(
		local pM = REASM_coronaProp "overrideMtl"
		if pM != "" do setProperty r (pM as name) (REASM_clayMtl())
	)
	setProperty r (pOn as name) val
	if wasOpen do renderSceneDialog.open()
	val
)

-- Proyeccion de una CoronaCam (perspectiva, esferica 360, VR...). "" si la camara no la tiene.
fn REASM_camProjProp c = (REASM_findProp c #("projection", "*projection*", "*proj*type*"))

fn REASM_camProj c =
(
	local pn = REASM_camProjProp c
	if pn == "" then undefined else (getProperty c (pn as name))
)

fn REASM_setCamProj c val =
(
	local pn = REASM_camProjProp c
	if pn != "" do setProperty c (pn as name) val
	pn != ""
)

-- ==================================================================== consultas

fn REASM_getScene =
(
	local cams = for c in REASM_cameras() collect \
		REASM_obj #(#("name", c.name), #("locked", REASM_isLocked c), #("cls", (classOf c) as string), #("proj", REASM_camProj c))
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
			#("timeLimit", (if isProperty r #progressive_timeLimit then r.progressive_timeLimit else undefined)), \
			#("denoiseType", REASM_getCorona "denoiseType"), \
			#("denoiseAmount", REASM_getCorona "denoiseAmount"), \
			#("hasDenoise", (REASM_coronaProp "denoiseType") != ""), \
			#("hasOverride", (REASM_coronaProp "overrideOn") != ""), \
			#("clay", REASM_clayOn()))
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
				if REASM_isCorona() and f[3] != "" do REASM_setCorona f[2] f[3]
			)
			"clay":
			(
				if REASM_isCorona() do try (REASM_setClay (f[2] == "1")) catch (append missing "Clay (Material Override)")
			)
			"proj":
			(
				local c = REASM_findCamera f[2]
				if c != undefined and f[3] != "" do REASM_setCamProj c (f[3] as integer)
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
			(if isProperty r #progressive_timeLimit then r.progressive_timeLimit else undefined), \
			(REASM_getCorona "denoiseType"), (REASM_getCorona "denoiseAmount"), (REASM_clayOn())) else undefined))
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
			if b[13][4] != undefined do try (REASM_setCorona "denoiseType" (b[13][4] as string)) catch ()
			if b[13][5] != undefined do try (REASM_setCorona "denoiseAmount" (b[13][5] as string)) catch ()
			try (REASM_setClay b[13][6]) catch ()
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

fn REASM_camCreate nm proj =
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
	if proj != "" do REASM_setCamProj cam (proj as integer)
	cam.name = if nm == "" then (uniqueName (if proj != "" then "REA_Cam360_" else "REA_Cam_")) else nm
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

-- ==================================================================== presets de iluminacion
-- Una carpeta con archivos .max (rigs de luces) y/o .rps (presets de render).
-- Un .max se fusiona en la escena dentro de la capa "REA_Luz_<nombre>".

fn REASM_presetThumb folder nm =
(
	local res = ""
	for ext in #(".jpg", ".jpeg", ".png") while res == "" do
		if doesFileExist (folder + "\\" + nm + ext) do res = folder + "\\" + nm + ext
	res
)

fn REASM_listPresets folder =
(
	if folder == "" or not (doesFileExist folder) then #()
	else
	(
		local res = #()
		for ext in #("max", "rps") do
			for f in (getFiles (folder + "\\*." + ext)) do
			(
				local nm = getFilenameFile f
				append res (REASM_obj #(#("name", nm), #("file", f), #("type", ext), #("thumb", REASM_presetThumb folder nm)))
			)
		res
	)
)

fn REASM_presetLayers = (for i = 0 to (LayerManager.count - 1) where matchPattern (LayerManager.getLayer i).name pattern:"REA_Luz_*" collect (LayerManager.getLayer i).name)

fn REASM_removePresetLayers =
(
	for nm in REASM_presetLayers() do
	(
		local l = LayerManager.getLayerFromName nm
		if l != undefined do
		(
			local nds = #()
			l.nodes &nds
			if nds.count > 0 do delete nds
			LayerManager.deleteLayerByName nm
		)
	)
	true
)

fn REASM_loadPreset file replaceOld =
(
	if not (doesFileExist file) do throw ("No existe el archivo: " + file)
	local ext = toLower (getFilenameType file)
	if ext == ".rps" then
	(
		if renderSceneDialog.isOpen() do renderSceneDialog.close()
		renderPresets.LoadAll 0 file
		REASM_obj #(#("type", "rps"), #("layer", ""), #("count", 0))
	)
	else
	(
		if replaceOld do REASM_removePresetLayers()
		local layerName = "REA_Luz_" + (getFilenameFile file)
		clearSelection()
		mergeMAXFile file #select #mergeDups #renameMtlDups #noRedraw quiet:true
		local merged = selection as array
		local l = LayerManager.getLayerFromName layerName
		if l == undefined do l = LayerManager.newLayerFromName layerName
		for o in merged do l.addNode o
		l.on = true
		clearSelection()
		redrawViews()
		REASM_obj #(#("type", "max"), #("layer", layerName), #("count", merged.count))
	)
)
