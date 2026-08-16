$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distRoot = Join-Path $repoRoot "dist\desktop"
$installer = Get-ChildItem -Path $distRoot -Filter "YardimciAsistan-Setup-*.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "Windows NSIS installer bulunamadı: $distRoot"
}

$runRoot = Join-Path $env:RUNNER_TEMP ("yardimci-asistan-win-smoke-" + [Guid]::NewGuid().ToString("N"))
$installDir = Join-Path $runRoot "app"
$dataDir = Join-Path $runRoot "data"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

Write-Host "Installer: $($installer.FullName)"
Write-Host "Install dir: $installDir"

$install = Start-Process -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($install.ExitCode -ne 0) {
  throw "NSIS sessiz kurulum başarısız. ExitCode=$($install.ExitCode)"
}

$appExe = Get-ChildItem -Path $installDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notmatch "(?i)uninstall|unins" } |
  Sort-Object Length -Descending |
  Select-Object -First 1

if (-not $appExe) {
  throw "Kurulu Yardımcı Asistan EXE dosyası bulunamadı: $installDir"
}

$databasePath = Join-Path $dataDir "yardimci-asistan.sqlite"
$backupPath = Join-Path $dataDir "backups"
$previousDataDir = $env:YA_DESKTOP_DATA_DIR
$previousLogging = $env:ELECTRON_ENABLE_LOGGING
$env:YA_DESKTOP_DATA_DIR = $dataDir
$env:ELECTRON_ENABLE_LOGGING = "1"

$app = $null
try {
  Write-Host "Launching installed app: $($appExe.FullName)"
  $app = Start-Process -FilePath $appExe.FullName -ArgumentList @("--disable-gpu") -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if ($app.HasExited) {
      throw "Kurulu Electron uygulaması erken kapandı. ExitCode=$($app.ExitCode)"
    }
    if ((Test-Path $databasePath) -and (Test-Path $backupPath)) {
      break
    }
    Start-Sleep -Milliseconds 250
  }

  if (-not (Test-Path $databasePath)) {
    throw "Kurulu uygulama ilk veritabanını oluşturmadı: $databasePath"
  }
  if (-not (Test-Path $backupPath)) {
    throw "Kurulu uygulama yedek klasörünü oluşturmadı: $backupPath"
  }

  & node (Join-Path $repoRoot "scripts\smoke-desktop-windows-data.mjs") $dataDir
  if ($LASTEXITCODE -ne 0) {
    throw "Windows ilk açılış veri smoke testi başarısız."
  }
} finally {
  if ($app -and -not $app.HasExited) {
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
  $env:YA_DESKTOP_DATA_DIR = $previousDataDir
  $env:ELECTRON_ENABLE_LOGGING = $previousLogging
}

$uninstaller = Get-ChildItem -Path $installDir -Filter "*.exe" -File |
  Where-Object { $_.Name -match "(?i)uninstall|unins" } |
  Select-Object -First 1
if ($uninstaller) {
  try {
    $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -PassThru
    Write-Host "Uninstaller exit code: $($uninstall.ExitCode)"
  } catch {
    Write-Warning "Smoke sonrası sessiz kaldırma tamamlanamadı: $($_.Exception.Message)"
  }
}

Write-Host "windows-installer-smoke-ok: $($installer.Name)"
