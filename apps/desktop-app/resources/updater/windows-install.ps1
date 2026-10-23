# Windows PowerShell 5.1 / WPF, copied from packaged application resources before exit.
# Request values are data only. No generated commands or shell strings.
param([Parameter(Mandatory = $true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
$directory = Split-Path -Parent $PSCommandPath
$session = Split-Path -Leaf $directory
$statusPath = Join-Path $directory 'status.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-JsonAtomic($file, $value) {
    $temp = "$file.$PID.tmp"
    [IO.File]::WriteAllText($temp, ($value | ConvertTo-Json -Depth 5), $utf8)
    if ([IO.File]::Exists($file)) { [IO.File]::Replace($temp, $file, $null) }
    else { [IO.File]::Move($temp, $file) }
}
function Read-Json($file) {
    try { return ([IO.File]::ReadAllText($file) | ConvertFrom-Json) } catch { return $null }
}
function Assert-PlainPath([string]$value) {
    if ($value -notmatch '^[A-Za-z]:\\' -or $value -match '[\x00-\x1f"<>|]' -or $value.Substring(2).Contains(':')) {
        throw 'Geçersiz yerel dosya yolu.'
    }
    $full = [IO.Path]::GetFullPath($value)
    $item = Get-Item -LiteralPath $full -Force
    while ($null -ne $item) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Bağlantılı dosya yolu kullanılamaz.' }
        if ($item -is [IO.FileInfo]) { $item = $item.Directory }
        else { $item = $item.Parent }
    }
    return $full
}
try {
    if ($session -notmatch '^[a-f0-9-]{36}$' -or
        [IO.Path]::GetFullPath($RequestPath) -cne (Join-Path $directory 'request.json')) { throw 'Geçersiz güncelleme isteği.' }
    $request = Read-Json $RequestPath
    if ($request.protocol -ne 1 -or $request.session -cne $session -or
        $request.targetVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$' -or
        $request.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $request.size -le 0 -or
        $request.parentPid -le 0 -or $request.parentPid -eq $PID) { throw 'Güncelleme bilgileri geçersiz.' }
    $updates = Split-Path -Parent (Split-Path -Parent $directory)
    $installerPath = Assert-PlainPath $request.installerPath
    $appPath = Assert-PlainPath $request.appPath
    $expectedDownload = Join-Path (Join-Path $updates 'downloads') ([IO.Path]::GetFileName($installerPath))
    if ($installerPath -ine $expectedDownload -or [IO.Path]::GetFileName($installerPath) -notmatch '^[A-Za-z0-9._-]+\.exe$' -or
        [IO.Path]::GetExtension($appPath) -ine '.exe') { throw 'Güvenli indirme yolu doğrulanamadı.' }
    $parent = Get-Process -Id $request.parentPid
    if ($parent.MainModule.FileName -ine $appPath) { throw 'Güncelleme isteyen uygulama doğrulanamadı.' }
    $null = $parent.Handle # Retain this exact process identity; never kill by PID/name.
    Add-Type -AssemblyName PresentationFramework
    [xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Yardımcı Asistan · Güncelleme" Width="490" SizeToContent="Height"
        WindowStartupLocation="CenterScreen" ResizeMode="CanMinimize" Topmost="True"
        Background="#F5F8FC" Foreground="#172B46" FontFamily="Segoe UI" FontSize="14">
  <StackPanel Margin="30">
    <TextBlock Text="YARDIMCI ASİSTAN" Foreground="#2869B5" FontWeight="SemiBold" FontSize="12" Margin="0,0,0,18"/>
    <TextBlock x:Name="Heading" Text="Güncelleme hazırlanıyor" FontSize="23" FontWeight="SemiBold" TextWrapping="Wrap"/>
    <TextBlock x:Name="Detail" Text="Uygulamanın güvenli biçimde kapanması bekleniyor." TextWrapping="Wrap" Margin="0,14,0,20" LineHeight="22"/>
    <ProgressBar x:Name="Activity" IsIndeterminate="True" Height="5" Foreground="#2869B5" Background="#E2EAF4"/>
    <TextBlock x:Name="Footnote" Text="Bu çubuk etkinliği gösterir; yüzde veya kalan süre bildirmez." Foreground="#54657D" TextWrapping="Wrap" FontSize="12" Margin="0,16,0,12"/>
    <Button x:Name="CloseButton" Content="Kapat" HorizontalAlignment="Right" Padding="20,8" Visibility="Collapsed"/>
  </StackPanel>
</Window>
'@
    $window = [Windows.Markup.XamlReader]::Load((New-Object Xml.XmlNodeReader $xaml))
    $heading = $window.FindName('Heading'); $detail = $window.FindName('Detail')
    $activity = $window.FindName('Activity'); $closeButton = $window.FindName('CloseButton')
    $footnote = $window.FindName('Footnote')
    $script:terminal = $false; $script:worker = $null; $script:operation = $null
    $window.Add_Closing({ param($sender, $event)
        if (-not $script:terminal) {
            $event.Cancel = $true
            $footnote.Text = 'Kurulum sürerken pencere açık kalır. Küçültebilirsiniz; kurucu durdurulmaz.'
        }
    })
    $closeButton.Add_Click({ $window.Close() })

    # A separate in-process runspace keeps WPF responsive during hashing, UAC
    # (Start-Process -Verb RunAs) and slow installation. No executable app locks.
    $work = {
        param($request, $directory, $parent, $installerPath, $appPath)
        $ErrorActionPreference = 'Stop'
        $session = $request.session; $installer = $null; $stream = $null
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        function Read-Json($file) {
            try { return ([IO.File]::ReadAllText($file) | ConvertFrom-Json) } catch { return $null }
        }
        function Status($phase, $message, $outcome = '') {
            $value = @{ session = $session; phase = $phase; message = $message; outcome = $outcome; at = [DateTime]::UtcNow.ToString('o') }
            if ($null -ne $installer) { $value.installerPid = $installer.Id }
            $file = Join-Path $directory 'status.json'; $temp = "$file.worker.tmp"
            [IO.File]::WriteAllText($temp, ($value | ConvertTo-Json), $utf8)
            if ([IO.File]::Exists($file)) { [IO.File]::Replace($temp, $file, $null) }
            else { [IO.File]::Move($temp, $file) }
        }
        function Confirmed {
            $ack = Read-Json (Join-Path $directory 'success.json')
            return ($null -ne $ack -and $ack.session -ceq $session -and $ack.targetVersion -ceq $request.targetVersion)
        }
        try {
            # This worker starts only from ContentRendered. Acknowledging here
            # also proves that its script parsed and initialized successfully.
            Status 'ready' 'Uygulamanın kapanması bekleniyor.'
            $deadline = [DateTime]::UtcNow.AddSeconds(120)
            while ((Read-Json (Join-Path $directory 'proceed.json')).session -cne $session) {
                if ([IO.File]::Exists((Join-Path $directory 'cancel.json')) -or [DateTime]::UtcNow -gt $deadline -or $parent.HasExited) {
                    throw 'Uygulama kuruluma izin vermedi. Kurulum başlatılmadı; uygulamadan tekrar deneyebilirsiniz.'
                }
                Start-Sleep -Milliseconds 250
            }
            Status 'preparing' 'Uygulamanın ve dosya işlemlerinin kapanması bekleniyor.'
            $deadline = [DateTime]::UtcNow.AddMinutes(3)
            while (-not $parent.HasExited) {
                if ([IO.File]::Exists((Join-Path $directory 'cancel.json'))) { throw 'Kurulum isteği geri çekildi. Kurulum başlatılmadı.' }
                if ([DateTime]::UtcNow -gt $deadline) { throw 'Uygulama kapanmadı. Kurulum başlatılmadı; açık işlemlerinizi tamamlayıp tekrar deneyin.' }
                Start-Sleep -Milliseconds 300
            }
            $installRoot = ([IO.Path]::GetDirectoryName($appPath)).TrimEnd('\') + '\'
            do {
                $remaining = @(Get-CimInstance Win32_Process -OperationTimeoutSec 10 | Where-Object {
                    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installRoot, [StringComparison]::OrdinalIgnoreCase)
                })
                if ($remaining.Count -eq 0) { break }
                if ([DateTime]::UtcNow -gt $deadline) { throw 'Başka bir Yardımcı Asistan oturumu açık. Oturumları kapatıp tekrar deneyin. Hiçbir işlem zorla kapatılmadı.' }
                Start-Sleep -Milliseconds 500
            } while ($true)
            # Revalidate under a read lock immediately before elevation. Local
            # request data never becomes a command, and no junction is accepted.
            Status 'preparing' 'Kurulum paketinin bütünlüğü son kez doğrulanıyor. Büyük paketlerde bu işlem zaman alabilir.'
            $stream = [IO.File]::Open($installerPath, 'Open', 'Read', 'Read')
            $hasher = [Security.Cryptography.SHA256]::Create()
            try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
            finally { $hasher.Dispose() }
            if ($stream.Length -ne $request.size -or $hash -cne $request.sha256.ToLowerInvariant()) { throw 'Kurulum paketinin SHA-256 doğrulaması başarısız. Kurulum başlatılmadı.' }
            Status 'permission' 'Windows yönetici izni bekleniyor. İzin penceresini onaylayın; iptal ederseniz güncelleme yapılmaz.'
            # Fixed arguments only. Elevate the verified NSIS executable directly,
            # never elevate PowerShell or execute the installed elevate.exe.
            $installer = Start-Process -FilePath $installerPath -ArgumentList @('--updated', '/S', '--force-run') -Verb RunAs -PassThru -WorkingDirectory $directory
            $null = $installer.Handle
            Status 'installing' 'Windows kurucusu çalışıyor. Yavaş bilgisayarlarda bu işlem uzun sürebilir. Bilgisayarı kapatmayın.'
            $deadline = [DateTime]::UtcNow.AddHours(4)
            while (-not $installer.HasExited) {
                if (Confirmed) { return }
                if ([DateTime]::UtcNow -gt $deadline) {
                    Status 'unverified' 'Kurucu hâlâ çalışıyor; sonuç doğrulanamadı. Kurucu durdurulmadı. İşlem bitene kadar bekleyin; gerekirse destek alın.'
                    return
                }
                Start-Sleep -Milliseconds 500
                $installer.Refresh()
            }
            if ($installer.ExitCode -ne 0) { throw "Windows kurucusu hata ile kapandı (kod $($installer.ExitCode)). Güncelleme doğrulanmadı. Uygulamayı yeniden açarak sonucu kontrol edin." }
            $stream.Dispose(); $stream = $null
            Status 'finishing' 'Kurucu kapandı. Yeni sürümün açılması ve güncellemeyi doğrulaması bekleniyor.'
            $deadline = [DateTime]::UtcNow.AddMinutes(2); $retryAt = [DateTime]::UtcNow.AddSeconds(15); $retried = $false
            while ([DateTime]::UtcNow -lt $deadline) {
                if (Confirmed) { return }
                if (-not $retried -and [DateTime]::UtcNow -ge $retryAt) {
                    $retried = $true
                    # Only after installer exit 0; use the original user's token.
                    Start-Process -FilePath $appPath -ArgumentList @('--updated') -WorkingDirectory $directory | Out-Null
                }
                Start-Sleep -Milliseconds 500
            }
            Status 'unverified' 'Kurucu hata bildirmedi ancak yeni sürümün açılışı doğrulanamadı. Yardımcı Asistan’ı kısayolundan açıp sürümü kontrol edin. Sorun sürerse destek alın.'
        } catch {
            if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223) {
                Status 'error' 'Windows yönetici izni iptal edildi. Güncelleme kurulmadı. Uygulamayı açıp tekrar deneyebilirsiniz.' 'permission-cancelled'
            } else { Status 'error' $_.Exception.Message }
        } finally { if ($null -ne $stream) { $stream.Dispose() } }
    }
    $window.Add_ContentRendered({
        # Readiness means WPF has actually rendered; a spawn event is insufficient.
        try {
            $script:worker = [PowerShell]::Create()
            $null = $script:worker.AddScript($work.ToString()).AddArgument($request).AddArgument($directory).AddArgument($parent).AddArgument($installerPath).AddArgument($appPath)
            $script:operation = $script:worker.BeginInvoke()
        } catch {
            Write-JsonAtomic $statusPath @{ session = $session; phase = 'error'; message = 'Kurulum yardımcısı başlatılamadı. Uygulama açık bırakıldı.' }
        }
    })
    $timer = New-Object Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(300)
    $timer.Add_Tick({
        $ack = Read-Json (Join-Path $directory 'success.json')
        if ($ack.session -ceq $session -and $ack.targetVersion -ceq $request.targetVersion) {
            $script:terminal = $true; $timer.Stop(); $window.Close(); return
        }
        $state = Read-Json $statusPath
        if ($state.session -cne $session) { return }
        $titles = @{ preparing = 'Kapanış bekleniyor'; permission = 'Windows izni bekleniyor'; installing = 'Güncelleme kuruluyor'; finishing = 'Yeni sürüm doğrulanıyor'; error = 'Güncelleme tamamlanamadı'; unverified = 'Sonuç henüz doğrulanamadı' }
        if ($titles.ContainsKey([string]$state.phase)) { $heading.Text = $titles[$state.phase]; $detail.Text = $state.message }
        if ($state.phase -in @('error', 'unverified')) {
            $script:terminal = $true; $timer.Stop(); $activity.Visibility = 'Collapsed'; $closeButton.Visibility = 'Visible'
            $footnote.Text = 'Bu pencereyi kapatmak çalışan kurucuyu durdurmaz.'
            if ($request.backupCreated) { $footnote.Text = 'Güvenlik yedeğiniz korunur. ' + $footnote.Text }
        } elseif ($null -ne $script:operation -and $script:operation.IsCompleted) {
            $script:terminal = $true; $timer.Stop(); $activity.Visibility = 'Collapsed'; $closeButton.Visibility = 'Visible'
            $heading.Text = 'Sonuç doğrulanamadı'; $detail.Text = 'Kurulum yardımcısı durdu. Uygulamayı yeniden açarak güncelleme durumunu kontrol edin.'
            Write-JsonAtomic $statusPath @{ session = $session; phase = 'unverified'; installerPid = $state.installerPid }
        }
    })
    $timer.Start()
    $null = $window.ShowDialog()
    $timer.Stop()
    if ($null -ne $script:worker -and $script:operation.IsCompleted) { $script:worker.Dispose() }
} catch {
    try { Write-JsonAtomic $statusPath @{ session = $session; phase = 'error' } } catch {}
    # The original app requires the rendered-ready handshake and shows an explicit
    # native error if WPF/PowerShell is unavailable. Never fall back to hidden /S.
    exit 1
}
