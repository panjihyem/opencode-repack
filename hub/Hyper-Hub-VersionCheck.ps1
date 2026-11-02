[CmdletBinding()]
param(
  [switch]$SelfCheck,
  [string[]]$ProcessName,
  [string]$ServiceCommandPattern = '\bserve\s+--service(?:\s|$)'
)

$ErrorActionPreference = 'Stop'

# Kontrak: skrip ini TIDAK melakukan request HTTP. Versi server dibuktikan lewat <exe> --version (proses lokal), bukan HTTP.

function Get-FolderVersion([string]$Path) {
  # Versi dari nama folder instalasi (mis. cli/2.1.10-x64), bukan isi biner dan bukan server.
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  $normalized = $Path -replace '\\', '/'
  $segments = @($normalized.Split('/') | Where-Object { $_ -ne '' })
  for ($i = 0; $i -lt $segments.Count; $i++) {
    if ($segments[$i] -match '^(\d+\.\d+\.\d+)(?:-([A-Za-z0-9_]+))?(?:[-+][A-Za-z0-9._-]+)?$') {
      $version = $Matches[1]
      $arch = $Matches[2]
      if ($arch -notmatch '^(x64|x86|arm64|ia32)$') { $arch = $null }
      return New-Object PSObject -Property @{ version = $version; architecture = $arch; source = 'folder-name' }
    }
  }
  return $null
}

function Get-HyperAiInstalledVersion([string]$VersionFile) {
  # resources/opencode-cli.version = versi CLI terpasang untuk Hyper AI. Bukan versi server.
  if (-not [System.IO.File]::Exists($VersionFile)) { return $null }
  $raw = [System.IO.File]::ReadAllText($VersionFile).Trim()
  if ($raw -notmatch '^\d+\.\d+\.\d+$') { return $null }
  return $raw
}

function Get-ExecutableVersion([string]$Path) {
  # Versi dari keluaran `<exe> --version`. Tanpa HTTP, tanpa auth, tanpa menulis apa pun.
  if ([string]::IsNullOrWhiteSpace($Path) -or -not [System.IO.File]::Exists($Path)) { return $null }
  $out = & $Path --version 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $text = ([string]($out | Select-Object -First 1)).Trim()
  if ($text -notmatch '(\d+\.\d+\.\d+)') { return $null }
  return [pscustomobject]@{ version = $Matches[1]; raw = $text }
}

function Get-ServiceMap($Processes, $Listeners, [string]$Pattern) {
  $found = @()
  foreach ($process in @($Processes)) {
    $commandLine = [string]$process.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) { continue }
    if ($commandLine -notmatch $Pattern) { continue }
    $executable = [string]$process.ExecutablePath
    $folder = Get-FolderVersion $executable
    $versionFile = $null
    if ($executable) {
      $candidate = Join-Path (Split-Path -Parent $executable) 'opencode-cli.version'
      if ([System.IO.File]::Exists($candidate)) { $versionFile = Get-HyperAiInstalledVersion $candidate }
    }
    $installed = $null
    if ($null -ne $folder) { $installed = $folder.version }
    $exeVersion = Get-ExecutableVersion $executable
    foreach ($listener in @($Listeners | Where-Object { $_.OwningProcess -eq $process.ProcessId })) {
      $found += [pscustomobject]@{
        address = [string]$listener.LocalAddress
        port = [int]$listener.LocalPort
        processId = [int]$process.ProcessId
        process = [string]$process.Name
        executable = $executable
        installedVersion = $installed
        installedVersionSource = $(if ($null -ne $installed) { 'folder-name' } else { $null })
        hyperAiVersionFileVersion = $versionFile
        serverVersion = $(if ($null -ne $exeVersion) { $exeVersion.version } else { $null })
        serverVersionProof = $(if ($null -ne $exeVersion) { 'executable---version' } else { 'none' })
        authChecked = $false
        httpRequests = 0
        readOnly = $true
      }
    }
  }
  return $found
}

function Invoke-LiveScan {
  $names = @('opencode-cli.exe', 'Hyper AI.exe')
  if ($null -ne $ProcessName) { $names = @($ProcessName) }
  $filter = ($names | ForEach-Object { "Name='$_'" }) -join ' OR '
  $processes = @(Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue)
  $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1') })
  $services = @(Get-ServiceMap -Processes $processes -Listeners $listeners -Pattern $ServiceCommandPattern)

  # Laporkan versi terpasang Hyper AI (folder cli/ + resources/opencode-cli.version), bukan versi server.
  $hyperAiRoots = @('D:\Hyper AI\Engine', (Join-Path $env:LOCALAPPDATA 'Programs\Hyper AI'))
  $hyperAiInstalls = @()
  foreach ($rootPath in $hyperAiRoots) {
    $cliDir = Join-Path $rootPath 'cli'
    if ([System.IO.Directory]::Exists($cliDir)) {
      foreach ($dir in @(Get-ChildItem -LiteralPath $cliDir -Directory)) {
        $parsed = Get-FolderVersion (Join-Path $dir.FullName 'opencode-cli.exe')
        $hyperAiInstalls += New-Object PSObject -Property @{
          root = $rootPath
          cliFolder = $dir.FullName
          installedVersion = $(if ($null -ne $parsed) { $parsed.version } else { $null })
          installedVersionSource = 'folder-name'
        }
      }
    }
    $versionFile = Join-Path $rootPath 'resources\opencode-cli.version'
    if ([System.IO.File]::Exists($versionFile)) {
      $hyperAiInstalls += New-Object PSObject -Property @{
        root = $rootPath
        cliFolder = $null
        installedVersion = Get-HyperAiInstalledVersion $versionFile
        installedVersionSource = 'version-file'
      }
    }
  }

  [pscustomobject]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    mode = 'live'
    httpRequests = 0
    versionSource = 'folder-name-and-version-file'
    hyperAiInstalled = @($hyperAiInstalls)
    services = @($services)
    unresolved = @('serverVersion: dibuktikan lewat executable --version; kesetaraan dengan endpoint HTTP belum diuji tanpa kredensial')
  }
}

function Invoke-SelfCheck {
  $failures = New-Object System.Collections.ArrayList
  function Add-Failure([string]$Message) { [void]$script:selfCheckFailures.Add($Message) }
  $script:selfCheckFailures = $failures

  $v = Get-FolderVersion 'C:\Users\x\AppData\Roaming\ai.opencode.desktop\cli\2.2.5-x64\opencode-cli.exe'
  if ($v.version -cne '2.2.5') { Add-Failure "folderVersion expected=2.2.5 actual=$($v.version)" }
  if ($v.architecture -cne 'x64') { Add-Failure "folderArch expected=x64 actual=$($v.architecture)" }
  if ($v.source -cne 'folder-name') { Add-Failure "folderSource expected=folder-name actual=$($v.source)" }
  $expected = [ordered]@{
    'noVersionInFolder'     = Get-FolderVersion 'D:\Hyper AI\Engine\resources\opencode-cli.exe'
    'emptyPath'             = Get-FolderVersion ''
    'noVersionSegment'      = Get-FolderVersion 'C:\Users\x\opencode-cli.exe'
    'twoSegmentNotVersion'  = Get-FolderVersion 'D:\a\1.2\cli\b.exe'
  }
  foreach ($key in $expected.Keys) {
    if ($null -ne $expected[$key]) { Add-Failure "$key expected=null actual=$($expected[$key])" }
  }
  $arm = Get-FolderVersion 'D:\apps\2.1.10-arm64\bin\cli.exe'
  if ($arm.architecture -cne 'arm64') { Add-Failure "arm64 expected=arm64 actual=$($arm.architecture)" }

  $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("hh-ver-" + [Guid]::NewGuid().ToString('N'))
  try {
    [System.IO.File]::WriteAllText($tempFile, "2.1.10`n")
    $parsed = Get-HyperAiInstalledVersion $tempFile
    if ($parsed -cne '2.1.10') { Add-Failure "versionFile expected=2.1.10 actual=$parsed" }
    [System.IO.File]::WriteAllText($tempFile, 'v2.1.10-beta')
    $invalid = Get-HyperAiInstalledVersion $tempFile
    if ($null -ne $invalid) { Add-Failure "versionFileInvalid expected=null actual=$invalid" }
    [System.IO.File]::Delete($tempFile)
    $missing = Get-HyperAiInstalledVersion $tempFile
    if ($null -ne $missing) { Add-Failure "versionFileMissing expected=null actual=$missing" }
  } finally {
    if ([System.IO.File]::Exists($tempFile)) { [System.IO.File]::Delete($tempFile) }
  }

  $syntheticProcesses = @(
    [pscustomobject]@{ ProcessId = 18912; Name = 'opencode-cli.exe'; ExecutablePath = 'C:\Users\<user>\AppData\Roaming\ai.opencode.desktop\cli\2.1.10-x64\opencode-cli.exe'; CommandLine = 'C:\Users\<user>\AppData\Roaming\ai.opencode.desktop\cli\2.1.10-x64\opencode-cli.exe serve --service' }
    [pscustomobject]@{ ProcessId = 4001; Name = 'opencode-cli.exe'; ExecutablePath = 'C:\x\cli\2.1.10-x64\opencode-cli.exe'; CommandLine = 'C:\x\cli\2.1.10-x64\opencode-cli.exe run' }
    [pscustomobject]@{ ProcessId = 4002; Name = 'Hyper AI.exe'; ExecutablePath = 'D:\Hyper AI\Engine\Hyper AI.exe'; CommandLine = '"D:\Hyper AI\Engine\Hyper AI.exe"' }
  )
  $syntheticListeners = @(
    [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 28894; OwningProcess = 18912 }
    [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 64647; OwningProcess = 4242 }
    [pscustomobject]@{ LocalAddress = '::1'; LocalPort = 27275; OwningProcess = 18912 }
    [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 9999; OwningProcess = 4001 }
  )
  $map = @(Get-ServiceMap -Processes $syntheticProcesses -Listeners $syntheticListeners -Pattern '\bserve\s+--service(?:\s|$)')
  if ($map.Count -ne 2) { Add-Failure "listenerCount expected=2 actual=$($map.Count)" }
  if ($map.Count -ge 2) {
    if ($map[0].port -ne 28894) { Add-Failure "portFirst expected=28894 actual=$($map[0].port)" }
    if ($map[0].installedVersion -cne '2.1.10') { Add-Failure "installedVersion expected=2.1.10 actual=$($map[0].installedVersion)" }
    if ($null -ne $map[0].serverVersion) { Add-Failure "serverVersion expected=null actual=$($map[0].serverVersion)" }
    if ($map[0].authChecked -ne $false) { Add-Failure "authChecked expected=false actual=$($map[0].authChecked)" }
    if ($map[0].httpRequests -ne 0) { Add-Failure "httpRequests expected=0 actual=$($map[0].httpRequests)" }
    if ($map[0].processId -ne 18912) { Add-Failure "pidMapped expected=18912 actual=$($map[0].processId)" }
  }
  $ports = @($map | ForEach-Object { $_.port } | Sort-Object)
  if (($ports -join ',') -cne '27275,28894') { Add-Failure "onlyOwnedLoopbackListeners expected=27275,28894 actual=$($ports -join ',')" }

  $result = [pscustomobject]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    mode = 'self-check'
    httpRequests = 0
    syntheticData = $true
    liveProcessesTouched = $false
    passed = ($failures.Count -eq 0)
    failures = @($failures)
  }
  $result | ConvertTo-Json -Depth 5
  if ($failures.Count -gt 0) { exit 2 }
  exit 0
}

if ($SelfCheck) { Invoke-SelfCheck }
Invoke-LiveScan | ConvertTo-Json -Depth 5
exit 0
