-- REA Scene Manager - interfaz
-- Ventana flotante con 4 secciones: Estados, Render por lotes, Camaras y Render elements.

global REASM_floater
global REASM_rlStates
global REASM_rlBatch
global REASM_rlCams
global REASM_rlElems
global REASM_FORMATS = #(".exr", ".png", ".jpg", ".tif")

fn REASM_msg txt = (messageBox txt title:"REA Scene Manager")

-- ==================================================================== ESTADOS

rollout REASM_rlStates "Estados de escena"
(
	listbox lbStates "" height:10
	edittext etName "Nombre:"
	button btnNew "Guardar escena actual como estado" width:220 height:26
	button btnApply "Aplicar" across:3 width:70
	button btnUpdate "Actualizar" width:70
	button btnDelete "Borrar" width:70
	button btnRename "Renombrar" across:4 width:62
	button btnDup "Duplicar" width:52
	button btnUp "Subir" width:44
	button btnDown "Bajar" width:44
	label lblCam "" align:#left
	label lblRes "" align:#left
	label lblCorona "" align:#left

	fn numStr v = (if v == undefined then "-" else (v as string))

	fn showInfo =
	(
		local i = lbStates.selection
		if i == 0 then
		(
			lblCam.text = ""
			lblRes.text = ""
			lblCorona.text = ""
		)
		else
		(
			local st = REASM.states[i]
			lblCam.text = "Camara: " + (if st.camName == "" then "(ninguna)" else st.camName)
			lblRes.text = "Resolucion: " + (st.resW as string) + " x " + (st.resH as string) + \
				"   Capas: " + (st.layers.count as string)
			lblCorona.text = "Corona: pases " + (numStr st.passLimit) + " / ruido " + \
				(numStr st.noiseLimit) + " / tiempo " + (numStr st.timeLimit)
		)
	)

	fn refresh =
	(
		local sel = lbStates.selection
		lbStates.items = for s in REASM.states collect s.stName
		if sel > lbStates.items.count do sel = lbStates.items.count
		lbStates.selection = sel
		showInfo()
	)

	fn selectAndRefresh i =
	(
		REASM_refreshUI()
		lbStates.selection = i
		if i > 0 do etName.text = REASM.states[i].stName
		showInfo()
	)

	fn current = (lbStates.selection)

	on lbStates selected i do
	(
		etName.text = REASM.states[i].stName
		showInfo()
	)

	on lbStates doubleClicked i do REASM.applyState REASM.states[i]

	on btnNew pressed do
	(
		local i = REASM.addState etName.text
		selectAndRefresh i
	)

	on btnApply pressed do
	(
		local i = current()
		if i == 0 then REASM_msg "Selecciona un estado."
		else if (REASM.applyState REASM.states[i]) == undefined and REASM.states[i].camName != "" do
			REASM_msg ("No se encontro la camara '" + REASM.states[i].camName + "'.")
	)

	on btnUpdate pressed do
	(
		local i = current()
		if i == 0 then REASM_msg "Selecciona un estado."
		else if queryBox ("Sobrescribir '" + REASM.states[i].stName + "' con la escena actual?") title:"REA Scene Manager" do
		(
			REASM.updateState i
			selectAndRefresh i
		)
	)

	on btnDelete pressed do
	(
		local i = current()
		if i == 0 then REASM_msg "Selecciona un estado."
		else if queryBox ("Borrar el estado '" + REASM.states[i].stName + "'?") title:"REA Scene Manager" do
		(
			REASM.deleteState i
			selectAndRefresh (amin i REASM.states.count)
		)
	)

	on btnRename pressed do
	(
		local i = current()
		if i == 0 then REASM_msg "Selecciona un estado."
		else
		(
			REASM.renameState i etName.text
			selectAndRefresh i
		)
	)

	on btnDup pressed do
	(
		local i = current()
		if i == 0 then REASM_msg "Selecciona un estado."
		else selectAndRefresh (REASM.duplicateState i)
	)

	on btnUp pressed do
	(
		local i = current()
		if i > 0 do selectAndRefresh (REASM.moveState i -1)
	)

	on btnDown pressed do
	(
		local i = current()
		if i > 0 do selectAndRefresh (REASM.moveState i 1)
	)
)

-- ==================================================================== RENDER POR LOTES

rollout REASM_rlBatch "Render por lotes"
(
	multiListBox mlStates "" height:8
	button btnAll "Todos" across:2 width:105
	button btnNone "Ninguno" width:105
	edittext etFolder "Carpeta:" across:2 width:190 align:#left
	button btnBrowse "..." width:24 align:#right
	dropdownlist ddFmt "Formato:" items:REASM_FORMATS
	checkbox chkRestore "Restaurar la escena al terminar" checked:true
	button btnRender "Renderizar seleccionados" width:220 height:30
	label lblHint "Manten ESC pulsado para detener el lote." align:#left

	fn refresh =
	(
		local sel = mlStates.selection
		mlStates.items = for s in REASM.states collect s.stName
		local keep = #{}
		for i in sel where i <= mlStates.items.count do keep[i] = true
		mlStates.selection = keep
		etFolder.text = REASM.getFolder()
	)

	on btnAll pressed do
	(
		local all = #{}
		for i = 1 to mlStates.items.count do all[i] = true
		mlStates.selection = all
	)

	on btnNone pressed do mlStates.selection = #{}

	on btnBrowse pressed do
	(
		local f = getSavePath caption:"Carpeta de render" initialDir:etFolder.text
		if f != undefined do
		(
			etFolder.text = f
			REASM.setFolder f
		)
	)

	on etFolder entered txt do REASM.setFolder txt

	on btnRender pressed do
	(
		local idxs = mlStates.selection as array
		if idxs.count == 0 then REASM_msg "Selecciona al menos un estado."
		else if etFolder.text == "" then REASM_msg "Indica una carpeta de salida."
		else
		(
			REASM.setFolder etFolder.text
			local n = REASM.renderBatch idxs etFolder.text REASM_FORMATS[ddFmt.selection] chkRestore.checked
			REASM_refreshUI()
			REASM_msg ("Render por lotes terminado: " + (n as string) + " de " + (idxs.count as string) + " estados.\n" + \
				"Los estados sin camara valida se omiten (ver MAXScript Listener).")
		)
	)
)

-- ==================================================================== CAMARAS

rollout REASM_rlCams "Camaras"
(
	local camList = #()

	listbox lbCams "" height:8
	edittext etCamName "Nombre:"
	button btnView "Ver" across:3 width:70
	button btnSelect "Seleccionar" width:70
	button btnLock "Bloquear" width:70
	button btnCreate "Crear desde vista" across:2 width:110
	button btnRename "Renombrar" width:100
	button btnDelete "Borrar" across:2 width:110
	button btnRefresh "Refrescar" width:100
	label lblHint "[L] = camara bloqueada" align:#left

	fn refresh =
	(
		local sel = lbCams.selection
		camList = REASM.listCameras()
		lbCams.items = for c in camList collect ((if REASM.isCamLocked c then "[L] " else "") + c.name)
		if sel > camList.count do sel = camList.count
		lbCams.selection = sel
	)

	fn currentCam =
	(
		local i = lbCams.selection
		if i > 0 and isValidNode camList[i] then camList[i] else undefined
	)

	on lbCams selected i do
	(
		if isValidNode camList[i] do etCamName.text = camList[i].name
	)

	on lbCams doubleClicked i do
	(
		if isValidNode camList[i] do viewport.setCamera camList[i]
	)

	on btnView pressed do
	(
		local c = currentCam()
		if c == undefined then REASM_msg "Selecciona una camara." else viewport.setCamera c
	)

	on btnSelect pressed do
	(
		local c = currentCam()
		if c == undefined then REASM_msg "Selecciona una camara." else select c
	)

	on btnLock pressed do
	(
		local c = currentCam()
		if c == undefined then REASM_msg "Selecciona una camara."
		else
		(
			REASM.toggleCamLock c
			refresh()
		)
	)

	on btnCreate pressed do
	(
		local c = REASM.createCameraFromView etCamName.text
		refresh()
		local i = findItem camList c
		lbCams.selection = i
		etCamName.text = c.name
	)

	on btnRename pressed do
	(
		local c = currentCam()
		if c == undefined then REASM_msg "Selecciona una camara."
		else if etCamName.text != "" do
		(
			c.name = etCamName.text
			refresh()
		)
	)

	on btnDelete pressed do
	(
		local c = currentCam()
		if c == undefined then REASM_msg "Selecciona una camara."
		else if queryBox ("Borrar la camara '" + c.name + "'?") title:"REA Scene Manager" do
		(
			REASM.deleteCamera c
			refresh()
		)
	)

	on btnRefresh pressed do refresh()
)

-- ==================================================================== RENDER ELEMENTS Y SALIDA

rollout REASM_rlElems "Render elements y salida"
(
	local elems = #()
	local classes = #()

	listbox lbElems "" height:8
	button btnToggle "Activar / Desactivar" across:2 width:120
	button btnRemove "Borrar" width:90
	dropdownlist ddClass "Anadir render element:"
	button btnAdd "Anadir" width:220
	group "Ruta de salida"
	(
		edittext etOutDir "Carpeta:" across:2 width:190 align:#left
		button btnOutBrowse "..." width:24 align:#right
		edittext etOutName "Nombre:"
		dropdownlist ddOutFmt "Formato:" items:REASM_FORMATS
		button btnOutApply "Aplicar a imagen y render elements" width:220
	)
	button btnRefresh "Refrescar" width:220

	fn refresh =
	(
		local sel = lbElems.selection
		elems = REASM.getElements()
		lbElems.items = for e in elems collect ((if e.enabled then "[x] " else "[  ] ") + e.elementName)
		if sel > elems.count do sel = elems.count
		lbElems.selection = sel
		if etOutDir.text == "" do etOutDir.text = REASM.getFolder()
		if etOutName.text == "" do etOutName.text = (if maxFileName != "" then (getFilenameFile maxFileName) else "render")
	)

	fn currentElem =
	(
		local i = lbElems.selection
		if i > 0 then elems[i] else undefined
	)

	on REASM_rlElems open do
	(
		classes = REASM.elementClasses()
		ddClass.items = for c in classes collect (c as string)
	)

	on lbElems doubleClicked i do
	(
		REASM.toggleElement elems[i]
		refresh()
	)

	on btnToggle pressed do
	(
		local e = currentElem()
		if e == undefined then REASM_msg "Selecciona un render element."
		else
		(
			REASM.toggleElement e
			refresh()
		)
	)

	on btnRemove pressed do
	(
		local e = currentElem()
		if e == undefined then REASM_msg "Selecciona un render element."
		else if queryBox ("Borrar '" + e.elementName + "'?") title:"REA Scene Manager" do
		(
			REASM.removeElement e
			refresh()
		)
	)

	on btnAdd pressed do
	(
		if ddClass.selection > 0 do
		(
			REASM.addElement classes[ddClass.selection]
			refresh()
			lbElems.selection = elems.count
		)
	)

	on btnOutBrowse pressed do
	(
		local f = getSavePath caption:"Carpeta de salida" initialDir:etOutDir.text
		if f != undefined do etOutDir.text = f
	)

	on btnOutApply pressed do
	(
		if etOutDir.text == "" or etOutName.text == "" then REASM_msg "Indica carpeta y nombre."
		else
		(
			REASM.setOutput etOutDir.text etOutName.text REASM_FORMATS[ddOutFmt.selection]
			REASM_msg ("Salida: " + rendOutputFilename)
		)
	)

	on btnRefresh pressed do refresh()
)

-- ==================================================================== VENTANA

fn REASM_refreshUI =
(
	if REASM_floater != undefined and REASM_floater.open do
	(
		REASM_rlStates.refresh()
		REASM_rlBatch.refresh()
		REASM_rlCams.refresh()
		REASM_rlElems.refresh()
	)
)

-- Abre la ventana; si ya esta abierta, la cierra.
fn REASM_open =
(
	if REASM_floater != undefined and REASM_floater.open then
		closeRolloutFloater REASM_floater
	else
	(
		REASM.loadStates()
		REASM_floater = newRolloutFloater "REA Scene Manager" 270 800
		addRollout REASM_rlStates REASM_floater
		addRollout REASM_rlBatch REASM_floater
		addRollout REASM_rlCams REASM_floater rolledUp:true
		addRollout REASM_rlElems REASM_floater rolledUp:true
		REASM_refreshUI()
	)
)
