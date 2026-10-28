-- REA Scene Manager - ventana
-- Muestra la interfaz web (Contents\ui) dentro de 3ds Max usando Microsoft Edge WebView2.
-- La web envia mensajes "id<US>comando<US>arg1<US>arg2..." y recibe respuestas JSON.

global REASM_dir = getFilenamePath (getSourceFileName())
global REASM_form
global REASM_wv
global REASM_timer
global REASM_queue = #()
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
	local g = for i = 1 to (amax 3 a.count) collect (if i <= a.count then a[i] else "")
	case cmd of
	(
		"ping": REASM_VERSION
		"getScene": REASM_getScene()
		"loadData": REASM_loadData()
		"saveData": REASM_saveData g[1]
		"apply": REASM_applyOps a
		"batchBegin": REASM_batchBegin()
		"batchEnd": REASM_batchEnd (g[1] == "1")
		"render": REASM_render g[1] g[2] g[3]
		"setOutput": REASM_setOutput g[1] g[2] g[3]
		"camCreate": REASM_camCreate g[1]
		"cam": REASM_camCommand g[1] g[2] g[3]
		"elem": REASM_elemCommand g[1] (g[2] as integer) g[3]
		"browseFolder":
		(
			local f = getSavePath caption:"Elegir carpeta" initialDir:g[1]
			if f == undefined then "" else f
		)
		"selection": (for o in selection collect o.name)
		"openRenderSetup": (renderSceneDialog.open(); true)
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

-- Los mensajes se procesan fuera del evento de WebView2 (con un timer), asi un render largo no lo bloquea.
fn REASM_onTick s e =
(
	REASM_timer.Stop()
	while REASM_queue.count > 0 do
	(
		local raw = REASM_queue[1]
		deleteItem REASM_queue 1
		REASM_handle raw
	)
)

fn REASM_onMessage s e =
(
	local raw = try (e.TryGetWebMessageAsString()) catch (undefined)
	if raw != undefined do
	(
		append REASM_queue raw
		REASM_timer.Start()
	)
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
		local uiDir = REASM_fullPath (REASM_dir + "..\\ui")
		core.SetVirtualHostNameToFolderMapping "reasm.local" uiDir (dotNetClass "Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind").Allow
		REASM_ready = true
		core.Navigate ("https://reasm.local/index.html?t=" + (timeStamp() as string))
	)
	else
	(
		local msg = try (e.InitializationException.Message) catch ("error desconocido")
		messageBox ("No se pudo iniciar WebView2:\n" + msg) title:"REA Scene Manager"
	)
)

fn REASM_onClosed s e =
(
	REASM_ready = false
	try (REASM_timer.Stop()) catch ()
	REASM_queue = #()
	REASM_form = undefined
	REASM_wv = undefined
)

fn REASM_open =
(
	if REASM_form != undefined and not REASM_form.IsDisposed then
	(
		REASM_form.Activate()
		return true
	)

	local bin = REASM_fullPath (REASM_dir + "..\\bin")
	dotNet.loadAssembly (bin + "\\Microsoft.Web.WebView2.Core.dll")
	dotNet.loadAssembly (bin + "\\Microsoft.Web.WebView2.WinForms.dll")
	local envCls = dotNetClass "Microsoft.Web.WebView2.Core.CoreWebView2Environment"
	try (envCls.SetLoaderDllFolderPath bin) catch ()

	-- Edge WebView2 Runtime viene con Windows 10/11. Si no esta, se usa el de Pulze si existe.
	local browserFolder = ""
	local ver = try (envCls.GetAvailableBrowserVersionString()) catch (undefined)
	if ver == undefined do
	(
		local pulze = (systemTools.getEnvVariable "ProgramFiles") + "\\Pulze\\Scene Manager\\runtime"
		if doesFileExist pulze then browserFolder = pulze
		else
		(
			messageBox "Falta Microsoft Edge WebView2 Runtime.\nDescargalo gratis de:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703\ny vuelve a abrir REA Scene Manager." title:"REA Scene Manager"
			return false
		)
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

	REASM_timer = dotNetObject "System.Windows.Forms.Timer"
	REASM_timer.Interval = 10
	REASM_queue = #()
	REASM_ready = false

	dotNet.addEventHandler REASM_timer "Tick" REASM_onTick
	dotNet.addEventHandler REASM_wv "CoreWebView2InitializationCompleted" REASM_onInit
	dotNet.addEventHandler REASM_wv "WebMessageReceived" REASM_onMessage
	dotNet.addEventHandler REASM_form "FormClosed" REASM_onClosed
	dotNet.setLifetimeControl REASM_timer #dotnet
	dotNet.setLifetimeControl REASM_wv #dotnet
	dotNet.setLifetimeControl REASM_form #dotnet

	REASM_form.ShowModeless()
	REASM_wv.EnsureCoreWebView2Async undefined
	true
)

-- Avisos a la web cuando cambia la escena (archivo abierto, camaras/capas creadas, etc.)
callbacks.removeScripts id:#REASM
for ev in #(#filePostOpen, #systemPostNew, #systemPostReset, #filePostMerge) do
	try (callbacks.addScript ev "REASM_notify \"scene\"" id:#REASM) catch ()
for ev in #(#nodeCreated, #nodePostDelete, #nodeNameSet, #layerCreated, #layerDeleted, #postRender) do
	try (callbacks.addScript ev "REASM_notify \"nodes\"" id:#REASM) catch ()
