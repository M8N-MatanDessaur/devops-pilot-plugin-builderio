param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$body = @{ name = $Name } | ConvertTo-Json
$result = Invoke-RestMethod "$ApiBase/api/plugins/builderio/spaces/active" -Method POST -ContentType "application/json" -Body $body
if ($result.ok) { Write-Host "`n  Switched to space: $($result.activeSpace)" -ForegroundColor Green }
else { Write-Host "`n  Error: $($result.error)" -ForegroundColor Red }
Write-Host ""
