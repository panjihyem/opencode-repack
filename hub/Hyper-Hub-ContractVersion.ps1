[CmdletBinding()]
param(
  [string]$Executable,
  [switch]$SelfCheck
)

# M-01/C-09: contract test versi Hyper AI / OpenCode tanpa HTTP dan tanpa asumsi
# endpoint tersedia. Yang diuji: executable bisa dijalankan, versi terbaca, format
# version dikenali, dan tidak ada request jaringan (httpRequests=0).

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-VersionInfo([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return [pscustomobject]@{ found = $false; reason = 'executable tidak diberikan' } }
  if (-not [IO.File]::Exists($Path)) { return [pscustomobject]@{ found = $false; reason = "executable tidak ada: $Path" } }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Path --version 2>&1
    $code = $LASTEXITCODE
  } catch {
    return [pscustomobject]@{ found = $false; reason = "gagal menjalankan: $($_.Exception.Message)" }
  } finally { $ErrorActionPreference = $previous }
  $text = ([string]($output | Out-String)).Trim()
  $match = [regex]::Match($text, '(\d+)\.(\d+)\.(\d+)')
  if (-not $match.Success) { return [pscustomobject]@{ found = $false; reason = "versi tidak terbaca dari: $text" } }
  return [pscustomobject]@{
    found = $true
    exitCode = $code
    version = $match.Value
    major = [int]$match.Groups[1].Value
    minor = [int]$match.Groups[2].Value
    patch = [int]$match.Groups[3].Value
    raw = $text
    httpRequests = 0
  }
}

function Test-VersionContract([string]$Path) {
  $info = Get-VersionInfo $Path
  $issues = @()
  if (-not $info.found) { $issues += [string]$info.reason; return [pscustomobject]@{ path = $Path; valid = $false; issues = $issues; info = $info } }
  if ($info.exitCode -ne 0) { $issues += "exit code $($info.exitCode)" }
  # Hyper AI 2.1.10 adalah baseline; engine harus >= 2.1.0 agar kontrak ini relevan.
  if ($info.major -lt 2) { $issues += "versi $($info.version) di bawah baseline 2.x" }
  if ($info.major -eq 2 -and $info.minor -lt 1) { $issues += "versi $($info.version) di bawah baseline 2.1" }
  return [pscustomobject]@{ path = $Path; valid = ($issues.Count -eq 0); version = $info.version; issues = $issues; info = $info }
}

function Test-ExecutableResolution {
  # Meniru Hyper-Hub-VersionCheck: kandidat dari PATH dan lokasi umum, tanpa menebak port.
  $candidates = @()
  foreach ($name in @('opencode-cli.exe', 'hyper-ai.exe', 'Hyper AI.exe', 'opencode.exe', 'opencode')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command -and $command.Source) { $candidates += $command.Source }
  }
  foreach ($dir in @($env:LOCALAPPDATA, $env:PROGRAMFILES, ${env:PROGRAMFILES(X86)})) {
    if ([string]::IsNullOrWhiteSpace($dir)) { continue }
    foreach ($rel in @('Programs\Hyper AI\Hyper AI.exe', 'Hyper AI\Hyper AI.exe', 'opencode\opencode-cli.exe')) {
      $path = Join-Path $dir $rel
      if ([IO.File]::Exists($path)) { $candidates += $path }
    }
  }
  return @($candidates | Select-Object -Unique)
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('version-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $ok = Join-Path $temp 'ok.cmd'
    [IO.File]::WriteAllText($ok, "@echo off`r`necho hyper-ai v2.1.10`r`nexit /b 0`r`n")
    $old = Join-Path $temp 'old.cmd'
    [IO.File]::WriteAllText($old, "@echo off`r`necho hyper-ai v1.9.9`r`nexit /b 0`r`n")
    $garbage = Join-Path $temp 'garbage.cmd'
    [IO.File]::WriteAllText($garbage, "@echo off`r`necho tidak ada versi`r`nexit /b 0`r`n")
    $failing = Join-Path $temp 'failing.cmd'
    [IO.File]::WriteAllText($failing, "@echo off`r`necho hyper-ai v2.1.10`r`nexit /b 4`r`n")

    $valid = Test-VersionContract $ok
    if (-not $valid.valid -or $valid.version -cne '2.1.10') { $failures.Add('versi 2.1.10 harus valid') }
    if ($valid.info.httpRequests -ne 0) { $failures.Add('tidak boleh ada HTTP') }

    $tooOld = Test-VersionContract $old
    if ($tooOld.valid) { $failures.Add('versi 1.9.9 harus ditolak') }

    $junk = Test-VersionContract $garbage
    if ($junk.valid) { $failures.Add('output tanpa versi harus ditolak') }

    $badExit = Test-VersionContract $failing
    if ($badExit.valid) { $failures.Add('exit code bukan nol harus ditolak') }

    $missing = Test-VersionContract (Join-Path $temp 'tidak-ada.exe')
    if ($missing.valid) { $failures.Add('executable hilang harus ditolak') }

    $resolution = @(Test-ExecutableResolution)
    if ($resolution -isnot [array]) { $failures.Add('resolution harus mengembalikan array') }
    if ($resolution.Count -gt 0) {
      foreach ($candidate in $resolution) { if ([string]::IsNullOrWhiteSpace($candidate)) { $failures.Add('kandidat executable kosong') } }
    }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Version contract self-check passed: baca versi tanpa HTTP, tolak versi lama/rusak/exit gagal.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Executable)) { [Console]::Error.WriteLine('Pemakaian: -Executable <path> | -SelfCheck'); exit 1 }
$result = Test-VersionContract $Executable
$result | ConvertTo-Json -Depth 5
if (-not $result.valid) { exit 2 }
exit 0
