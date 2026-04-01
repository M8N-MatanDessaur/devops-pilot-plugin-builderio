param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$cfg = Invoke-RestMethod "$ApiBase/api/plugins/builderio/config"

if (-not $cfg.configured) {
    Write-Host "`n  Builder.io not configured. Add API keys in Settings > Plugins.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Builder.io Space Overview ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

$models = Invoke-RestMethod "$ApiBase/api/plugins/builderio/models"
if (-not $models) { $models = @() }

$totalEntries = 0
$totalPub = 0
$totalDraft = 0

foreach ($m in $models) {
    try {
        $content = Invoke-RestMethod "$ApiBase/api/plugins/builderio/content/$($m.name)?limit=100"
        if (-not $content) { $content = @() }
    } catch { $content = @() }

    $pub = ($content | Where-Object { $_.published -eq 'published' }).Count
    $draft = $content.Count - $pub
    $totalEntries += $content.Count
    $totalPub += $pub
    $totalDraft += $draft

    $kindColor = switch ($m.kind) {
        "page" { "Blue" }
        "data" { "Cyan" }
        "component" { "Magenta" }
        default { "White" }
    }

    Write-Host "`n  $($m.name)" -ForegroundColor $kindColor -NoNewline
    Write-Host " ($($m.kind), $($m.fieldCount) fields)" -ForegroundColor DarkGray
    Write-Host "    Entries: $($content.Count) | Published: $pub | Drafts: $draft" -ForegroundColor DarkGray
}

Write-Host "`n  ─────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Models: $($models.Count) | Entries: $totalEntries | Published: $totalPub | Drafts: $totalDraft" -ForegroundColor White
Write-Host ""
