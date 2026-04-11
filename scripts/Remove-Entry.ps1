param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$Id,
    [switch]$Force,
    [string]$ApiBase = "http://127.0.0.1:3800"
)

if (-not $Force) {
    $confirm = Read-Host "  Delete entry '$Id' from '$Model'? (y/N)"
    if ($confirm -ne 'y') { Write-Host "  Cancelled.`n" -ForegroundColor DarkGray; return }
}
$result = Invoke-RestMethod "$ApiBase/api/plugins/builderio/content/$Model/$Id" -Method DELETE
if ($result.ok) { Write-Host "`n  Deleted entry '$Id'" -ForegroundColor Green }
else { Write-Host "`n  Error: $($result | ConvertTo-Json -Compress)" -ForegroundColor Red }
Write-Host ""
