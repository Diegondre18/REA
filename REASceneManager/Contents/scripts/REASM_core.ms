-- REA Scene Manager - nucleo
-- Funciones que la interfaz web llama para leer y modificar la escena de 3ds Max.
-- La interfaz guarda sus datos (setups) como un texto JSON dentro del .max (appData del nodo raiz).

global REASM_VERSION = "0.9.0"
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
		"exposure": REASM_findProp r #("colorMap_simpleExposure", "*colorMap*exposure*", "*tonemap*exposure*")
		"highlight": REASM_findProp r #("colorMap_highlightCompression", "*highlight*compress*")
		"contrast": REASM_findProp r #("colorMap_contrast", "*colorMap*contrast*")
		"saturation": REASM_findProp r #("colorMap_saturation", "*colorMap*saturation*")
		"whiteBalance": REASM_findProp r #("colorMap_colorTemp", "*colorMap*temp*", "*whiteBalance*")
		"filmic": REASM_findProp r #("colorMap_filmicHighlights", "*filmic*highlight*")
		"lutEnable": REASM_findProp r #("colorMap_lut_enable", "*lut*enable*", "*lut*on")
		"lutFile": REASM_findProp r #("colorMap_lut_path", "*lut*path*", "*lut*file*")
		"lutOpacity": REASM_findProp r #("colorMap_lut_opacity", "*lut*opacity*", "*lut*amount*")
		"bloomEnable": REASM_findProp r #("bloomGlare_enabled", "*bloom*enable*", "*bloomGlare*on")
		"bloomIntensity": REASM_findProp r #("bloomGlare_bloomIntensity", "*bloom*intensity*")
		"glareIntensity": REASM_findProp r #("bloomGlare_glareIntensity", "*glare*intensity*")
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
			(isKindOf cur String): txt
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

-- ==================================================================== luces (LightMix por escena), region y sol

global REASM_TONE_KEYS = #("exposure", "highlight", "contrast", "saturation", "whiteBalance", "filmic", "lutEnable", "lutFile", "lutOpacity", "bloomEnable", "bloomIntensity", "glareIntensity")

fn REASM_hex2 v =
(
	local s = bit.intAsHex ((amax 0 (amin 255 (v as integer))) as integer)
	if s.count < 2 then ("0" + s) else s
)
fn REASM_colorHex c = ("#" + (REASM_hex2 c.r) + (REASM_hex2 c.g) + (REASM_hex2 c.b))
fn REASM_hexColor h =
(
	if h.count < 7 then undefined
	else color (bit.hexAsInt (substring h 2 2)) (bit.hexAsInt (substring h 4 2)) (bit.hexAsInt (substring h 6 2))
)

fn REASM_sceneLights = (for l in lights where (superClassOf l) == light collect l)
fn REASM_lightIntProp l = (if isProperty l #intensity then #intensity else if isProperty l #multiplier then #multiplier else undefined)
fn REASM_lightColProp l = (if isProperty l #color then #color else if isProperty l #rgb then #rgb else undefined)

fn REASM_lightInfo l =
(
	local ip = REASM_lightIntProp l
	local cp = REASM_lightColProp l
	local col = if cp != undefined then (try (getProperty l cp) catch (undefined)) else undefined
	REASM_obj #( \
		#("name", l.name), #("cls", (classOf l) as string), #("on", REASM_lightOn l), \
		#("intensity", (if ip != undefined then (try (getProperty l ip) catch (undefined)) else undefined)), \
		#("color", (if col != undefined and (classOf col) == Color then REASM_colorHex col else undefined)), \
		#("isSun", matchPattern ((classOf l) as string) pattern:"*Sun*"))
)

fn REASM_regionInfo =
(
	local t = try (getRenderType()) catch (#view)
	local r = try (viewport.getRegionRect viewport.activeViewport) catch (undefined)
	REASM_obj #(#("type", t as string), \
		#("x", (if r != undefined then r.x else 0)), #("y", (if r != undefined then r.y else 0)), \
		#("w", (if r != undefined then r.w else 0)), #("h", (if r != undefined then r.h else 0)))
)

-- Coloca un sol en la direccion (dx, dy, dz) (vector hacia el sol), manteniendo su distancia al objetivo.
fn REASM_placeSun s dx dy dz =
(
	local d = normalize [dx, dy, dz]
	local tgt = try (s.target) catch (undefined)
	if tgt != undefined and isValidNode tgt then
	(
		local dist = distance s.pos tgt.pos
		if dist < 1 do dist = 10000
		s.pos = tgt.pos + d * dist
	)
	else
	(
		local dist = length s.pos
		if dist < 1 do dist = 10000
		s.pos = d * dist
		s.dir = d
	)
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
		#("lights", (for l in REASM_sceneLights() collect REASM_lightInfo l)), \
		#("region", REASM_regionInfo()), \
		#("tone", (if REASM_isCorona() then (REASM_obj (for k in REASM_TONE_KEYS collect #(k, REASM_getCorona k))) else (REASM_obj #()))), \
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
			"light":
			(
				local l = getNodeByName f[2] exact:true
				if l == undefined or (superClassOf l) != light then append missing ("Luz: " + f[2])
				else
				(
					REASM_setLightOn l (f[3] == "1")
					local ip = REASM_lightIntProp l
					if ip != undefined and f[4] != "" do try (setProperty l ip (f[4] as float)) catch ()
					local cp = REASM_lightColProp l
					local col = if f.count >= 5 then REASM_hexColor f[5] else undefined
					if cp != undefined and col != undefined do try (setProperty l cp col) catch ()
				)
			)
			"region":
			(
				if f[2] == "view" then try (setRenderType #view) catch ()
				else
				(
					try (setRenderType (f[2] as name)) catch ()
					try (viewport.setRegionRect viewport.activeViewport (box2 (f[3] as integer) (f[4] as integer) (f[5] as integer) (f[6] as integer))) catch ()
				)
			)
			"sunpos":
			(
				local s = getNodeByName f[2] exact:true
				if s == undefined then append missing ("Sol: " + f[2])
				else REASM_placeSun s (f[3] as float) (f[4] as float) (f[5] as float)
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

-- ==================================================================== LightMix de Corona
-- Los valores del LightMix interactivo viven en propiedades del renderer (colorMap_lightmix...).
-- Se copian al empezar el lote y se vuelven a poner antes de cada imagen y al terminar,
-- asi nada de lo que haga un setup (resolucion, elements, luces) borra la mezcla del usuario.

global REASM_lmSnap = undefined

fn REASM_lmProps =
(
	if not (REASM_isCorona()) then #()
	else for p in (getPropNames renderers.current) where matchPattern (p as string) pattern:"*lightmix*" collect p
)

fn REASM_lmGet =
(
	local r = renderers.current
	for p in REASM_lmProps() collect
	(
		local v = try (getProperty r p) catch (undefined)
		#(p, (try (copy v) catch (v)))
	)
)

fn REASM_lmSet snap =
(
	if snap != undefined do
	(
		local r = renderers.current
		for p in snap where p[2] != undefined do try (setProperty r p[1] p[2]) catch ()
	)
	true
)

fn REASM_hasLightMix =
(
	local re = maxOps.GetCurRenderElementMgr()
	local found = false
	for i = 0 to (re.NumRenderElements() - 1) while not found do
	(
		local e = re.GetRenderElement i
		if e.enabled and (matchPattern ((classOf e) as string) pattern:"*LightSelect*" or matchPattern ((classOf e) as string) pattern:"*LightMix*") do found = true
	)
	found
)

-- Guarda el resultado del LightMix (no el beauty) como <base>_LightMix<ext>. Devuelve la ruta o "".
fn REASM_saveLightMix dir base ext =
(
	local dest = dir + "\\" + base + "_LightMix" + ext
	-- 1) Max ya lo guardo como render element
	local found = getFiles (dir + "\\" + base + "_*LightMix*" + ext)
	if found.count > 0 do return found[1]
	-- 2) Corona guarda todas las capas de su VFB (incluida la LightMix) en una carpeta temporal
	local fp = try (CoronaRenderer.CoronaFp) catch (undefined)
	if fp == undefined do return ""
	local tmp = dir + "\\_rea_vfb\\"
	makeDir tmp all:true
	local ok = false
	try (fp.saveAllElements (tmp + base + ext); ok = true) catch ()
	if not ok do try (fp.saveAllElements (tmp + base + ext) true; ok = true) catch ()
	local res = ""
	if ok do
	(
		local cand = getFiles (tmp + "*LightMix*")
		if cand.count > 0 do
		(
			local outExt = getFilenameType cand[1]
			dest = dir + "\\" + base + "_LightMix" + outExt
			deleteFile dest
			if copyFile cand[1] dest do res = dest
		)
	)
	try ((dotNetClass "System.IO.Directory").Delete tmp true) catch ()
	res
)

-- Informacion para depurar: propiedades LightMix del renderer y funciones de CoronaFp.
-- Se imprime en el Listener y se copia al portapapeles.
fn REASM_coronaDiag =
(
	local ss = stringStream ""
	format "REA Scene Manager % / 3ds Max % / %\n" REASM_VERSION ((maxVersion())[1]) (renderers.current as string) to:ss
	format "\n-- Render elements\n" to:ss
	local re = maxOps.GetCurRenderElementMgr()
	for i = 0 to (re.NumRenderElements() - 1) do
	(
		local e = re.GetRenderElement i
		format "%  (%)  enabled:%\n" e.elementName (classOf e) e.enabled to:ss
	)
	if REASM_isCorona() do
	(
		format "\n-- Propiedades del renderer (lightmix / vfb / save)\n" to:ss
		for p in (getPropNames renderers.current) where (matchPattern (p as string) pattern:"*lightmix*" or matchPattern (p as string) pattern:"*vfb*" or matchPattern (p as string) pattern:"*save*") do
			format "% = %\n" p (try (getProperty renderers.current p) catch ("?")) to:ss
		format "\n-- CoronaRenderer.CoronaFp\n" to:ss
		try (showInterface CoronaRenderer.CoronaFp to:ss) catch (format "(no disponible)\n" to:ss)
	)
	local txt = ss as string
	format "%\n" txt
	try (setClipboardText txt) catch ()
	txt
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
			(REASM_getCorona "denoiseType"), (REASM_getCorona "denoiseAmount"), (REASM_clayOn())) else undefined), \
		(for l in REASM_sceneLights() collect #(l, (REASM_lightOn l), \
			(if (REASM_lightIntProp l) != undefined then getProperty l (REASM_lightIntProp l) else undefined), \
			(if (REASM_lightColProp l) != undefined then getProperty l (REASM_lightColProp l) else undefined), l.transform)), \
		(try (getRenderType()) catch (#view)), \
		(if REASM_isCorona() then (for k in REASM_TONE_KEYS collect #(k, REASM_getCorona k)) else #()))
	REASM_lmSnap = REASM_lmGet()
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
		if b.count >= 16 do
		(
			for p in b[14] where isValidNode p[1] do
			(
				REASM_setLightOn p[1] p[2]
				if p[3] != undefined do try (setProperty p[1] (REASM_lightIntProp p[1]) p[3]) catch ()
				if p[4] != undefined do try (setProperty p[1] (REASM_lightColProp p[1]) p[4]) catch ()
				try (p[1].transform = p[5]) catch ()
			)
			try (setRenderType b[15]) catch ()
			for p in b[16] where p[2] != undefined do try (REASM_setCorona p[1] (p[2] as string)) catch ()
		)
		if b[1] != undefined and isValidNode b[1] do viewport.setCamera b[1]
	)
	-- el LightMix se devuelve siempre, se restaure o no la escena
	REASM_lmSet REASM_lmSnap
	REASM_lmSnap = undefined
	if wasOpen do renderSceneDialog.open()
	REASM_batchBackup = undefined
	redrawViews()
	true
)

-- Renderiza la vista activa (la camara del setup ya aplicada) en <carpeta>\<subcarpeta>\<nombre>.<ext>.
-- lm = "1": ademas guarda el resultado del LightMix (si la escena tiene LightSelect).
fn REASM_render folder sub nm ext lm:"1" =
(
	local base = REASM_safeName nm
	local dir = folder + "\\" + (REASM_safeName sub)
	makeDir dir all:true
	if renderSceneDialog.isOpen() do renderSceneDialog.close()
	rendTimeType = 1
	rendOutputFilename = dir + "\\" + base + ext
	rendSaveFile = true
	REASM_setElementFilenames dir base ext
	REASM_lmSet REASM_lmSnap
	local t0 = timeStamp()
	max quick render
	local dur = timeStamp() - t0
	local aborted = keyboard.escPressed
	local lmFile = ""
	if lm == "1" and not aborted and REASM_isCorona() and REASM_hasLightMix() do
		lmFile = try (REASM_saveLightMix dir base ext) catch ("")
	REASM_obj #(#("file", rendOutputFilename), #("lightmix", lmFile), #("aborted", aborted), #("ms", dur))
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

-- Primer archivo de la carpeta con alguna de las extensiones ("" si no hay).
fn REASM_firstFile dir exts =
(
	local res = ""
	local base = if dir[dir.count] == "\\" then dir else (dir + "\\")
	for e in exts while res == "" do
	(
		local fs = getFiles (base + "*." + e)
		if fs.count > 0 do res = fs[1]
	)
	res
)

fn REASM_listPresets folder =
(
	if folder == "" or not (doesFileExist folder) then #()
	else
	(
		local res = #()
		-- cada subcarpeta con un .rps y/o un .hdr es un preset
		for d in (getDirectories (folder + "\\*")) do
		(
			local rps = REASM_firstFile d #("rps")
			local hdr = REASM_firstFile d #("hdr", "exr")
			if rps != "" or hdr != "" do
			(
				local nm = pathConfig.stripPathToLeaf (substring d 1 (d.count - 1))
				append res (REASM_obj #(#("name", nm), #("file", rps), #("hdr", hdr), #("type", "folder"), \
					#("thumb", REASM_firstFile d #("png", "jpg", "jpeg"))))
			)
		)
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

-- Pone un HDRI como mapa de entorno (Bitmap esferico) y lo devuelve.
fn REASM_setHdri hdr =
(
	local m = Bitmaptexture filename:hdr
	m.name = "REA_HDRI_" + (getFilenameFile hdr)
	try (m.coords.mappingType = 1) catch ()
	try (m.coords.mapping = 0) catch ()
	environmentMap = m
	useEnvironmentMap = true
	m
)

-- Preset en carpeta: aplica el .rps (si hay) y pone el .hdr de la carpeta como entorno (si se pide).
fn REASM_loadPresetFolder rps hdr useHdr =
(
	if rps != "" and doesFileExist rps do
	(
		if renderSceneDialog.isOpen() do renderSceneDialog.close()
		renderPresets.LoadAll 0 rps
	)
	if useHdr and hdr != "" and doesFileExist hdr do REASM_setHdri hdr
	REASM_obj #(#("type", "folder"), #("layer", ""), #("count", 0), #("env", (if environmentMap != undefined then environmentMap.name else "")))
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

-- ==================================================================== resultados

fn REASM_listFiles dir pattern =
(
	if not (doesFileExist dir) then #()
	else for f in (getFiles (dir + "\\" + pattern)) collect
		REASM_obj #(#("name", filenameFromPath f), #("file", f), #("size", getFileSize f), #("date", getFileModDate f))
)

fn REASM_openFile f = (shellLaunch f ""; true)
fn REASM_showInFolder f = (shellLaunch "explorer.exe" ("/select,\"" + f + "\""); true)
fn REASM_beep = (try ((dotNetClass "System.Media.SystemSounds").Asterisk.Play()) catch (); true)

-- ==================================================================== hoja de contactos (PDF)

-- Copia reducida (hasta maxW px de ancho) de un render como JPG, para el PDF.
fn REASM_exportJpg src id maxW =
(
	if not (doesFileExist src) then ""
	else
	(
		local b = openBitmap src
		local w = amin maxW b.width
		local h = amax 1 (((w as float) * b.height / b.width) as integer)
		local o = bitmap w h
		copy b o
		local f = REASM_thumbDir() + "\\pdf_" + (REASM_safeName id) + ".jpg"
		o.filename = f
		save o
		close o
		close b
		f
	)
)
