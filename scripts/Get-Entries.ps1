param(
    [Parameter(Mandatory = $true)][string]$Model,
    [int]$Limit = 20,
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$entries = Invoke-RestMethod "$ApiBase/api/plugins/builderio/content/$Model`?limit=$Limit"
if (-not $entries -or $entries.Count -eq 0) { Write-Host "`n  No entries found for model '$Model'.`n" -ForegroundColor Yellow; return }

Write-Host "`n  === $Model Entries ($($entries.Count)) ===" -ForegroundColor Cyan
foreach ($e in $entries) {
    $status = if ($e.published -eq 'published') { "PUB" } else { "DRF" }
    $color = if ($e.published -eq 'published') { "Green" } else { "Yellow" }
    $updated = if ($e.lastUpdated) { ([datetime]$e.lastUpdated).ToString("MMM dd, yyyy") } else { "--" }
    Write-Host "`n  [$status] $($e.name)" -ForegroundColor $color -NoNewline
    Write-Host "  $updated" -ForegroundColor DarkGray
    Write-Host "    ID: $($e.id)" -ForegroundColor DarkGray
    if ($e.data) {
        $keys = $e.data.PSObject.Properties.Name | Select-Object -First 4
        foreach ($k in $keys) {
            $val = $e.data.$k
            if ($val -is [string]) { $val = $val.Substring(0, [Math]::Min($val.Length, 50)) }
            elseif ($val -ne $null) { $val = "(object)" }
            else { $val = "(empty)" }
            Write-Host "    $k`: $val" -ForegroundColor DarkGray
        }
    }
}
Write-Host ""
