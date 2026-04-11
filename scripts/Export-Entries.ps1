param(
    [Parameter(Mandatory = $true)][string]$Model,
    [string]$OutFile,
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$result = Invoke-RestMethod "$ApiBase/api/plugins/builderio/content/$Model/export" -Method POST
if ($result.error) { Write-Host "`n  Error: $($result.error)" -ForegroundColor Red; return }
$json = $result | ConvertTo-Json -Depth 20
if ($OutFile) { $json | Out-File -FilePath $OutFile -Encoding UTF8; Write-Host "`n  Exported $($result.Count) entries to $OutFile" -ForegroundColor Green }
else { Write-Host "`n  === Export: $Model ($($result.Count) entries) ===`n" -ForegroundColor Cyan; $json | Write-Host }
Write-Host ""
