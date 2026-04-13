param(
  [switch]$Fix,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

# Lists every asset-usage that has a missing alt text. With -Fix and no prompt,
# this does NOT auto-generate alt text (the user must supply it); it just prints
# ready-to-run Set-EntryAlt commands for each missing one.

$assets = (Invoke-RestMethod "$ApiBase/api/plugins/builderio/assets?limit=500&offset=0").assets
$imgAssets = $assets | Where-Object { $_.type -like 'image/*' }
Write-Host "`n  Scanning $($imgAssets.Count) image asset(s) for missing alt text..." -ForegroundColor Cyan

$missing = @()
foreach ($a in $imgAssets) {
  $u = Invoke-RestMethod "$ApiBase/api/plugins/builderio/asset-usage?url=$([uri]::EscapeDataString($a.url))"
  foreach ($use in $u.usages) {
    if (([string]::IsNullOrWhiteSpace($use.altText))) {
      $missing += [pscustomobject]@{ Asset=$a.name; Url=$a.url; Model=$use.model; EntryId=$use.entryId; EntryName=$use.entryName }
    }
  }
}

if (-not $missing) { Write-Host "  All image usages have alt text." -ForegroundColor Green; return }

Write-Host "`n  Missing alt text in $($missing.Count) location(s):" -ForegroundColor Yellow
foreach ($m in $missing) {
  Write-Host ("  - {0}  ({1}/{2})" -f $m.Asset, $m.Model, $m.EntryName) -ForegroundColor White
  if ($Fix) {
    Write-Host ('    powershell.exe -File ./scripts/Set-EntryAlt.ps1 -Url "{0}" -Model "{1}" -EntryId "{2}" -AltText "<describe image>"' -f $m.Url, $m.Model, $m.EntryId) -ForegroundColor DarkGray
  }
}
