param(
  [Parameter(Mandatory=$true)][string]$Model,
  [Parameter(Mandatory=$true)][string]$EntryId,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$qs = "model=$([uri]::EscapeDataString($Model))&entryId=$([uri]::EscapeDataString($EntryId))"
$r = Invoke-RestMethod "$ApiBase/api/plugins/builderio/preview-url?$qs"
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }

Write-Host "`n  === Preview URLs ===" -ForegroundColor Cyan
Write-Host "  Model: $Model   Entry: $EntryId" -ForegroundColor DarkGray
Write-Host "  Source: $(if ($r.hasScript) { 'Dynamic script (editingUrlLogic)' } else { 'examplePageUrl fallback' })" -ForegroundColor DarkGray
Write-Host ""

if (-not $r.urls -or $r.urls.Count -eq 0) { Write-Host "  No URLs resolved." -ForegroundColor Yellow; return }
foreach ($u in $r.urls) {
  $loc = if ($u.locale) { "[$($u.locale)]" } else { "[default]" }
  Write-Host ("  {0,-12} {1}" -f $loc, $u.url) -ForegroundColor White
}
