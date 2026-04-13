param(
  [string]$Query = "",
  [int]$Limit = 60,
  [int]$Offset = 0,
  [string]$ApiBase = "http://127.0.0.1:3800"
)

$qs = "limit=$Limit&offset=$Offset"
if ($Query) { $qs += "&query=$([uri]::EscapeDataString($Query))" }
$r = Invoke-RestMethod "$ApiBase/api/plugins/builderio/assets?$qs"
if ($r.error) { Write-Host "  Error: $($r.error)" -ForegroundColor Red; return }

$list = $r.assets
$header = "`n  === Assets (page offset=$Offset, size=$($list.Count))"
if ($r.totalMatches -ne $null) { $header += ", totalMatches=$($r.totalMatches)" }
if ($r.hasMore) { $header += ", hasMore=yes" }
Write-Host "$header ===" -ForegroundColor Cyan

foreach ($a in $list) {
  $dim = if ($a.width -and $a.height) { "$($a.width)x$($a.height)" } else { "-" }
  $size = if ($a.bytes) { "{0:N0}b" -f $a.bytes } else { "-" }
  Write-Host ("  {0,-40} {1,-12} {2,-10} {3}" -f $a.name, $dim, $size, $a.id) -ForegroundColor White
}
if ($r.hasMore) { Write-Host "`n  Next: -Offset $($Offset + $Limit)" -ForegroundColor DarkGray }
