$basePath = "c:\Users\mntiv\Documents\2026 UNI\School Plan\SEMESTER 2\WRRV Project\Flexscibe"

$pages = @(
    @{ html = "pages\reports.html"; js = "scripts\reports.page.js"; key = "reports" },
    @{ html = "pages\settings.html"; js = "scripts\settings.page.js"; key = "settings" }
)

foreach ($page in $pages) {
    $htmlPath = Join-Path $basePath $page.html
    $jsPath = Join-Path $basePath $page.js
    $key = $page.key

    $lines = Get-Content -Path $htmlPath -Encoding UTF8
    $jsLines = [System.Collections.ArrayList]::new()

    foreach ($line in $lines) {
        $escaped = $line -replace '\\', '\\'
        $escaped = $escaped -replace "'", "\'"
        [void]$jsLines.Add("'" + $escaped + "'")
    }

    $header = "window._pageContent = window._pageContent || {};" + "`n"
    $header += "window._pageContent['" + $key + "'] = [" + "`n"
    $body = $jsLines -join ",`n"
    $footer = "`n].join('\n');" + "`n"

    $output = $header + $body + $footer
    [System.IO.File]::WriteAllText($jsPath, $output, [System.Text.Encoding]::UTF8)
    Write-Host "Created: $jsPath"
}
