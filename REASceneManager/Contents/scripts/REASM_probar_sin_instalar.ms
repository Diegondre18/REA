-- Abre REA Scene Manager sin instalarlo.
-- En 3ds Max: Scripting > Run Script... y elige este archivo.

fileIn ((getFilenamePath (getSourceFileName())) + "REASM_startup.ms")
REASM_open()
