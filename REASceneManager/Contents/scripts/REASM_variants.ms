-- REA Scene Manager: variantes de materiales por setup y exportacion de imagenes para el cliente.

global REASM_uiDir = (pathConfig.removePathLeaf (trimRight (getFilenamePath (getSourceFileName())) "\\")) + "\\ui\\"

-- ==================================================================== variantes de materiales
-- Un setup puede cambiar el material A por el B. Lo cambiado se apunta en un atributo del rootNode
-- (se guarda en el .max) y se deshace al aplicar cualquier otro setup: los setups sin la tarjeta
-- Materiales usan siempre los materiales originales. El atributo tambien guarda una referencia a
-- todos los materiales usados en variantes, para que no se pierdan al guardar aunque no esten asignados.

global REASM_MtlStoreCA = attributes "REASM_MtlStore" attribID:#(0x5245414d, 0x4d544c53)
(
	parameters main
	(
		keep type:#materialTab tabSizeVariable:true
		swNodes type:#intTab tabSizeVariable:true
		swNodeTo type:#materialTab tabSizeVariable:true
		swNodeOrig type:#materialTab tabSizeVariable:true
		swMulti type:#materialTab tabSizeVariable:true
		swIdx type:#intTab tabSizeVariable:true
		swMultiTo type:#materialTab tabSizeVariable:true
		swMultiOrig type:#materialTab tabSizeVariable:true
	)
)

fn REASM_mtlStore create:true =
(
	local ca = undefined
	for i = 1 to (custAttributes.count rootNode) while ca == undefined do
		if ((custAttributes.getDef rootNode i).name as string) == "REASM_MtlStore" do ca = custAttributes.get rootNode i
	if ca == undefined and create do
	(
		custAttributes.add rootNode REASM_MtlStoreCA
		ca = custAttributes.get rootNode (custAttributes.count rootNode)
	)
	ca
)

-- Materiales que se pueden elegir: los asignados en la escena (y sus submateriales), los del Material Editor
-- y los que ya se usaron en variantes.
fn REASM_allMtls =
(
	local res = #()
	fn addM res m = (if m != undefined and (superClassOf m) == material and (findItem res m) == 0 do append res m)
	for m in sceneMaterials do
	(
		addM res m
		if (classOf m) == Multimaterial do for sm in m.materialList do addM res sm
	)
	for i = 1 to 24 do addM res (try (meditMaterials[i]) catch (undefined))
	local ca = REASM_mtlStore create:false
	if ca != undefined do for m in ca.keep do addM res m
	res
)

fn REASM_mtlNames =
(
	local names = #()
	for m in REASM_allMtls() do appendIfUnique names m.name
	sort names
)

fn REASM_findMtl nm =
(
	local found = undefined
	for m in REASM_allMtls() while found == undefined where m.name == nm do found = m
	found
)

-- Deshace los cambios de material que hizo el ultimo setup (solo donde siguen puestos).
fn REASM_mtlRestore =
(
	local ca = REASM_mtlStore create:false
	if ca == undefined do return 0
	local n = 0
	for i = ca.swNodes.count to 1 by -1 do
	(
		local o = maxOps.getNodeByHandle ca.swNodes[i]
		if o != undefined and isValidNode o and o.material == ca.swNodeTo[i] do (o.material = ca.swNodeOrig[i]; n += 1)
	)
	for i = ca.swMulti.count to 1 by -1 do
	(
		local mm = ca.swMulti[i]
		local k = ca.swIdx[i]
		if mm != undefined and k <= mm.materialList.count and mm.materialList[k] == ca.swMultiTo[i] do (mm.materialList[k] = ca.swMultiOrig[i]; n += 1)
	)
	ca.swNodes = #(); ca.swNodeTo = #(); ca.swNodeOrig = #()
	ca.swMulti = #(); ca.swIdx = #(); ca.swMultiTo = #(); ca.swMultiOrig = #()
	n
)

-- Cambia el material "de" por "a" en los objetos y en los Multi/Sub-Object. Devuelve cuantos cambio, o -1.
fn REASM_mtlSwap fromNm toNm =
(
	local a = REASM_findMtl fromNm
	local b = REASM_findMtl toNm
	if a == undefined or b == undefined or a == b do return -1
	local ca = REASM_mtlStore()
	if (findItem ca.keep a) == 0 do append ca.keep a
	if (findItem ca.keep b) == 0 do append ca.keep b
	local n = 0
	for o in objects where o.material == a do
	(
		append ca.swNodes o.inode.handle
		append ca.swNodeTo b
		append ca.swNodeOrig a
		o.material = b
		n += 1
	)
	for mm in (getClassInstances Multimaterial) do
		for k = 1 to mm.materialList.count where mm.materialList[k] == a do
		(
			append ca.swMulti mm
			append ca.swIdx k
			append ca.swMultiTo b
			append ca.swMultiOrig a
			mm.materialList[k] = b
			n += 1
		)
	n
)

-- ==================================================================== exportar para el cliente

fn REASM_jpegCodec =
(
	local found = undefined
	for c in ((dotNetClass "System.Drawing.Imaging.ImageCodecInfo").GetImageEncoders()) while found == undefined where c.MimeType == "image/jpeg" do found = c
	found
)

-- Copia una imagen como JPG listo para enviar: tamano maximo (lado largo, 0 = original), calidad 1-100
-- y logo LAP opcional (logo: "" / "white" / "black"; pos: br bl tr tl; size: % del ancho; opacity 0-1).
fn REASM_clientExport src dest maxSide quality logo pos sizePct opacity =
(
	if not (doesFileExist src) do throw ("No se encuentra " + src)
	local useSrc = src
	local tmp = ""
	-- EXR / HDR / TGA / CXR: 3ds Max la convierte antes a PNG (GDI+ no lee esos formatos)
	if not (matchPattern (getFilenameType src) pattern:".png" or matchPattern (getFilenameType src) pattern:".jp*g" or matchPattern (getFilenameType src) pattern:".tif*" or matchPattern (getFilenameType src) pattern:".bmp") do
	(
		local b = openBitmap src
		local o = bitmap b.width b.height
		copy b o
		tmp = (systemTools.getEnvVariable "TEMP") + "\\rea_export_" + (timeStamp() as string) + ".png"
		o.filename = tmp
		save o
		close o
		close b
		useSrc = tmp
	)
	local IMG = dotNetClass "System.Drawing.Image"
	local s = IMG.FromFile useSrc
	local w = s.Width, h = s.Height
	local k = if maxSide > 0 and (amax w h) > maxSide then (maxSide as float) / (amax w h) else 1.0
	local nw = amax 1 ((w * k + 0.5) as integer)
	local nh = amax 1 ((h * k + 0.5) as integer)
	local bmp = dotNetObject "System.Drawing.Bitmap" nw nh
	local g = (dotNetClass "System.Drawing.Graphics").FromImage bmp
	g.InterpolationMode = (dotNetClass "System.Drawing.Drawing2D.InterpolationMode").HighQualityBicubic
	g.PixelOffsetMode = (dotNetClass "System.Drawing.Drawing2D.PixelOffsetMode").HighQuality
	g.CompositingQuality = (dotNetClass "System.Drawing.Drawing2D.CompositingQuality").HighQuality
	g.SmoothingMode = (dotNetClass "System.Drawing.Drawing2D.SmoothingMode").HighQuality
	g.DrawImage s 0 0 nw nh
	s.Dispose()
	if logo != "" do
	(
		local L = IMG.FromFile (REASM_uiDir + "assets\\lap_logo.png")
		local lw = amax 8 ((nw * sizePct / 100.0) as integer)
		local lh = amax 2 (((lw as float) * L.Height / L.Width) as integer)
		local m = (amin nw nh) * 0.04
		local x = if pos == "bl" or pos == "tl" then m else nw - lw - m
		local y = if pos == "tl" or pos == "tr" then m else nh - lh - m
		local cm = dotNetObject "System.Drawing.Imaging.ColorMatrix"
		cm.Matrix33 = opacity
		if logo == "black" do (cm.Matrix00 = 0.0; cm.Matrix11 = 0.0; cm.Matrix22 = 0.0)
		local ia = dotNetObject "System.Drawing.Imaging.ImageAttributes"
		ia.SetColorMatrix cm
		local rect = dotNetObject "System.Drawing.Rectangle" (x as integer) (y as integer) lw lh
		g.DrawImage L rect 0 0 L.Width L.Height (dotNetClass "System.Drawing.GraphicsUnit").Pixel ia
		L.Dispose()
	)
	g.Dispose()
	makeDir (getFilenamePath dest) all:true
	local ep = dotNetObject "System.Drawing.Imaging.EncoderParameters" 1
	local qp = dotNetObject "System.Drawing.Imaging.EncoderParameter" (dotNetClass "System.Drawing.Imaging.Encoder").Quality ((amax 1 (amin 100 quality)) as integer64)
	ep.Param = dotNet.ValueToDotNetObject #(qp) (dotNetClass "System.Drawing.Imaging.EncoderParameter[]")
	if doesFileExist dest do deleteFile dest
	bmp.Save dest (REASM_jpegCodec()) ep
	bmp.Dispose()
	if tmp != "" do deleteFile tmp
	REASM_obj #(#("file", dest), #("w", nw), #("h", nh))
)

-- Material del primer objeto seleccionado (para empezar un cambio desde la escena).
fn REASM_selectionMtl =
(
	local found = ""
	for o in selection while found == "" where o.material != undefined do found = o.material.name
	found
)
