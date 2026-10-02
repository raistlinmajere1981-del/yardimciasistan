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
$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$installAclRestricted = $false

function Protect-InstallDirectory {
  Write-Host "Install dir yazma koruması uygulanıyor: $currentIdentity"
  & icacls.exe $installDir /deny "${currentIdentity}:(OI)(CI)W" | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Install dir ACL yazma koruması uygulanamadı. ExitCode=$LASTEXITCODE"
  }
  $script:installAclRestricted = $true

  $probe = Join-Path $installDir ".yardimci-write-probe"
  $writeBlocked = $false
  try {
    [System.IO.File]::WriteAllText($probe, "write-must-fail")
  } catch {
    $writeBlocked = $true
  } finally {
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
  }
  if (-not $writeBlocked) {
    throw "Install dir yazılabilir kaldı; Program Files yetki modeli smoke tarafından taklit edilemedi."
  }
  Write-Host "Install dir yazma denemesi beklendiği gibi engellendi."
}

function Restore-InstallDirectoryAcl {
  if (-not $script:installAclRestricted) {
    return
  }
  & icacls.exe $installDir /remove:d $currentIdentity /T /C | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Install dir ACL geri yükleme tamamlanamadı. ExitCode=$LASTEXITCODE"
  }
  $script:installAclRestricted = $false
}

$previousDataDir = $env:YA_DESKTOP_DATA_DIR
$previousBackupDir = $env:YA_DESKTOP_BACKUP_DIR
$previousLogging = $env:ELECTRON_ENABLE_LOGGING
$env:YA_DESKTOP_DATA_DIR = $dataDir
Remove-Item Env:YA_DESKTOP_BACKUP_DIR -ErrorAction SilentlyContinue
$env:ELECTRON_ENABLE_LOGGING = "1"

$app = $null
try {
  Protect-InstallDirectory

  Write-Host "Launching installed app with read-only install dir: $($appExe.FullName)"
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
    throw "Kurulu uygulama kullanıcı veri kökünde yedek klasörünü oluşturmadı: $backupPath"
  }
  if ((Test-Path (Join-Path $installDir "backup")) -or (Test-Path (Join-Path $installDir "backups"))) {
    throw "Kurulu uygulama install dir içine yazılabilir yedek alanı oluşturmaya çalıştı."
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
  Restore-InstallDirectoryAcl

  if ($null -eq $previousDataDir) { Remove-Item Env:YA_DESKTOP_DATA_DIR -ErrorAction SilentlyContinue }
  else { $env:YA_DESKTOP_DATA_DIR = $previousDataDir }

  if ($null -eq $previousBackupDir) { Remove-Item Env:YA_DESKTOP_BACKUP_DIR -ErrorAction SilentlyContinue }
  else { $env:YA_DESKTOP_BACKUP_DIR = $previousBackupDir }

  if ($null -eq $previousLogging) { Remove-Item Env:ELECTRON_ENABLE_LOGGING -ErrorAction SilentlyContinue }
  else { $env:ELECTRON_ENABLE_LOGGING = $previousLogging }
}

$updatesRoot = Join-Path $dataDir "updates"
$downloadsRoot = Join-Path $updatesRoot "downloads"
$lockedInstaller = Join-Path $downloadsRoot "locked-installer.exe"
New-Item -ItemType Directory -Path $downloadsRoot -Force | Out-Null
Set-Content -Path (Join-Path $updatesRoot "pending.json") -Value '{"version":1}' -Encoding utf8
Set-Content -Path (Join-Path $updatesRoot "installing.json") -Value '{"version":1}' -Encoding utf8
[System.IO.File]::WriteAllText($lockedInstaller, "locked-installer")

Write-Host "Testing clean-start with Windows FileShare.None installer lock"
$lockHandle = [System.IO.File]::Open(
  $lockedInstaller,
  [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read,
  [System.IO.FileShare]::None
)
try {
  & node (Join-Path $repoRoot "scripts\smoke-desktop-windows-data.mjs") $dataDir "--locked-cleanup"
  if ($LASTEXITCODE -ne 0) {
    throw "Windows kilitli clean-start transient smoke testi başarısız."
  }
} finally {
  $lockHandle.Dispose()
}

& node (Join-Path $repoRoot "scripts\smoke-desktop-windows-data.mjs") $dataDir "--cleanup-after-unlock"
if ($LASTEXITCODE -ne 0) {
  throw "Windows kilit bırakıldıktan sonraki clean-start cleanup testi başarısız."
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
