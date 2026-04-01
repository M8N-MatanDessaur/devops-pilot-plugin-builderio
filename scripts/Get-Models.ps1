param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$models = Invoke-RestMethod "$ApiBase/api/plugins/builderio/models"

if (-not $models -or $models.Count -eq 0) {
    Write-Host "`n  No models found. Check Builder.io connection in Settings > Plugins.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Builder.io Models ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

foreach ($m in $models) {
    $kindColor = switch ($m.kind) {
        "page" { "Blue" }
        "component" { "Magenta" }
        "data" { "Cyan" }
        "section" { "Yellow" }
        default { "White" }
    }
    Write-Host "`n  [$($m.kind.ToUpper())] $($m.name)" -ForegroundColor $kindColor
    Write-Host "    Fields: $($m.fieldCount) | ID: $($m.id)" -ForegroundColor DarkGray
    if ($m.fields -and $m.fields.Count -gt 0) {
        $fieldList = ($m.fields | ForEach-Object { "$($_.name):$($_.type)" }) -join ", "
        Write-Host "    Schema: $fieldList" -ForegroundColor DarkGray
    }
}

Write-Host "`n  Total: $($models.Count) models`n" -ForegroundColor DarkGray
