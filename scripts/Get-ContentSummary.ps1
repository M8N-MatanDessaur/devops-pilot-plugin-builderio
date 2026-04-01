param(
    [string]$ApiBase = "http://127.0.0.1:3800",
    [string]$Model = ""
)

if (-not $Model) {
    Write-Host "`n  Usage: Get-ContentSummary.ps1 -Model 'model-name'" -ForegroundColor Yellow
    Write-Host "  Run Get-Models.ps1 first to see available models.`n" -ForegroundColor DarkGray
    return
}

$content = Invoke-RestMethod "$ApiBase/api/plugins/builderio/content/$Model"

if (-not $content -or $content.Count -eq 0) {
    Write-Host "`n  No content entries found for model '$Model'.`n" -ForegroundColor Yellow
    return
}

$published = ($content | Where-Object { $_.published -eq 'published' }).Count
$draft = ($content | Where-Object { $_.published -ne 'published' }).Count

Write-Host "`n  === $Model Content Summary ===" -ForegroundColor Cyan
Write-Host "  Total: $($content.Count) | Published: $published | Drafts: $draft" -ForegroundColor DarkGray

$sorted = $content | Sort-Object -Property lastUpdated -Descending

foreach ($entry in $sorted) {
    $status = if ($entry.published -eq 'published') { 'published' } else { 'draft' }
    $statusColor = if ($status -eq 'published') { "Green" } else { "Yellow" }
    $updated = if ($entry.lastUpdated) {
        $date = [DateTimeOffset]::FromUnixTimeMilliseconds($entry.lastUpdated).LocalDateTime
        $date.ToString("MMM dd, yyyy")
    } else { "--" }

    Write-Host "`n  [$status] $($entry.name)" -ForegroundColor $statusColor -NoNewline
    Write-Host "  ($updated)" -ForegroundColor DarkGray

    if ($entry.data) {
        $keys = $entry.data.PSObject.Properties.Name | Select-Object -First 5
        foreach ($k in $keys) {
            $val = $entry.data.$k
            if ($val -is [string]) { $val = $val.Substring(0, [Math]::Min($val.Length, 60)) }
            elseif ($val -ne $null) { $val = ($val | ConvertTo-Json -Compress).Substring(0, [Math]::Min(60, ($val | ConvertTo-Json -Compress).Length)) }
            else { $val = "(empty)" }
            Write-Host "    $k`: $val" -ForegroundColor DarkGray
        }
    }
}

Write-Host "`n"
