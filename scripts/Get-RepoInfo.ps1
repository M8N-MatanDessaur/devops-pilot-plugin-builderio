param([string]$ApiBase = "http://127.0.0.1:3800")

$info = Invoke-RestMethod "$ApiBase/api/plugins/builderio/repo/info"
if ($info.error) { Write-Host "`n  Error: $($info.error)" -ForegroundColor Red; return }

Write-Host "`n  === Local Repo Info ===" -ForegroundColor Cyan
Write-Host "  Path:       $($info.repoPath)" -ForegroundColor White
Write-Host "  Framework:  $($info.framework)" -ForegroundColor White
Write-Host "  package.json: $($info.hasPackageJson)" -ForegroundColor DarkGray
Write-Host ""
