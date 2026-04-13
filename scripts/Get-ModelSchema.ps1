param(
  [Parameter(Mandatory=$true)][string]$Name,
  [switch]$Json,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$models = Invoke-RestMethod "$ApiBase/api/plugins/builderio/models"
$m = $models | Where-Object { $_.name -eq $Name } | Select-Object -First 1
if (-not $m) { Write-Host "  Model '$Name' not found" -ForegroundColor Red; return }

$full = Invoke-RestMethod "$ApiBase/api/plugins/builderio/models/$($m.id)"
if ($full.error) { Write-Host "  Error: $($full.error)" -ForegroundColor Red; return }

if ($Json) { $full | ConvertTo-Json -Depth 20; return }

Write-Host "`n  === Model: $($full.name) ===" -ForegroundColor Cyan
Write-Host "  Kind: $($full.kind)" -ForegroundColor DarkGray
Write-Host "  Fields: $($full.fields.Count)" -ForegroundColor DarkGray
Write-Host ""
foreach ($f in $full.fields) {
  $flags = @()
  if ($f.required) { $flags += 'required' }
  if ($f.localized) { $flags += 'localized' }
  $flagStr = if ($flags.Count) { " [$($flags -join ', ')]" } else { "" }
  Write-Host ("  - {0,-25} {1}{2}" -f $f.name, $f.type, $flagStr) -ForegroundColor White
}
Write-Host "`n  (Pass -Json to get the full schema as JSON)" -ForegroundColor DarkGray
