-- REA Scene Manager - arranque
-- 3ds Max carga este archivo al iniciar (ver PackageContents.xml).

(
	local dir = getFilenamePath (getSourceFileName())
	fileIn (dir + "REASM_core.ms")
	fileIn (dir + "REASM_window.ms")
)

macroScript REASceneManager
	category:"REA"
	internalCategory:"REA"
	buttonText:"REA Scenes"
	toolTip:"REA Scene Manager"
(
	-- Si el plugin no se cargo al arrancar 3ds Max, se intenta cargar ahora (y se ve el error si lo hay).
	if REASM_open == undefined do
	(
		local f = (systemTools.getEnvVariable "APPDATA") + "\\Autodesk\\ApplicationPlugins\\REASceneManager\\Contents\\scripts\\REASM_startup.ms"
		if doesFileExist f then fileIn f
		else messageBox ("REA Scene Manager no esta instalado en:\n" + f + "\n\nVuelve a ejecutar instalar.bat desde el zip descomprimido.") title:"REA Scene Manager"
	)
	if REASM_open != undefined do REASM_open()
)
