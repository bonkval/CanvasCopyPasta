$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $projectRoot "dist"
$stageRoot = Join-Path $distRoot "canvas-copy-assistant"
$archivePath = Join-Path $distRoot "canvas-copy-assistant-v5.0.0.zip"

if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$files = @("manifest.json", "core.js", "content.js", "service-worker.js", "popup.html", "popup.css", "popup.js", "README.md", "PRIVACY.md", "LICENSE")
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stageRoot }
Copy-Item -LiteralPath (Join-Path $projectRoot "icons") -Destination $stageRoot -Recurse
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output "Created $archivePath"
