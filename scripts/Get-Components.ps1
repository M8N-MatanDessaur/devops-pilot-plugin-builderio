param([string]$ApiBase = "http://127.0.0.1:3800")

$comps = Invoke-RestMethod "$ApiBase/api/plugins/builderio/repo/components"
if ($comps.error) { Write-Host "`n  Error: $($comps.error)" -ForegroundColor Red; return }
if (-not $comps -or $comps.Count -eq 0) { Write-Host "`n  No component files found. Set Local Repo in Settings.`n" -ForegroundColor Yellow; return }

Write-Host "`n  === Frontend Components ($($comps.Count)) ===" -ForegroundColor Cyan
foreach ($c in $comps) { Write-Host "  $($c.relativePath)" -ForegroundColor White }
Write-Host ""
