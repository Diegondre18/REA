# REA Node: convierte este PC en un nodo de la granja de render de REA Scene Manager.
# Vive junto al reloj de Windows. Cuando el PC esta disponible toma la siguiente imagen de la cola
# (carpeta compartida en el NAS) y la renderiza con 3ds Max en segundo plano (3dsmaxbatch).

$ErrorActionPreference = 'Stop'
$NodeVersion = '1.0.0'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, Microsoft.VisualBasic
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class ReaIdle {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  public static double Seconds() { var i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return unchecked((uint)Environment.TickCount - i.dwTime) / 1000.0; }
}
"@

# ---------------------------------------------------------------- una sola instancia
$mutex = New-Object System.Threading.Mutex($false, 'Local\REASceneManagerNode')
if (-not $mutex.WaitOne(0)) { [System.Windows.Forms.MessageBox]::Show('REA Node ya está abierto (mira junto al reloj).', 'REA Node') | Out-Null; exit }

# ---------------------------------------------------------------- utilidades
function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function ReadJson($f) {
  if (-not (Test-Path -LiteralPath $f)) { return $null }
  try { return (Get-Content -LiteralPath $f -Raw -Encoding UTF8) | ConvertFrom-Json } catch { return $null }
}
function WriteText($f, $txt) {
  $dir = Split-Path -Parent $f
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = "$f.$PID.tmp"
  [IO.File]::WriteAllText($tmp, $txt, (New-Object Text.UTF8Encoding($false)))
  if (Test-Path -LiteralPath $f) {
    try { [IO.File]::Replace($tmp, $f, $null) } catch { Copy-Item -LiteralPath $tmp -Destination $f -Force; Remove-Item -LiteralPath $tmp -Force }
  } else { [IO.File]::Move($tmp, $f) }
}
function WriteJson($f, $obj) { WriteText $f ($obj | ConvertTo-Json -Depth 6 -Compress) }
function Log($msg) {
  try { Add-Content -LiteralPath $script:logFile -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg) -Encoding UTF8 } catch { }
}

# ---------------------------------------------------------------- configuracion
$localDir = Join-Path $env:LOCALAPPDATA 'REASceneManager'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$script:logFile = Join-Path $localDir 'node.log'
$cfgFile = Join-Path $localDir 'node.json'
$cfg = ReadJson $cfgFile
$root = if ($cfg -and $cfg.root) { [string]$cfg.root } else { '' }
if (-not $root -or -not (Test-Path -LiteralPath $root)) {
  $def = if ($root) { $root } else { '\\LAP-NAS\LAP Arquitectura NAS\Arch Viz Lap\00_RenderFarm' }
  $root = [Microsoft.VisualBasic.Interaction]::InputBox("Carpeta compartida de la granja de render (la misma en todos los PCs):", 'REA Node', $def)
  if (-not $root) { exit }
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  WriteJson $cfgFile @{ root = $root }
}
$root = $root.TrimEnd('\')
$pc = $env:COMPUTERNAME
$jobsDir = Join-Path $root 'jobs'
$nodesDir = Join-Path $root 'nodes'
New-Item -ItemType Directory -Force -Path $jobsDir, $nodesDir | Out-Null
$beatFile = Join-Path $nodesDir "$pc.json"
$setFile = Join-Path $nodesDir "$pc.settings.json"
$defaults = @{ mode = 'idle'; idleMin = 10; nightFrom = '19:00'; nightTo = '07:00'; paused = $false; lowPriority = $true; onReturn = 'finish' }
if (-not (Test-Path -LiteralPath $setFile)) { WriteJson $setFile $defaults }

# 3ds Max 2021 (version interna 23.0)
$maxDir = ''
foreach ($k in 'HKLM:\SOFTWARE\Autodesk\3dsMax\23.0', 'HKLM:\SOFTWARE\Autodesk\3dsMax\23.0\MAX-1:409') {
  try { $v = (Get-ItemProperty -Path $k -ErrorAction Stop).Installdir; if ($v) { $maxDir = $v; break } } catch { }
}
if (-not $maxDir) { $maxDir = Join-Path $env:ProgramFiles 'Autodesk\3ds Max 2021' }
$batchExe = Join-Path $maxDir '3dsmaxbatch.exe'
$renderScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\REASM_node_render.ms'

# ---------------------------------------------------------------- inventario
function FindPlugin($dirs, $pattern) {
  foreach ($d in $dirs) {
    if (-not $d -or -not (Test-Path -LiteralPath $d)) { continue }
    $f = Get-ChildItem -LiteralPath $d -Filter $pattern -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { return $f.VersionInfo.ProductVersion }
  }
  return ''
}
function Get-Versions {
  $dirs = @((Join-Path $maxDir 'plugins'), $maxDir, (Join-Path $env:ProgramFiles 'Corona'), (Join-Path $env:ProgramFiles 'Itoo Software'), (Join-Path $env:ProgramFiles 'tyFlow'), (Join-Path $env:ProgramData 'Autodesk\ApplicationPlugins'))
  @{
    max = if (Test-Path -LiteralPath $batchExe) { '2021' } else { '' }
    corona = FindPlugin $dirs 'Corona*.dlr'
    forest = FindPlugin $dirs 'Forest*.dlo'
    railclone = FindPlugin $dirs 'RailClone*.dlo'
    tyflow = FindPlugin $dirs 'tyFlow*.dlo'
  }
}
$versions = Get-Versions
$hw = @{ cpu = ''; cores = 0; gpu = ''; ram = 0 }
try { $hw.cpu = ([string](Get-CimInstance Win32_Processor | Select-Object -First 1).Name -replace '\s+', ' ').Trim() } catch { }
try { $hw.cores = [int](Get-CimInstance Win32_Processor | Measure-Object NumberOfLogicalProcessors -Sum).Sum } catch { }
try { $hw.gpu = ((Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join ', ') } catch { }
try { $hw.ram = [math]::Round([double](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB) } catch { }

# ---------------------------------------------------------------- estado
$script:settings = $defaults
$script:job = $null        # @{ dir; id; name; task; taskName; txt; proc; start; est }
$script:state = 'idle'
$script:lastVersions = Get-Date

function InWindow($from, $to) {
  $now = (Get-Date).TimeOfDay
  $a = [TimeSpan]::Parse($from); $b = [TimeSpan]::Parse($to)
  if ($a -le $b) { return ($now -ge $a -and $now -lt $b) } else { return ($now -ge $a -or $now -lt $b) }
}

function IsAvailable {
  $s = $script:settings
  if ($s.paused) { return $false }
  switch ($s.mode) {
    'always' { return $true }
    'night' { return (InWindow $s.nightFrom $s.nightTo) }
    'idle' { return ([ReaIdle]::Seconds() -ge ([double]$s.idleMin * 60)) }
    default { return $false }
  }
}

function TaskState($dir, $tid, $obj) { WriteJson (Join-Path $dir "tasks\$tid.json") $obj }

function KillTree($proc) {
  try { & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null } catch { }
}

# Siguiente imagen libre: trabajos listos, sin pausa ni cancelacion, de mayor prioridad y mas antiguos primero.
function NextTask {
  $jobs = @()
  foreach ($d in (Get-ChildItem -LiteralPath $jobsDir -Directory -ErrorAction SilentlyContinue)) {
    $p = $d.FullName
    if (-not (Test-Path -LiteralPath "$p\job.ready") -or (Test-Path -LiteralPath "$p\pause.flag") -or (Test-Path -LiteralPath "$p\cancel.flag")) { continue }
    $j = ReadJson "$p\job.json"
    if (-not $j) { continue }
    if ($j.pc -and $j.pc -ne $pc) { continue }
    $jobs += [pscustomobject]@{ dir = $p; job = $j; pri = [int]$j.priority; created = [long]$j.created }
  }
  foreach ($x in ($jobs | Sort-Object @{ e = 'pri'; Descending = $true }, @{ e = 'created'; Descending = $false })) {
    foreach ($t in $x.job.tasks) {
      $claim = Join-Path $x.dir "tasks\$($t.id).claim"
      if (Test-Path -LiteralPath $claim) { continue }
      try {
        $fs = [IO.File]::Open($claim, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $b = [Text.Encoding]::UTF8.GetBytes($pc); $fs.Write($b, 0, $b.Length); $fs.Close()
        return @{ dir = $x.dir; id = $x.job.id; name = $x.job.name; task = $t.id; taskName = $t.name; est = [long]$t.est }
      } catch { continue }   # otro nodo la tomo justo antes
    }
  }
  return $null
}

function StartTask($t) {
  $txt = Join-Path $t.dir "tasks\$($t.task).txt"
  $res = "$txt.result"
  if (Test-Path -LiteralPath $res) { Remove-Item -LiteralPath $res -Force }
  $log = Join-Path $t.dir "tasks\$($t.task).log"
  $scene = Join-Path $t.dir 'scene.max'
  $argLine = "`"$renderScript`" -sceneFile `"$scene`" -mxsString task:`"$txt`" -log `"$log`" -v 3"
  Log "Empieza $($t.name) / $($t.taskName)"
  $t.txt = $txt
  $t.log = $log
  $t.start = NowMs
  $t.proc = Start-Process -FilePath $batchExe -ArgumentList $argLine -PassThru -WindowStyle Hidden
  $script:job = $t
  TaskState $t.dir $t.task @{ id = $t.task; state = 'run'; node = $pc; start = $t.start; est = $t.est }
}

function LowerPriority {
  $j = $script:job
  if (-not $j -or -not $script:settings.lowPriority) { return }
  try { if (-not $j.proc.HasExited) { $j.proc.PriorityClass = 'BelowNormal' } } catch { }
  try {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$($j.proc.Id)" | ForEach-Object {
      try { (Get-Process -Id $_.ProcessId -ErrorAction Stop).PriorityClass = 'BelowNormal' } catch { }
    }
  } catch { }
}

function FinishTask {
  $j = $script:job
  $r = @{ id = $j.task; node = $pc; start = $j.start; end = NowMs; log = $j.log }
  $res = "$($j.txt).result"
  if (Test-Path -LiteralPath $res) {
    $l = @(Get-Content -LiteralPath $res -Encoding UTF8)
    while ($l.Count -lt 6) { $l += '' }
    $r.state = if ($l[0] -eq 'ok') { 'ok' } else { 'error' }
    $r.file = $l[1]; $r.lightmix = $l[2]; $r.ms = [long]("0" + $l[3]); $r.thumb = $l[4]; $r.error = $l[5]
  } else {
    $r.state = 'error'; $r.error = '3ds Max se cerró sin terminar. Revisa el log de la tarea.'
  }
  TaskState $j.dir $j.task $r
  Log "Termina $($j.name) / $($j.taskName): $($r.state) $($r.error)"
  $tip = if ($r.state -eq 'ok') { "$($j.taskName) listo" } else { "$($j.taskName): error" }
  $script:tray.ShowBalloonTip(4000, 'REA Node', $tip, $(if ($r.state -eq 'ok') { 'Info' } else { 'Warning' }))
  $script:job = $null
}

function AbortTask($why, $requeue) {
  $j = $script:job
  KillTree $j.proc
  Start-Sleep -Milliseconds 500
  if ($requeue) {
    Remove-Item -LiteralPath (Join-Path $j.dir "tasks\$($j.task).json"), (Join-Path $j.dir "tasks\$($j.task).claim") -Force -ErrorAction SilentlyContinue
  } else {
    TaskState $j.dir $j.task @{ id = $j.task; state = 'cancelled'; node = $pc; start = $j.start; end = NowMs; error = $why }
  }
  Log "Detenida $($j.taskName): $why"
  $script:job = $null
}

function Heartbeat {
  $cpu = 0; $used = 0; $total = 0
  try { $c = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average; if ($null -ne $c) { $cpu = [math]::Round([double]$c) } } catch { }
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    $total = [math]::Round([double]$os.TotalVisibleMemorySize / 1MB, 1)
    $used = [math]::Round(([double]$os.TotalVisibleMemorySize - [double]$os.FreePhysicalMemory) / 1MB, 1)
  } catch { }
  $j = $script:job
  WriteJson $beatFile @{
    name = $pc; version = $NodeVersion; state = $script:state; lastSeen = NowMs
    settings = $script:settings; idleSec = [math]::Round([ReaIdle]::Seconds())
    cpuLoad = $cpu; ramUsed = $used; ramTotal = $total
    hw = $hw; versions = $versions; maxFound = (Test-Path -LiteralPath $batchExe)
    job = $(if ($j) { @{ id = $j.id; dir = $j.dir; name = $j.name; task = $j.task; taskName = $j.taskName; start = $j.start; est = $j.est } } else { $null })
  }
}

function LoadSettings {
  $s = ReadJson $setFile
  $m = @{}; foreach ($k in $defaults.Keys) { $m[$k] = $defaults[$k] }
  if ($s) { foreach ($p in $s.PSObject.Properties) { $m[$p.Name] = $p.Value } }
  $script:settings = $m
}
function SaveSettings { WriteJson $setFile $script:settings }

# ---------------------------------------------------------------- ciclo
function Tick {
  try {
    LoadSettings
    $avail = IsAvailable
    if ($script:job) {
      $j = $script:job
      if ($j.proc.HasExited) { FinishTask }
      elseif (Test-Path -LiteralPath (Join-Path $j.dir 'cancel.flag')) { AbortTask 'Cancelado' $false }
      elseif (Test-Path -LiteralPath (Join-Path $j.dir "tasks\$($j.task).stop")) { Remove-Item -LiteralPath (Join-Path $j.dir "tasks\$($j.task).stop") -Force; AbortTask 'Detenido' $false }
      elseif ($script:settings.mode -eq 'idle' -and $script:settings.onReturn -eq 'requeue' -and [ReaIdle]::Seconds() -lt 5) { AbortTask 'El usuario volvió al PC' $true }
      else { LowerPriority }
    }
    if (-not $script:job -and $avail) {
      if (-not (Test-Path -LiteralPath $batchExe)) { $script:state = 'error' }
      else { $t = NextTask; if ($t) { StartTask $t } }
    }
    $script:state = if ($script:job) { 'busy' } elseif ($script:settings.paused) { 'paused' } elseif (-not (Test-Path -LiteralPath $batchExe)) { 'error' } elseif ($avail) { 'idle' } else { 'waiting' }
    if (((Get-Date) - $script:lastVersions).TotalMinutes -gt 60) { $script:versions = Get-Versions; $script:lastVersions = Get-Date }
    Heartbeat
    UpdateTray
  } catch {
    $msg = "Error: " + $_.Exception.Message + " (linea " + $_.InvocationInfo.ScriptLineNumber + ")"
    if ($msg -ne $script:lastError) { Log $msg; $script:lastError = $msg }
    try { UpdateTray } catch { }
  }
}

# ---------------------------------------------------------------- icono junto al reloj
function DotIcon($color) {
  $bmp = New-Object Drawing.Bitmap 16, 16
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#1c1c1e'))), 0, 0, 15, 15)
  $g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($color))), 4, 4, 7, 7)
  $g.Dispose()
  [Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$icons = @{ busy = DotIcon '#FF9F0A'; idle = DotIcon '#30D158'; waiting = DotIcon '#0A84FF'; paused = DotIcon '#8E8E93'; error = DotIcon '#FF453A' }
$labels = @{ busy = 'Renderizando'; idle = 'Libre, esperando trabajos'; waiting = 'En uso (renderiza cuando quede libre)'; paused = 'En pausa'; error = 'No se encuentra 3ds Max 2021' }

$script:tray = New-Object Windows.Forms.NotifyIcon
$tray.Visible = $true
$menu = New-Object Windows.Forms.ContextMenuStrip
$miState = $menu.Items.Add('REA Node'); $miState.Enabled = $false
[void]$menu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
$miPause = $menu.Items.Add('Pausar')
$miPause.add_Click({ LoadSettings; $script:settings.paused = -not $script:settings.paused; SaveSettings; Tick })
$miMode = New-Object Windows.Forms.ToolStripMenuItem 'Disponibilidad'
$modes = [ordered]@{ always = 'Siempre'; idle = 'Cuando no se use el PC'; night = 'Solo de noche' }
foreach ($k in $modes.Keys) {
  $it = New-Object Windows.Forms.ToolStripMenuItem $modes[$k]
  $it.Tag = $k
  $it.add_Click({ param($s) LoadSettings; $script:settings.mode = $s.Tag; SaveSettings; Tick })
  [void]$miMode.DropDownItems.Add($it)
}
[void]$menu.Items.Add($miMode)
$miFolder = $menu.Items.Add('Abrir la carpeta de la granja'); $miFolder.add_Click({ Start-Process explorer.exe $root })
$miLog = $menu.Items.Add('Ver registro'); $miLog.add_Click({ if (Test-Path -LiteralPath $script:logFile) { Start-Process notepad.exe $script:logFile } })
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'REA Node.cmd'
$miStart = New-Object Windows.Forms.ToolStripMenuItem 'Iniciar con Windows'
$miStart.Checked = (Test-Path -LiteralPath $startup)
$miStart.add_Click({
  if (Test-Path -LiteralPath $startup) { Remove-Item -LiteralPath $startup -Force; $miStart.Checked = $false }
  else { WriteText $startup ("@start `"`" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"`r`n"); $miStart.Checked = $true }
})
[void]$menu.Items.Add($miStart)
[void]$menu.Items.Add((New-Object Windows.Forms.ToolStripSeparator))
$miExit = $menu.Items.Add('Salir')
$miExit.add_Click({
  if ($script:job -and [Windows.Forms.MessageBox]::Show('Hay un render en marcha. ¿Detenerlo y devolverlo a la cola?', 'REA Node', 'YesNo') -ne 'Yes') { return }
  if ($script:job) { AbortTask 'Nodo cerrado' $true }
  $script:state = 'off'; Heartbeat
  $timer.Stop(); $tray.Visible = $false; [Windows.Forms.Application]::Exit()
})
$tray.ContextMenuStrip = $menu
$tray.add_MouseClick({ param($s, $e) if ($e.Button -eq 'Left') { $m = [Windows.Forms.NotifyIcon].GetMethod('ShowContextMenu', [Reflection.BindingFlags]'Instance,NonPublic'); $m.Invoke($tray, $null) } })

function UpdateTray {
  $st = $script:state
  $tray.Icon = $icons[$st]
  $txt = 'REA Node · ' + $labels[$st]
  if ($script:job) { $txt = "REA Node · $($script:job.taskName)" }
  $tray.Text = $txt.Substring(0, [math]::Min(63, $txt.Length))
  $miState.Text = $(if ($script:job) { "Renderizando: $($script:job.name) / $($script:job.taskName)" } else { $labels[$st] })
  $miPause.Text = $(if ($script:settings.paused) { 'Reanudar' } else { 'Pausar' })
  foreach ($it in $miMode.DropDownItems) { $it.Checked = ($it.Tag -eq $script:settings.mode) }
}

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({ Tick })
Log "REA Node $NodeVersion en $pc. Granja: $root. 3ds Max: $batchExe"
Tick
$timer.Start()
$tray.ShowBalloonTip(3000, 'REA Node', 'Nodo activo. Clic en el punto junto al reloj para las opciones.', 'Info')
[Windows.Forms.Application]::Run()
