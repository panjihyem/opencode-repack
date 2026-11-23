[CmdletBinding()]
param(
  [string]$Executable,
  [switch]$SelfCheck
)

# N-13: uji end-to-end terhadap engine Hyper AI yang BERJALAN, read-only.
# Yang diuji: discovery lewat executable, /api/info, /openapi.json, dan klaim endpoint
# schedule pada versi nyata. Tidak mengubah config, tidak memulai sesi, tidak mengirim
# prompt. Bila engine tidak berjalan, hasilnya 'skip', bukan lulus palsu.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Resolve-Engine {
  if (-not [string]::IsNullOrWhiteSpace($Executable) -and (Test-Path -LiteralPath $Executable)) { return $Executable }
  $candidates = @(
    (Join-Path $env:APPDATA 'ai.hyperai.desktop\cli\2.1.10-x64\opencode-cli.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\@opencodedesktop\resources\opencode-cli.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\ai.opencode.desktop\resources\opencode-cli.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ }
  return @($candidates)[0]
}

function Invoke-EngineApi([string]$Exe, [string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @Arguments 2>&1
    return [pscustomobject]@{ code = $LASTEXITCODE; text = ([string](($out | Out-String))).Trim() }
  } finally { $ErrorActionPreference = $previous }
}

function Get-LiveProbe([string]$Exe) {
  $info = Invoke-EngineApi $Exe @('api', 'get', '/api/info')
  if ($info.code -ne 0) { return [pscustomobject]@{ live = $false; reason = 'engine tidak merespons /api/info'; detail = $info.text } }
  $doc = $null
  try { $doc = ConvertFrom-Json -InputObject $info.text } catch { return [pscustomobject]@{ live = $false; reason = 'respons /api/info bukan JSON' } }
  $openapi = Invoke-EngineApi $Exe @('api', 'get', '/openapi.json')
  $pathCount = $null
  $hasSchedule = $false
  if ($openapi.code -eq 0) {
    try {
      $schema = ConvertFrom-Json -InputObject $openapi.text
      $pathCount = @($schema.paths.PSObject.Properties).Count
      $hasSchedule = ($null -ne $schema.paths.PSObject.Properties['/api/experimental/schedule'])
    } catch { }
  }
  return [pscustomobject]@{
    live = $true
    version = [string]$doc.version
    pid = $doc.pid
    urls = @($doc.urls)
    capabilities = $doc.capabilities
    openapiPaths = $pathCount
    hasSchedulePath = $hasSchedule
    httpRequests = 2
  }
}

if ($SelfCheck) {
  $issues = @()
  # Uji logika tanpa engine: parser harus menolak teks non-JSON.
  $bad = '{"unclosed"'
  $parsed = $null
  try { $parsed = ConvertFrom-Json -InputObject $bad } catch { }
  if ($null -ne $parsed) { $issues += 'JSON rusak harus ditolak' }
  # Resolusi tanpa executable harus menghasilkan null, bukan error.
  $missing = Resolve-Engine -ErrorAction SilentlyContinue
  if ($null -ne $missing -and -not (Test-Path -LiteralPath $missing)) { $issues += 'resolusi harus mengembalikan path valid atau null' }
  if ($issues.Count -gt 0) { $issues | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
  'Live engine self-check passed: parser menolak JSON rusak; resolusi tidak menebak path.'
  exit 0
}

$exe = Resolve-Engine
if (-not $exe) {
  [pscustomobject]@{ live = $false; reason = 'engine tidak ditemukan'; checkedAtUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Depth 4
  exit 2
}
$probe = Get-LiveProbe $exe
$probe | Add-Member -NotePropertyName executable -NotePropertyValue $exe
$probe | Add-Member -NotePropertyName checkedAtUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
$probe | ConvertTo-Json -Depth 5
if (-not $probe.live) { exit 3 }
exit 0
