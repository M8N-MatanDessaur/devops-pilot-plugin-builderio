param(
  [string]$Issue = "",
  [string]$Model = "",
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$r = Invoke-RestMethod "$ApiBase/api/plugins/builderio/insights"
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }

$c = $r.counts
Write-Host "`n  === Builder.io Insights ===" -ForegroundColor Cyan
Write-Host "  Total entries:    $($c.total)" -ForegroundColor White
Write-Host "  Drafts:           $($c.drafts)" -ForegroundColor Yellow
Write-Host "  Stale (90d+):     $($c.stale)" -ForegroundColor Yellow
Write-Host "  Images w/o alt:   $($c.missingAlt)" -ForegroundColor Yellow
Write-Host "  Missing URL:      $($c.missingUrl)" -ForegroundColor Red
Write-Host "  Duplicate URL:    $($c.duplicateUrl)" -ForegroundColor Red
Write-Host "  Missing fields:   $($c.missingField)" -ForegroundColor Red

$entries = $r.entries
if ($Issue) { $entries = $entries | Where-Object { $_.issues -contains $Issue -or ($_.issues | Where-Object { $_ -like "$Issue*" }) } }
if ($Model) { $entries = $entries | Where-Object { $_.model -eq $Model } }

if ($entries.Count -gt 0) {
  Write-Host "`n  === Affected Entries ($($entries.Count)) ===" -ForegroundColor Cyan
  foreach ($e in $entries | Select-Object -First 50) {
    Write-Host "  - $($e.name) ($($e.model))" -ForegroundColor White
    Write-Host "    issues: $($e.issues -join ', ')" -ForegroundColor DarkGray
  }
  if ($entries.Count -gt 50) { Write-Host "  ... and $($entries.Count - 50) more" -ForegroundColor DarkGray }
}
