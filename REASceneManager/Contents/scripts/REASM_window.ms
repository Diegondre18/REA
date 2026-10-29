-- REA Scene Manager - ventana
-- Muestra la interfaz web (Contents\ui) dentro de 3ds Max usando Microsoft Edge WebView2.
-- La web envia mensajes "id<US>comando<US>arg1<US>arg2..." y recibe respuestas JSON.

global REASM_dir = getFilenamePath (getSourceFileName())
global REASM_form
global REASM_wv
global REASM_ready = false

fn REASM_fullPath p = ((dotNetClass "System.IO.Path").GetFullPath p)

fn REASM_post json =
(
	if REASM_ready and REASM_wv != undefined do
		try (REASM_wv.CoreWebView2.PostWebMessageAsJson json) catch ()
)

fn REASM_notify evt = (REASM_post (REASM_toJson (REASM_obj #(#("event", evt)))))

fn REASM_dispatch cmd a =
(
	-- argumentos que faltan = texto vacio
	local g = for i = 1 to (amax 6 a.count) collect (if i <= a.count then a[i] else "")
	case cmd of
	(
		"ping": REASM_VERSION
		"getScene": REASM_getScene()
		"loadData": REASM_loadData()
		"saveData": REASM_saveData g[1]
		"apply": REASM_applyOps a
		"batchBegin": REASM_batchBegin()
		"batchEnd": REASM_batchEnd (g[1] == "1")
		"render": REASM_render g[1] g[2] g[3] g[4]
		"setOutput": REASM_setOutput g[1] g[2] g[3]
		"camCreate": REASM_camCreate g[1] g[2]
		"cam": REASM_camCommand g[1] g[2] g[3]
		"elem": REASM_elemCommand g[1] (g[2] as integer) g[3]
		"browseFolder":
		(
			local f = getSavePath caption:"Elegir carpeta" initialDir:g[1]
			if f == undefined then "" else f
		)
		"selection": (for o in selection collect o.name)
		"openRenderSetup": (renderSceneDialog.open(); true)
		"thumbViewport": REASM_thumbViewport g[1]
		"clay": REASM_setClay (g[1] == "1")
		"listPresets": REASM_listPresets g[1]
		"listFiles": REASM_listFiles g[1] g[2]
		"openFile": REASM_openFile g[1]
		"showInFolder": REASM_showInFolder g[1]
		"beep": REASM_beep()
		"loadPreset": REASM_loadPreset g[1] (g[2] == "1")
		"removePresets": REASM_removePresetLayers()
		"thumbFromFile": REASM_thumbFromFile g[1] g[2]
		default: throw ("Comando desconocido: " + cmd)
	)
)

fn REASM_handle raw =
(
	local parts = REASM_split raw REASM_US
	local id = parts[1]
	local cmd = if parts.count > 1 then parts[2] else ""
	local args = for i = 3 to parts.count collect parts[i]
	local result = undefined
	local err = undefined
	try (result = REASM_dispatch cmd args)
	catch (err = getCurrentException())
	REASM_post (REASM_toJson (REASM_obj #(#("id", id), #("ok", err == undefined), #("result", result), #("error", err))))
)

-- Cada mensaje se procesa en cuanto llega y se responde con su id.
fn REASM_onMessage s e =
(
	local raw = try (e.TryGetWebMessageAsString()) catch (undefined)
	if raw != undefined do REASM_handle raw
)

fn REASM_onInit s e =
(
	if e.IsSuccess then
	(
		local core = REASM_wv.CoreWebView2
		core.Settings.AreDefaultContextMenusEnabled = false
		core.Settings.IsStatusBarEnabled = false
		core.Settings.IsZoomControlEnabled = false
		core.Settings.AreDevToolsEnabled = true
		REASM_ready = true
	)
	else
	(
		local msg = try (e.InitializationException.Message) catch ("error desconocido")
		format "REA Scene Manager - WebView2 no pudo iniciar: %\n" msg
		messageBox ("No se pudo iniciar la ventana (WebView2):\n\n" + msg + "\n\nSi falta, instala Microsoft Edge WebView2 Runtime:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703\ny reinicia 3ds Max.") title:"REA Scene Manager"
		try (REASM_form.Close()) catch ()
	)
)

fn REASM_onClosed s e =
(
	REASM_ready = false
	REASM_form = undefined
	REASM_wv = undefined
)

-- Carga una DLL aunque Windows la tenga marcada como "descargada de internet".
fn REASM_loadDll path =
(
	-- quitar la marca de descarga (Zone.Identifier) de la DLL y del loader nativo
	try (deleteFile (path + ":Zone.Identifier")) catch ()
	try (dotNet.loadAssembly path)
	catch
	(
		(dotNetClass "System.Reflection.Assembly").UnsafeLoadFrom path
	)
)

-- Busca el WebView2 Runtime instalado (API del SDK o carpetas de instalacion habituales).
fn REASM_hasRuntime envCls =
(
	local ver = try (envCls.GetAvailableBrowserVersionString()) catch (undefined)
	if ver != undefined and ver != "" then true
	else
	(
		local roots = #( \
			(systemTools.getEnvVariable "ProgramFiles(x86)") + "\\Microsoft\\EdgeWebView\\Application", \
			(systemTools.getEnvVariable "ProgramFiles") + "\\Microsoft\\EdgeWebView\\Application", \
			(systemTools.getEnvVariable "LOCALAPPDATA") + "\\Microsoft\\EdgeWebView\\Application")
		local found = false
		for r in roots while not found do
			for d in (getDirectories (r + "\\*")) while not found do
				if doesFileExist (d + "msedgewebview2.exe") do found = true
		found
	)
)

fn REASM_open =
(
	if REASM_form != undefined and not REASM_form.IsDisposed then
	(
		REASM_form.Activate()
		return true
	)

	local bin = REASM_fullPath (REASM_dir + "..\\bin")
	REASM_loadDll (bin + "\\Microsoft.Web.WebView2.Core.dll")
	REASM_loadDll (bin + "\\Microsoft.Web.WebView2.WinForms.dll")
	try (deleteFile (bin + "\\WebView2Loader.dll:Zone.Identifier")) catch ()
	local envCls = dotNetClass "Microsoft.Web.WebView2.Core.CoreWebView2Environment"
	try (envCls.SetLoaderDllFolderPath bin) catch ()

	-- Edge WebView2 Runtime viene con Windows 10/11. Se usa el de Windows; solo si no se
	-- encuentra de ninguna forma y existe el de Pulze, se usa ese. Si falla, REASM_onInit avisa.
	local browserFolder = ""
	if not (REASM_hasRuntime envCls) do
	(
		local pulze = (systemTools.getEnvVariable "ProgramFiles") + "\\Pulze\\Scene Manager\\runtime"
		if doesFileExist pulze do browserFolder = pulze
	)

	local bg = (dotNetClass "System.Drawing.Color").FromArgb 255 30 30 30
	REASM_form = dotNetObject "MaxCustomControls.MaxForm"
	REASM_form.Text = "REA Scene Manager"
	REASM_form.Size = dotNetObject "System.Drawing.Size" 900 960
	REASM_form.MinimumSize = dotNetObject "System.Drawing.Size" 560 500
	REASM_form.BackColor = bg
	REASM_form.StartPosition = (dotNetClass "System.Windows.Forms.FormStartPosition").CenterScreen

	REASM_wv = dotNetObject "Microsoft.Web.WebView2.WinForms.WebView2"
	REASM_wv.Dock = (dotNetClass "System.Windows.Forms.DockStyle").Fill
	REASM_wv.DefaultBackgroundColor = bg
	local cp = dotNetObject "Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties"
	cp.UserDataFolder = (systemTools.getEnvVariable "LOCALAPPDATA") + "\\REASceneManager\\WebView2"
	if browserFolder != "" do cp.BrowserExecutableFolder = browserFolder
	REASM_wv.CreationProperties = cp
	REASM_form.Controls.Add REASM_wv

	REASM_ready = false

	dotNet.addEventHandler REASM_wv "CoreWebView2InitializationCompleted" REASM_onInit
	dotNet.addEventHandler REASM_wv "WebMessageReceived" REASM_onMessage
	dotNet.addEventHandler REASM_form "FormClosed" REASM_onClosed
	dotNet.setLifetimeControl REASM_wv #dotnet
	dotNet.setLifetimeControl REASM_form #dotnet

	REASM_form.ShowModeless()
	-- Asignar Source inicia WebView2 (con CreationProperties) y abre la interfaz local.
	local page = REASM_fullPath (REASM_dir + "..\\ui\\index.html")
	REASM_wv.Source = dotNetObject "System.Uri" page
	true
)

-- Avisos a la web cuando cambia la escena (archivo abierto, camaras/capas creadas, etc.)
callbacks.removeScripts id:#REASM
for ev in #(#filePostOpen, #systemPostNew, #systemPostReset, #filePostMerge) do
	try (callbacks.addScript ev "REASM_notify \"scene\"" id:#REASM) catch ()
for ev in #(#nodeCreated, #nodePostDelete, #nodeNameSet, #layerCreated, #layerDeleted, #postRender) do
	try (callbacks.addScript ev "REASM_notify \"nodes\"" id:#REASM) catch ()
