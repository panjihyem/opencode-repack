[CmdletBinding()]
param([switch]$SelfCheck)

# N-08/N-09: uji manajemen proses bridge (run/stop/autostart) memakai bridge STUB.
# Tidak ada token, jaringan, atau Telegram. Stub hanya proses yang tidur, sehingga
# jalur start/detect/stop/autostart dapat dibuktikan tanpa kanal nyata.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$hub = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$pass = 0
$failures = New-Object System.Collections.Generic.List[string]

function Read-Shared([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  try {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try { $reader = New-Object IO.StreamReader($stream); return $reader.ReadToEnd() } finally { $stream.Dispose() }
  } catch { return '' }
}

function Invoke-Ps([string[]]$Arguments, [string]$LocalAppData) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $old = $env:LOCALAPPDATA
  $outFile = Join-Path ([IO.Path]::GetTempPath()) ("bridge-out-" + [Guid]::NewGuid().ToString('N') + '.txt')
  $errFile = "$outFile.err"
  try {
    $env:LOCALAPPDATA = $LocalAppData
    # Tanpa -Wait: -Wait menunggu seluruh pohon proses, termasuk bridge anak yang
    # memegang handle redirect, sehingga pemanggilan kedua bisa menggantung.
    $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $hub + '"')) + $Arguments) -PassThru -WindowStyle Hidden -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $proc.WaitForExit(60000)) { try { Stop-Process -Id $proc.Id -Force } catch { } }
    $stdout = Read-Shared $outFile
    $stderr = Read-Shared $errFile
    # Start-Process -PassThru dengan redirect tidak selalu mengisi ExitCode; pakai
    # sinyal isi keluaran agar tidak salah melaporkan kegagalan.
    $exitCode = $null
    try { if ($proc.HasExited) { $exitCode = $proc.ExitCode } } catch { }
    if ($null -eq $exitCode) { $exitCode = $(if ($stdout.Trim()) { 0 } else { 1 }) }
    return [pscustomobject]@{ code = $exitCode; text = ($stdout + ' ' + $stderr).Trim(); stdout = $stdout.Trim() }
  } finally {
    $env:LOCALAPPDATA = $old
    $ErrorActionPreference = $previous
    Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

function Check([string]$Name, [scriptblock]$Body) {
  try {
    if (& $Body) { $script:pass++; Write-Output "PASS $Name" }
    else { $failures.Add($Name); Write-Output "FAIL $Name" }
  } catch {
    $failures.Add("$Name ($($_.Exception.Message))")
    Write-Output "FAIL $Name ($($_.Exception.Message))"
  }
}

if (-not $SelfCheck) { [Console]::Error.WriteLine('Pemakaian: -SelfCheck'); exit 1 }

$temp = Join-Path ([IO.Path]::GetTempPath()) ('bridge-' + [Guid]::NewGuid().ToString('N'))
$startupBackup = $null
$startupDir = Join-Path ([Environment]::GetFolderPath('Startup')) 'HyperHub'
try {
  [void][IO.Directory]::CreateDirectory($temp)
  $root = Join-Path $temp 'local'
  $telegram = Join-Path $root 'HyperHub\remote-telegram'
  [void][IO.Directory]::CreateDirectory((Join-Path $telegram 'dist'))

  # Stub bridge: proses tidur 120 detik; cwd di folder kanal agar terdeteksi.
  $stub = Join-Path $telegram 'dist\index.js'
  [IO.File]::WriteAllText($stub, 'setTimeout(() => {}, 120000)', $utf8)
  [IO.File]::WriteAllText((Join-Path $telegram '.env'), "TELEGRAM_BOT_TOKEN=000000000:stub-token-for-test-only`nTELEGRAM_ALLOWED_USERS=123456789`n", $utf8)

  Check 'run tanpa bridge terpasang ditolak' {
    $emptyRoot = Join-Path $temp 'empty'
    $empty = Join-Path $emptyRoot 'HyperHub\remote-telegram'
    [void][IO.Directory]::CreateDirectory($empty)
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'run') $emptyRoot
    $r.code -ne 0 -and $r.text -match 'Bridge belum dibangun'
  }

  Check 'run menolak bila allowlist kosong' {
    $noAcl = Join-Path $temp 'noacl'
    $dir = Join-Path $noAcl 'HyperHub\remote-telegram'
    [void][IO.Directory]::CreateDirectory((Join-Path $dir 'dist'))
    [IO.File]::WriteAllText((Join-Path $dir 'dist\index.js'), 'setTimeout(() => {}, 1000)', $utf8)
    [IO.File]::WriteAllText((Join-Path $dir '.env'), "TELEGRAM_BOT_TOKEN=000000000:stub`n", $utf8)
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'run') $noAcl
    $r.code -ne 0 -and $r.text -match 'Allowlist kosong'
  }

  Check 'autostart membuat satu entri startup untuk kanal' {
    if (Test-Path $startupDir) { $script:startupBackup = Join-Path $temp 'startup-backup'; Copy-Item $startupDir $startupBackup -Recurse -Force; Remove-Item $startupDir -Recurse -Force }
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'run', '-Reset') $root
    $json = $r.stdout | ConvertFrom-Json
    $entry = Join-Path $startupDir 'bridge-telegram.cmd'
    $r.code -eq 0 -and $json.autostart -eq $true -and (Test-Path $entry) -and ((Get-Content $entry -Raw) -match 'remote -Channel telegram -Sub run')
  }

  Check 'autostart idempoten (tidak menduplikasi)' {
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'run', '-Reset') $root
    $files = @(Get-ChildItem $startupDir -File)
    $r.code -eq 0 -and $files.Count -eq 1
  }

  Check 'run memulai bridge dan mendeteksi proses hidup' {
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'run') $root
    $json = $r.stdout | ConvertFrom-Json
    if ($r.code -ne 0) { return $false }
    $json.started -eq $true -and $json.running -eq $true -and $json.pid -gt 0
  }

  Check 'run kedua tidak memulai proses duplikat' {
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'run') $root
    $json = $r.stdout | ConvertFrom-Json
    $json.running -eq $true -and $json.note -eq 'sudah berjalan'
  }

  Check 'stop menghentikan proses bridge' {
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'stop') $root
    $json = $r.stdout | ConvertFrom-Json
    Start-Sleep -Milliseconds 800
    $left = @(Get-CimInstance Win32_Process -Filter "Name='bun.exe' OR Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$telegram*" })
    $r.code -eq 0 -and $json.stopped -ge 1 -and $left.Count -eq 0
  }

  Check 'stop saat tidak ada proses tidak error' {
    $r = Invoke-Ps @('remote', '-Channel', 'telegram', '-Sub', 'stop') $root
    $r.code -eq 0 -and (($r.text | ConvertFrom-Json).stopped -eq 0)
  }
}
finally {
  # Bersihkan proses stub yang mungkin tertinggal.
  Get-CimInstance Win32_Process -Filter "Name='bun.exe' OR Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$temp*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
  if (Test-Path $startupDir) { Remove-Item $startupDir -Recurse -Force -ErrorAction SilentlyContinue }
  if ($null -ne $startupBackup -and (Test-Path $startupBackup)) { Copy-Item $startupBackup $startupDir -Recurse -Force }
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output "$pass lulus, $($failures.Count) gagal"
if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine("GAGAL: $_") }; exit 1 }
Write-Output 'Bridge run/stop self-check passed.'
exit 0
