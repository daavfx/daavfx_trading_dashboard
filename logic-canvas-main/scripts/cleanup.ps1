param(
  [ValidateSet('safe', 'deep')]
  [string]$Mode = 'safe',
  [switch]$WhatIf
)

$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptsDir

$relativePaths = @(
  'src-tauri\target',
  'dist',
  '.vite',
  '.turbo',
  '.cache',
  'coverage'
)

if ($Mode -eq 'deep') {
  $relativePaths += 'node_modules'
}

"Project: $projectDir"
"Mode: $Mode"

foreach ($rel in $relativePaths) {
  $path = Join-Path $projectDir $rel
  if (Test-Path -LiteralPath $path) {
    if ($WhatIf) {
      "Would remove: $path"
    } else {
      "Removing: $path"
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($WhatIf) {
  "Dry run complete."
} else {
  "Cleanup complete."
}
