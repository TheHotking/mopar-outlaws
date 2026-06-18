$dir = $PSScriptRoot
if (-not $dir) { $dir = Get-Location }

$templatePath = "$dir/index.template.html"
$cssPath = "$dir/style.css"
$audioPath = "$dir/audio.js"
$pixelatorPath = "$dir/pixelator.js"
$leaderboardPath = "$dir/leaderboard.js"
$gamePath = "$dir/game.js"
$outputPath = "$dir/index.html"

if (-not (Test-Path $templatePath)) {
    Write-Error "Template file index.template.html not found!"
    exit 1
}

# Read contents using .NET UTF8 encoding (preserves emojis perfectly)
$html = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText($cssPath, [System.Text.Encoding]::UTF8)
$audio = [System.IO.File]::ReadAllText($audioPath, [System.Text.Encoding]::UTF8)
$pixelator = [System.IO.File]::ReadAllText($pixelatorPath, [System.Text.Encoding]::UTF8)
$leaderboard = [System.IO.File]::ReadAllText($leaderboardPath, [System.Text.Encoding]::UTF8)
$game = [System.IO.File]::ReadAllText($gamePath, [System.Text.Encoding]::UTF8)

# Replace placeholders
$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>")
$html = $html.Replace('<script src="audio.js"></script>', "<script>`n$audio`n</script>")
$html = $html.Replace('<script src="pixelator.js"></script>', "<script>`n$pixelator`n</script>")
$html = $html.Replace('<script src="leaderboard.js"></script>', "<script>`n$leaderboard`n</script>")
$html = $html.Replace('<script src="game.js"></script>', "<script>`n$game`n</script>")

# Write to output file using UTF8 without BOM (standard for web)
$utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $html, $utf8NoBOM)

Write-Output "Successfully compiled and bundled single-file website to index.html!"
