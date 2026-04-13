param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Model,
  [Parameter(Mandatory=$true)][string]$EntryId,
  [Parameter(Mandatory=$true)][string]$AltText,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$json = @{ url = $Url; model = $Model; entryId = $EntryId; altText = $AltText } | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Method Patch "$ApiBase/api/plugins/builderio/asset-usage" -ContentType 'application/json' -Body $json
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }
Write-Host "  Updated $($r.updated) location(s) in $Model/$EntryId" -ForegroundColor Green
