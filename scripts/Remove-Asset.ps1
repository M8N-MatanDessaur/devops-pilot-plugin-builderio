param(
  [Parameter(Mandatory=$true)][string]$Id,
  [switch]$Force,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

if (-not $Force) {
  $ans = Read-Host "Delete asset $Id? (yes/no)"
  if ($ans -ne 'yes') { Write-Host "Cancelled." -ForegroundColor Yellow; return }
}

$r = Invoke-RestMethod -Method Delete "$ApiBase/api/plugins/builderio/assets/$Id"
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }
Write-Host "  Asset deleted: $Id" -ForegroundColor Green
