param(
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$r = Invoke-RestMethod "$ApiBase/api/plugins/builderio/asset-usage?url=$([uri]::EscapeDataString($Url))"
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }

$usages = $r.usages
Write-Host "`n  === Asset Usages ===" -ForegroundColor Cyan
Write-Host "  URL: $Url" -ForegroundColor DarkGray
Write-Host "  Found in: $($usages.Count) entr$(if ($usages.Count -eq 1) { 'y' } else { 'ies' })" -ForegroundColor White
Write-Host ""

foreach ($u in $usages) {
  $altInfo = if ([string]::IsNullOrWhiteSpace($u.altText)) { "MISSING ALT" } else { "alt: $($u.altText)" }
  $altColor = if ([string]::IsNullOrWhiteSpace($u.altText)) { "Red" } else { "Green" }
  Write-Host "  - $($u.entryName) ($($u.model))" -ForegroundColor White
  Write-Host "    $altInfo" -ForegroundColor $altColor
  Write-Host "    entryId: $($u.entryId)" -ForegroundColor DarkGray
}
