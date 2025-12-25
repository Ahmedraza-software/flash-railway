# Fix Antd deprecation warnings

$srcPath = "src"

# Fix valueStyle -> styles.content in Statistic components
Get-ChildItem -Path $srcPath -Filter "*.tsx" -Recurse | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $originalContent = $content
    
    # Replace valueStyle with styles.content
    $content = $content -replace 'valueStyle=\{([^}]+)\}', 'styles={{ content: $1 }}'
    
    if ($content -ne $originalContent) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Fixed valueStyle in: $($_.Name)"
    }
}

Write-Host "`nDone! Please review the changes."
