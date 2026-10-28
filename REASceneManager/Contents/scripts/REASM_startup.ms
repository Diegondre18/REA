-- REA Scene Manager - arranque
-- 3ds Max carga este archivo al iniciar (ver PackageContents.xml).

(
	local dir = getFilenamePath (getSourceFileName())
	fileIn (dir + "REASM_core.ms")
	fileIn (dir + "REASM_ui.ms")
)

macroScript REASceneManager
	category:"REA"
	internalCategory:"REA"
	buttonText:"REA Scenes"
	toolTip:"REA Scene Manager"
(
	REASM_open()
)
