# Ordena el NAS como esta organizado el disco local de Synology Drive, sin perder nada.
#  1. Compara los archivos del disco local con los del NAS (por ruta, nombre y tamano).
#  2. Informe en el Escritorio, sin cambiar nada.
#  3. Solo si escribes SI: copia al NAS lo que falte (con la organizacion del disco local) y aparta a
#     "_Antiguos_duplicados" las copias del NAS que el disco local tiene en otro sitio. No borra archivos.

param(
  [string]$Src = 'D:\Synology\SynologyDrive\Arch Viz Lap',
  [string]$Dst = '\\LAP-NAS\LAP Arquitectura NAS\Arch Viz Lap'
)
$ErrorActionPreference = 'Stop'
$Quarantine = '_Antiguos_duplicados'
$skipRx = '(^|\\)(#SynoRecycle|@eaDir|\.SynologyWorkingDirectory|#recycle|' + [regex]::Escape($Quarantine) + ')(\\|$)'
$desk = [Environment]::GetFolderPath('Desktop')
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$repDir = Join-Path $desk "Informe_NAS_$stamp"

function Size($b) { if ($b -ge 1GB) { '{0:N1} GB' -f ($b / 1GB) } elseif ($b -ge 1MB) { '{0:N0} MB' -f ($b / 1MB) } else { '{0:N0} KB' -f ($b / 1KB) } }

function ListFiles($root) {
  $base = (Get-Item -LiteralPath $root).FullName.TrimEnd('\')
  $out = New-Object System.Collections.Generic.List[object]
  $errs = @()
  Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue -ErrorVariable +errs | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length + 1)
    if ($rel -match $skipRx) { return }
    if ($_.Name -eq 'Thumbs.db' -or $_.Name -eq 'desktop.ini' -or $_.Name -like '~$*' -or $_.Extension -eq '.tmp') { return }
    $out.Add([pscustomobject]@{ Rel = $rel; Name = $_.Name; Size = $_.Length; Key = ($_.Name.ToLowerInvariant() + '|' + $_.Length) })
  }
  $script:listErrors += @($errs)
  return $out
}

Write-Host ''
Write-Host '=================================================='
Write-Host ' Ordenar el NAS como el disco local'
Write-Host '=================================================='
Write-Host " Disco local: $Src"
Write-Host " NAS:         $Dst"
Write-Host ''
if (-not (Test-Path -LiteralPath $Src)) { Write-Host 'No existe la carpeta local.'; exit 1 }
if (-not (Test-Path -LiteralPath $Dst)) { Write-Host 'No se encuentra la carpeta del NAS.'; exit 1 }

$script:listErrors = @()
Write-Host 'Leyendo el disco local...'
$local = ListFiles $Src
Write-Host ("  {0} archivos" -f $local.Count)
Write-Host 'Leyendo el NAS (puede tardar varios minutos)...'
$nas = ListFiles $Dst
Write-Host ("  {0} archivos" -f $nas.Count)

$localRel = @{}; $localKey = @{}
foreach ($f in $local) {
  $localRel[$f.Rel] = $f
  if (-not $localKey.ContainsKey($f.Key)) { $localKey[$f.Key] = New-Object System.Collections.Generic.List[string] }
  $localKey[$f.Key].Add($f.Rel)
}
$nasRel = @{}
foreach ($f in $nas) { $nasRel[$f.Rel] = $f }

$same = 0; $moved = New-Object System.Collections.Generic.List[object]; $nasOnly = New-Object System.Collections.Generic.List[object]
foreach ($f in $nas) {
  if ($localRel.ContainsKey($f.Rel)) { $same++ }
  elseif ($localKey.ContainsKey($f.Key)) { $moved.Add([pscustomobject]@{ EnElNAS = $f.Rel; OrganizadoEn = ($localKey[$f.Key] -join ' | '); Tamano = (Size $f.Size); Bytes = $f.Size }) }
  else { $nasOnly.Add([pscustomobject]@{ SoloEnElNAS = $f.Rel; Tamano = (Size $f.Size); Bytes = $f.Size }) }
}
$toCopy = New-Object System.Collections.Generic.List[object]
foreach ($f in $local) { if (-not $nasRel.ContainsKey($f.Rel)) { $toCopy.Add([pscustomobject]@{ PorCopiar = $f.Rel; Tamano = (Size $f.Size); Bytes = $f.Size }) } }

New-Item -ItemType Directory -Force -Path $repDir | Out-Null
$moved | Select-Object EnElNAS, OrganizadoEn, Tamano | Export-Csv -LiteralPath (Join-Path $repDir '2_duplicados_que_se_apartan.csv') -NoTypeInformation -Encoding UTF8 -Delimiter ';'
$nasOnly | Select-Object SoloEnElNAS, Tamano | Export-Csv -LiteralPath (Join-Path $repDir '3_solo_en_el_NAS_no_se_tocan.csv') -NoTypeInformation -Encoding UTF8 -Delimiter ';'
$toCopy | Select-Object PorCopiar, Tamano | Export-Csv -LiteralPath (Join-Path $repDir '1_se_copian_al_NAS.csv') -NoTypeInformation -Encoding UTF8 -Delimiter ';'

$sum = @(
  "Informe $stamp",
  "Disco local: $Src  ($($local.Count) archivos)",
  "NAS:         $Dst  ($($nas.Count) archivos)",
  '',
  ("1. Se copian al NAS (estan en el disco local y faltan en el NAS en ese sitio): {0} archivos, {1}" -f $toCopy.Count, (Size (($toCopy | Measure-Object Bytes -Sum).Sum + 0))),
  ("2. Duplicados antiguos en el NAS (el disco local los tiene organizados en otro sitio): {0} archivos, {1}" -f $moved.Count, (Size (($moved | Measure-Object Bytes -Sum).Sum + 0))),
  "   Se apartan a la carpeta $Quarantine del NAS, no se borran.",
  ("3. Solo en el NAS (no estan en el disco local): {0} archivos, {1}. No se tocan." -f $nasOnly.Count, (Size (($nasOnly | Measure-Object Bytes -Sum).Sum + 0))),
  ("   Iguales en los dos lados: {0} archivos." -f $same),
  '',
  ("Archivos que no se pudieron leer (rutas muy largas o sin permiso): {0}" -f $script:listErrors.Count)
)
$sum | Set-Content -LiteralPath (Join-Path $repDir '0_resumen.txt') -Encoding UTF8
Write-Host ''
$sum | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host "Informe completo (para abrir en Excel) en: $repDir"
Write-Host ''
Write-Host 'Revisa sobre todo la lista 2 (lo que se aparta) y la 3 (lo que solo esta en el NAS) antes de seguir.'
$ans = Read-Host 'Para aplicar los cambios escribe SI (cualquier otra cosa cancela)'
if ($ans -ne 'SI') { Write-Host 'Cancelado. No se cambio nada.'; exit 0 }

# ---- 1. copiar al NAS lo que falta, con la organizacion del disco local
Write-Host ''
Write-Host 'Copiando al NAS lo que falta... (no cierres esta ventana)'
$log = Join-Path $repDir '4_registro_copia.txt'
& robocopy.exe $Src $Dst /E /XO /COPY:DAT /DCOPY:T /R:2 /W:3 /MT:8 /NP /XD '#SynoRecycle' '@eaDir' '.SynologyWorkingDirectory' '#recycle' $Quarantine /XF '~$*' '*.tmp' 'Thumbs.db' 'desktop.ini' /LOG:$log | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "Hubo errores al copiar. Revisa $log. No se aparta nada hasta que la copia salga bien; vuelve a ejecutar."; exit 1 }

# ---- 2. apartar los duplicados antiguos (solo si la version organizada ya esta en el NAS)
Write-Host 'Apartando duplicados antiguos...'
$qRoot = Join-Path $Dst $Quarantine
$done = 0; $skipped = 0; $dirs = New-Object System.Collections.Generic.HashSet[string]
$moveLog = New-Object System.Collections.Generic.List[string]
foreach ($m in $moved) {
  $old = Join-Path $Dst $m.EnElNAS
  $newOk = $false
  foreach ($n in ($m.OrganizadoEn -split ' \| ')) { if (Test-Path -LiteralPath (Join-Path $Dst $n)) { $newOk = $true; break } }
  if (-not $newOk -or -not (Test-Path -LiteralPath $old)) { $skipped++; continue }
  $target = Join-Path $qRoot $m.EnElNAS
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Move-Item -LiteralPath $old -Destination $target
    [void]$dirs.Add((Split-Path -Parent $old))
    $moveLog.Add("$($m.EnElNAS)  ->  $Quarantine\$($m.EnElNAS)")
    $done++
  } catch { $skipped++; $moveLog.Add("NO SE PUDO: $($m.EnElNAS)  ($($_.Exception.Message))") }
}
$moveLog | Set-Content -LiteralPath (Join-Path $repDir '5_registro_apartados.txt') -Encoding UTF8

# ---- 3. quitar carpetas que quedaron vacias (solo vacias de verdad)
$removed = 0
foreach ($d in ($dirs | Sort-Object Length -Descending)) {
  $p = $d
  while ($p -and $p.Length -gt $Dst.Length -and (Test-Path -LiteralPath $p)) {
    if (@(Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item -LiteralPath $p -Force; $removed++; $p = Split-Path -Parent $p }
    else { break }
  }
}

Write-Host ''
Write-Host ("Listo. Apartados: {0}. Sin tocar (la version nueva no estaba o hubo un error): {1}. Carpetas vacias quitadas: {2}." -f $done, $skipped, $removed)
Write-Host "Los duplicados estan en: $qRoot  (revisalos y borralos cuando estes seguro)."
Write-Host "Registros en: $repDir"
