-- REA Scene Manager - nucleo (datos y logica)
-- Guarda "estados" de escena dentro del propio archivo .max (appData del nodo raiz).
-- Un estado recuerda: camara, capas visibles, resolucion, render elements activos
-- y limites de Corona (pases, ruido, tiempo).

global REASM
global REASM_refreshUI
global REASM_APPDATA_STATES = 7301
global REASM_APPDATA_FOLDER = 7302

struct REASM_State
(
	stName = "",
	camName = "",
	resW = 1920,
	resH = 1080,
	layers = #(),    -- #(#(nombreCapa, encendida), ...)
	elements = #(),  -- #(#(nombreElemento, activo), ...)
	passLimit = undefined,
	noiseLimit = undefined,
	timeLimit = undefined
)

struct REASM_Core
(
	states = #(),

	-- ---------------------------------------------------------------- utilidades

	fn enc s =
	(
		s = s as string
		s = substituteString s "%" "%25"
		s = substituteString s "|" "%7C"
		s = substituteString s ";" "%3B"
		s = substituteString s "=" "%3D"
		s = substituteString s "\n" "%0A"
		s = substituteString s "\r" "%0D"
		s
	),

	fn dec s =
	(
		s = substituteString s "%0D" "\r"
		s = substituteString s "%0A" "\n"
		s = substituteString s "%3D" "="
		s = substituteString s "%3B" ";"
		s = substituteString s "%7C" "|"
		s = substituteString s "%25" "%"
		s
	),

	fn safeName s =
	(
		local bad = "\\/:*?\"<>|"
		local out = ""
		for i = 1 to s.count do
			out += (if (findString bad s[i]) != undefined then "_" else s[i])
		if out == "" then "sin_nombre" else out
	),

	fn numToText v = (if v == undefined then "" else (v as string)),

	fn textToNum v asInt =
	(
		if v == "" then undefined
		else if asInt then (v as integer)
		else (v as float)
	),

	fn isCorona =
	(
		matchPattern ((classOf renderers.current) as string) pattern:"*Corona*"
	),

	fn findCamera nm =
	(
		if nm == "" then undefined
		else
		(
			local c = getNodeByName nm exact:true
			if c != undefined and (superClassOf c) == camera then c else undefined
		)
	),

	-- ---------------------------------------------------------------- guardar / cargar

	fn pairsToText arr =
	(
		local txt = ""
		for i = 1 to arr.count do
		(
			if i > 1 do txt += ";"
			txt += (enc arr[i][1]) + "|" + (if arr[i][2] then "1" else "0")
		)
		txt
	),

	fn textToPairs txt =
	(
		local res = #()
		for item in (filterString txt ";") do
		(
			local bits = filterString item "|"
			if bits.count == 2 do append res #((dec bits[1]), (bits[2] == "1"))
		)
		res
	),

	fn stateToText st =
	(
		local ss = stringStream ""
		format "name=%\n" (enc st.stName) to:ss
		format "camera=%\n" (enc st.camName) to:ss
		format "width=%\n" st.resW to:ss
		format "height=%\n" st.resH to:ss
		format "layers=%\n" (pairsToText st.layers) to:ss
		format "elements=%\n" (pairsToText st.elements) to:ss
		format "passLimit=%\n" (numToText st.passLimit) to:ss
		format "noiseLimit=%\n" (numToText st.noiseLimit) to:ss
		format "timeLimit=%\n" (numToText st.timeLimit) to:ss
		ss as string
	),

	fn saveStates =
	(
		local ss = stringStream ""
		format "REASM1\n" to:ss
		for st in states do format "%@@\n" (stateToText st) to:ss
		setAppData rootNode REASM_APPDATA_STATES (ss as string)
		setSaveRequired true
		ok
	),

	fn loadStates =
	(
		states = #()
		local txt = getAppData rootNode REASM_APPDATA_STATES
		if txt != undefined do
		(
			local cur = undefined
			for ln in (filterString txt "\n") do
			(
				if ln == "@@" then
				(
					if cur != undefined do append states cur
					cur = undefined
				)
				else if ln != "REASM1" do
				(
					local idx = findString ln "="
					if idx != undefined do
					(
						if cur == undefined do cur = REASM_State()
						local k = substring ln 1 (idx - 1)
						local v = substring ln (idx + 1) -1
						case k of
						(
							"name": cur.stName = (dec v)
							"camera": cur.camName = (dec v)
							"width": cur.resW = (v as integer)
							"height": cur.resH = (v as integer)
							"layers": cur.layers = (textToPairs v)
							"elements": cur.elements = (textToPairs v)
							"passLimit": cur.passLimit = (textToNum v true)
							"noiseLimit": cur.noiseLimit = (textToNum v false)
							"timeLimit": cur.timeLimit = (textToNum v true)
						)
					)
				)
			)
		)
		ok
	),

	fn getFolder =
	(
		local f = getAppData rootNode REASM_APPDATA_FOLDER
		if f != undefined and f != "" then f
		else if maxFilePath != "" then (maxFilePath + "render")
		else (getDir #renderoutput)
	),

	fn setFolder f = (setAppData rootNode REASM_APPDATA_FOLDER f),

	-- ---------------------------------------------------------------- estados

	fn captureCurrent nm =
	(
		local st = REASM_State stName:nm
		local cam = getActiveCamera()
		if cam != undefined do st.camName = cam.name
		st.resW = renderWidth
		st.resH = renderHeight
		st.layers = for i = 0 to (LayerManager.count - 1) collect
			#((LayerManager.getLayer i).name, (LayerManager.getLayer i).on)
		local re = maxOps.GetCurRenderElementMgr()
		st.elements = for i = 0 to (re.NumRenderElements() - 1) collect
			#((re.GetRenderElement i).elementName, (re.GetRenderElement i).enabled)
		if isCorona() do
		(
			local r = renderers.current
			if isProperty r #progressive_passLimit do st.passLimit = r.progressive_passLimit
			if isProperty r #adaptivity_targetError do st.noiseLimit = r.adaptivity_targetError
			if isProperty r #progressive_timeLimit do st.timeLimit = r.progressive_timeLimit
		)
		st
	),

	-- Aplica un estado a la escena. Devuelve la camara activada (o undefined).
	fn applyState st =
	(
		for p in st.layers do
		(
			local l = LayerManager.getLayerFromName p[1]
			if l != undefined do l.on = p[2]
		)

		-- Render Setup debe estar cerrado para que los cambios se apliquen
		local wasOpen = renderSceneDialog.isOpen()
		if wasOpen do renderSceneDialog.close()
		renderWidth = st.resW
		renderHeight = st.resH
		local re = maxOps.GetCurRenderElementMgr()
		for i = 0 to (re.NumRenderElements() - 1) do
		(
			local e = re.GetRenderElement i
			for p in st.elements where p[1] == e.elementName do e.enabled = p[2]
		)
		if isCorona() do
		(
			local r = renderers.current
			if st.passLimit != undefined and isProperty r #progressive_passLimit do r.progressive_passLimit = st.passLimit
			if st.noiseLimit != undefined and isProperty r #adaptivity_targetError do r.adaptivity_targetError = st.noiseLimit
			if st.timeLimit != undefined and isProperty r #progressive_timeLimit do r.progressive_timeLimit = st.timeLimit
		)
		if wasOpen do renderSceneDialog.open()

		local cam = findCamera st.camName
		if cam != undefined do viewport.setCamera cam
		redrawViews()
		cam
	),

	fn findState nm =
	(
		local r = 0
		for i = 1 to states.count where states[i].stName == nm do r = i
		r
	),

	fn uniqueStateName nm =
	(
		if nm == "" do nm = "Estado"
		local res = nm
		local n = 2
		while (findState res) > 0 do
		(
			res = nm + " " + (n as string)
			n += 1
		)
		res
	),

	fn addState nm =
	(
		append states (captureCurrent (uniqueStateName nm))
		saveStates()
		states.count
	),

	fn updateState i =
	(
		states[i] = captureCurrent states[i].stName
		saveStates()
	),

	fn renameState i nm =
	(
		if nm != "" and nm != states[i].stName do
		(
			states[i].stName = uniqueStateName nm
			saveStates()
		)
	),

	fn duplicateState i =
	(
		local s = states[i]
		local d = REASM_State stName:(uniqueStateName s.stName) camName:s.camName resW:s.resW resH:s.resH \
			layers:(deepCopy s.layers) elements:(deepCopy s.elements) \
			passLimit:s.passLimit noiseLimit:s.noiseLimit timeLimit:s.timeLimit
		insertItem d states (i + 1)
		saveStates()
		i + 1
	),

	fn deleteState i =
	(
		deleteItem states i
		saveStates()
	),

	fn moveState i delta =
	(
		local j = i + delta
		if j >= 1 and j <= states.count then
		(
			swap states[i] states[j]
			saveStates()
			j
		)
		else i
	),

	-- ---------------------------------------------------------------- salida y render

	fn setElementFilenames folder prefix ext =
	(
		local re = maxOps.GetCurRenderElementMgr()
		re.SetElementsActive true
		for i = 0 to (re.NumRenderElements() - 1) do
		(
			local e = re.GetRenderElement i
			re.SetRenderElementFilename i (folder + "\\" + prefix + "_" + (safeName e.elementName) + ext)
		)
	),

	fn setOutput folder nm ext =
	(
		makeDir folder all:true
		local wasOpen = renderSceneDialog.isOpen()
		if wasOpen do renderSceneDialog.close()
		local base = safeName nm
		rendOutputFilename = folder + "\\" + base + ext
		rendSaveFile = true
		setElementFilenames folder base ext
		if wasOpen do renderSceneDialog.open()
	),

	-- Renderiza los estados indicados, uno tras otro.
	-- Cada estado se guarda en <carpeta>\<estado>\<estado>.<ext> (y sus render elements al lado).
	-- Devuelve cuantos se renderizaron. Mantener ESC pulsado entre renders detiene el lote.
	fn renderBatch idxs folder ext restore =
	(
		local backup = if restore then (captureCurrent "__backup__") else undefined
		local re = maxOps.GetCurRenderElementMgr()
		local oldNames = for i = 0 to (re.NumRenderElements() - 1) collect (re.GetRenderElementFilename i)
		local oldOut = rendOutputFilename
		local oldSave = rendSaveFile
		local oldTime = rendTimeType
		local done = 0
		for i in idxs while not keyboard.escPressed do
		(
			local st = states[i]
			local cam = applyState st
			if cam == undefined then
				format "REA Scene Manager: el estado '%' no tiene una camara valida, se omite.\n" st.stName
			else
			(
				local nm = safeName st.stName
				local dir = folder + "\\" + nm
				makeDir dir all:true
				if renderSceneDialog.isOpen() do renderSceneDialog.close()
				rendTimeType = 1
				rendOutputFilename = dir + "\\" + nm + ext
				rendSaveFile = true
				setElementFilenames dir nm ext
				max quick render
				done += 1
			)
		)
		rendOutputFilename = oldOut
		rendSaveFile = oldSave
		rendTimeType = oldTime
		for i = 1 to oldNames.count where i <= re.NumRenderElements() do
			re.SetRenderElementFilename (i - 1) oldNames[i]
		if backup != undefined do applyState backup
		done
	),

	-- ---------------------------------------------------------------- camaras

	fn listCameras = (for c in cameras where (superClassOf c) == camera collect c),

	fn isCamLocked c = (not ((getTransformLockFlags c).isEmpty)),

	fn toggleCamLock c =
	(
		if isCamLocked c then setTransformLockFlags c #none else setTransformLockFlags c #all
	),

	fn createCameraFromView nm =
	(
		local tm = inverse (getViewTM())
		local fovv = viewport.GetFOV()
		local cam = undefined
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
		cam.transform = tm
		cam.name = if nm == "" then (uniqueName "REA_Cam_") else nm
		viewport.setCamera cam
		cam
	),

	fn deleteCamera c =
	(
		try (if c.target != undefined do delete c.target) catch ()
		delete c
	),

	-- ---------------------------------------------------------------- render elements

	fn getElements =
	(
		local re = maxOps.GetCurRenderElementMgr()
		for i = 0 to (re.NumRenderElements() - 1) collect (re.GetRenderElement i)
	),

	-- Clases de render elements disponibles; si hay de Corona (empiezan por "C"), solo esas.
	fn elementClasses =
	(
		local all = RenderElement.classes
		local cor = for c in all where matchPattern (c as string) pattern:"C*" collect c
		local src = if cor.count > 0 then cor else all
		local names = sort (for c in src collect (c as string))
		for n in names collect ((for c in src where (c as string) == n collect c)[1])
	),

	fn addElement cls =
	(
		local wasOpen = renderSceneDialog.isOpen()
		if wasOpen do renderSceneDialog.close()
		local e = cls()
		(maxOps.GetCurRenderElementMgr()).AddRenderElement e
		if wasOpen do renderSceneDialog.open()
		e
	),

	fn removeElement e =
	(
		local wasOpen = renderSceneDialog.isOpen()
		if wasOpen do renderSceneDialog.close()
		(maxOps.GetCurRenderElementMgr()).RemoveRenderElement e
		if wasOpen do renderSceneDialog.open()
	),

	fn toggleElement e = (e.enabled = not e.enabled)
)

REASM = REASM_Core()
REASM.loadStates()

callbacks.removeScripts id:#REASM
callbacks.addScript #filePostOpen "REASM.loadStates(); if REASM_refreshUI != undefined do REASM_refreshUI()" id:#REASM
callbacks.addScript #systemPostNew "REASM.loadStates(); if REASM_refreshUI != undefined do REASM_refreshUI()" id:#REASM
callbacks.addScript #systemPostReset "REASM.loadStates(); if REASM_refreshUI != undefined do REASM_refreshUI()" id:#REASM
