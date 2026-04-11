param([string]$ApiBase = "http://127.0.0.1:3800")

$h = Invoke-RestMethod "$ApiBase/api/plugins/builderio/health"
if ($h.error) { Write-Host "`n  Error: $($h.error)" -ForegroundColor Red; return }

Write-Host "`n  === Builder.io Space Health ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray
Write-Host "`n  Models:     $($h.totalModels)" -ForegroundColor White
Write-Host "  Entries:    $($h.totalEntries)" -ForegroundColor Green
Write-Host "  Published:  $($h.totalPublished)" -ForegroundColor Green
Write-Host "  Drafts:     $($h.totalDrafts)" -ForegroundColor $(if ($h.totalDrafts -gt 20) { "Yellow" } else { "White" })

if ($h.repoPath) { Write-Host "`n  Local Repo: $($h.repoPath)" -ForegroundColor DarkGray }
if ($h.previewUrl) { Write-Host "  Preview: $($h.previewUrl)" -ForegroundColor DarkGray }

if ($h.issues -and $h.issues.Count -gt 0) {
    Write-Host "`n  Issues:" -ForegroundColor Yellow
    foreach ($iss in $h.issues) { Write-Host "    - $($iss.message)" -ForegroundColor $(if ($iss.level -eq 'warn') { "Yellow" } else { "DarkGray" }) }
}

Write-Host "`n  Models:" -ForegroundColor White
foreach ($m in $h.models) { Write-Host "    $($m.name) ($($m.kind)): $($m.total) entries ($($m.published) pub, $($m.drafts) draft)" -ForegroundColor DarkGray }
Write-Host ""
