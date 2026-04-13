param(
  [string]$Query = "",
  [int]$Max = 5000,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$qs = "max=$Max"
if ($Query) { $qs += "&query=$([uri]::EscapeDataString($Query))" }
$r = Invoke-RestMethod "$ApiBase/api/plugins/builderio/assets?$qs"
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }

$assets = $r.assets
Write-Host "`n  === Builder.io Assets ===" -ForegroundColor Cyan
Write-Host "  Total fetched: $($assets.Count)" -ForegroundColor DarkGray
if ($Query) { Write-Host "  Filter: $Query" -ForegroundColor DarkGray }
Write-Host ""

$assets | ForEach-Object {
  $dim = if ($_.width -and $_.height) { "$($_.width)x$($_.height)" } else { "n/a" }
  $sz = if ($_.bytes -lt 1024) { "$($_.bytes) B" }
        elseif ($_.bytes -lt 1048576) { "{0:N1} KB" -f ($_.bytes/1024) }
        else { "{0:N1} MB" -f ($_.bytes/1048576) }
  Write-Host ("  {0,-40} {1,-12} {2,-10} {3}" -f $_.name.Substring(0,[Math]::Min(40,$_.name.Length)), $dim, $sz, $_.id) -ForegroundColor White
}
