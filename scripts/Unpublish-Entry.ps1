param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$Id,
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$result = Invoke-RestMethod "$ApiBase/api/plugins/builderio/content/$Model/$Id/unpublish" -Method POST
if ($result.ok) { Write-Host "`n  Unpublished entry '$Id' in '$Model'" -ForegroundColor Green }
else { Write-Host "`n  Error: $($result.error)" -ForegroundColor Red }
Write-Host ""
