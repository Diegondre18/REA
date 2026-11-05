-- REA Node: lo ejecuta 3dsmaxbatch en un PC de la granja para renderizar UNA imagen.
--   3dsmaxbatch.exe REASM_node_render.ms -sceneFile <scene.max> -mxsString task:<tasks\t.txt>
-- El archivo de la imagen tiene: carpeta, subcarpeta, nombre, extension, lightmix (1/0) y
-- despues una operacion del setup por linea (las mismas que aplica el plugin).
-- Al terminar escribe <t>.txt.result con: ok|error, archivo, lightmix, ms, miniatura, mensaje.
(
	local dir = getFilenamePath (getSourceFileName())
	fileIn (dir + "REASM_core.ms")
	fileIn (dir + "REASM_farm.ms")

	local taskFile = try (maxOps.mxsCmdLineArgs[#task]) catch (undefined)
	local status = "error", outFile = "", lmFile = "", ms = 0, thumb = "", msg = ""
	try
	(
		if taskFile == undefined or not (doesFileExist taskFile) do throw ("No se encuentra la tarea: " + (taskFile as string))
		local lines = filterString ((REASM_readText taskFile) as string) "\r\n" splitEmptyTokens:false
		if lines.count < 5 do throw "Tarea incompleta"
		local folder = lines[1], sub = lines[2], base = REASM_safeName lines[3], ext = lines[4], lm = lines[5]
		local ops = for i = 6 to lines.count collect lines[i]
		local missing = REASM_applyOps ops
		local cam = undefined
		for op in ops do
		(
			local f = REASM_split op REASM_RS
			if f[1] == "cam" do cam = REASM_findCamera f[2]
		)
		if cam == undefined do (
			local m = ""
			for x in missing do m += x + "  "
			throw ("No existe la camara del setup. " + m)
		)
		local outDir = folder + "\\" + (REASM_safeName sub)
		makeDir outDir all:true
		outFile = outDir + "\\" + base + ext
		REASM_setElementFilenames outDir base ext
		local t0 = timeStamp()
		local reb = #()
		local bm = try (render camera:cam outputSize:[renderWidth, renderHeight] outputfile:outFile vfb:false renderElements:true renderElementBitmaps:&reb) \
			catch (render camera:cam outputSize:[renderWidth, renderHeight] outputfile:outFile vfb:false)
		ms = timeStamp() - t0
		-- render elements: render() no siempre los guarda solo
		local re = maxOps.GetCurRenderElementMgr()
		for i = 1 to reb.count where reb[i] != undefined and i <= re.NumRenderElements() do
		(
			local ef = re.GetRenderElementFilename (i - 1)
			if ef != "" and not (doesFileExist ef) do try (reb[i].filename = ef; save reb[i]) catch ()
		)
		if lm == "1" and REASM_isCorona() and REASM_hasLightMix() do lmFile = try (REASM_saveLightMix outDir base ext) catch ("")
		-- miniatura junto a la tarea, en el NAS, para que la vean todos los PCs
		if bm != undefined do try
		(
			local w = 480
			local h = amax 1 (((w as float) * bm.height / bm.width) as integer)
			local t = bitmap w h
			copy bm t
			thumb = (getFilenamePath taskFile) + (getFilenameFile taskFile) + ".jpg"
			t.filename = thumb
			save t
			close t
		) catch (thumb = "")
		status = if doesFileExist outFile then "ok" else "error"
		if status == "error" do msg = "El render termino pero no se guardo la imagen."
	)
	catch
	(
		msg = getCurrentException()
	)
	if taskFile != undefined do
		try (REASM_writeText (taskFile + ".result") (status + "\n" + outFile + "\n" + lmFile + "\n" + (ms as string) + "\n" + thumb + "\n" + (substituteString msg "\n" " "))) catch ()
)
