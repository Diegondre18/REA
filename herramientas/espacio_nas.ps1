# Muestra el espacio total, usado y libre del NAS (tal como lo ve este PC).
param([string]$Share = '\\LAP-NAS\LAP Arquitectura NAS')
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class ReaDisk {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool GetDiskFreeSpaceEx(string dir, out ulong freeForUser, out ulong total, out ulong totalFree);
}
"@
function Size($b) { if ($b -ge 1TB) { '{0:N2} TB' -f ($b / 1TB) } else { '{0:N1} GB' -f ($b / 1GB) } }

Write-Host ''
Write-Host '=================================================='
Write-Host ' Espacio del NAS'
Write-Host '=================================================='
Write-Host " Carpeta: $Share"
Write-Host ''
$free = 0; $total = 0; $totalFree = 0
if (-not [ReaDisk]::GetDiskFreeSpaceEx($Share.TrimEnd('\') + '\', [ref]$free, [ref]$total, [ref]$totalFree)) {
  Write-Host 'No se pudo leer el espacio. Comprueba que este PC abre esa carpeta.'
  exit 1
}
$used = $total - $totalFree
$pct = if ($total) { $used / $total } else { 0 }
$bar = ('#' * [math]::Round($pct * 40)).PadRight(40, '.')
Write-Host (" Total:  {0}" -f (Size $total))
Write-Host (" Usado:  {0}  ({1:P0})" -f (Size $used), $pct)
Write-Host (" Libre:  {0}" -f (Size $free))
Write-Host ''
Write-Host " [$bar]"
Write-Host ''
if ($pct -gt 0.9) { Write-Host ' ATENCION: el NAS esta casi lleno (mas del 90%).' -ForegroundColor Yellow; Write-Host '' }

$ans = Read-Host 'Quieres ver tambien cuanto ocupa cada carpeta principal? Puede tardar varios minutos (S/N)'
if ($ans -eq 'S') {
  Write-Host ''
  Write-Host 'Calculando...'
  $rows = foreach ($d in (Get-ChildItem -LiteralPath $Share -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^(#recycle|@eaDir|#snapshot)$' })) {
    $sum = (Get-ChildItem -LiteralPath $d.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [pscustomobject]@{ Carpeta = $d.Name; Bytes = [double]($sum + 0) }
  }
  Write-Host ''
  foreach ($r in ($rows | Sort-Object Bytes -Descending)) { Write-Host ("  {0,12}   {1}" -f (Size $r.Bytes), $r.Carpeta) }
}
Write-Host ''
Write-Host 'Nota: es el espacio del volumen del NAS donde esta esta carpeta. Si la carpeta tiene una cuota,'
Write-Host 'el limite real puede ser menor (se ve en Synology DSM > Panel de control > Carpeta compartida).'
