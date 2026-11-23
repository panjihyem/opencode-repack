[CmdletBinding()]
param(
  [string]$Root,
  [string]$Event = 'tool.before',
  [string]$Tool,
  [string]$JobId = 'n/a',
  [switch]$DryRun,
  [switch]$SelfCheck
)

# D-06: hook audit untuk plugin/bridge V2. Kontrak: hook tidak boleh mengubah payload
# request, tidak boleh menulis prompt mentah, dan wajib mencatat aksi ke audit Hub.
# Skrip ini boleh dipanggil plugin (stdin JSON) atau manual untuk uji.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Hash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-SafeSummary([string]$Json) {
  # Hanya metadata: nama tool/aksi dan hash. Tidak ada argumen, path, atau prompt.
  if ([string]::IsNullOrWhiteSpace($Json)) { return [pscustomobject]@{ tool = ''; hash = (Get-Hash '') } }
  try { $payload = ConvertFrom-Json -InputObject $Json } catch { return [pscustomobject]@{ tool = ''; hash = (Get-Hash $Json) } }
  $toolName = ''
  foreach ($field in @('tool', 'name', 'toolName')) {
    if ($null -ne $payload.PSObject.Properties[$field]) { $toolName = [string]$payload.$field; break }
  }
  return [pscustomobject]@{ tool = $toolName; hash = (Get-Hash $Json) }
}

function Invoke-HookAudit([string]$RootPath, [string]$Kind, [string]$ToolName, [string]$Id, [string]$RawJson, [bool]$Preview) {
  if ([string]::IsNullOrWhiteSpace($RootPath)) { throw 'Root wajib.' }
  $summary = Get-SafeSummary $RawJson
  if ([string]::IsNullOrWhiteSpace($ToolName)) { $ToolName = $summary.tool }
  $result = [ordered]@{
    root = $RootPath
    event = $Kind
    tool = $ToolName
    jobId = $Id
    payloadHash = $summary.hash
    wroteAudit = $false
    modifiedPayload = $false
    secretFree = $true
  }
  if ($Preview) { return [pscustomobject]$result }
  $auditPath = Join-Path $RootPath 'audit.jsonl'
  if (-not [IO.File]::Exists($auditPath)) { throw 'Audit Hub tidak ada; hook gagal-tertutup.' }
  # Audit memakai format chain Hub agar verifikasi yang sama tetap berlaku.
  $statePath = Join-Path $RootPath 'state.json'
  if (-not [IO.File]::Exists($statePath)) { throw 'State tidak ada; hook gagal-tertutup.' }
  $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
  if ([string]$state.lastAuditHash -notmatch '^[a-f0-9]{64}$') { throw 'State tidak sah; hook gagal-tertutup.' }
  $record = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    event = $Kind
    jobId = $Id
    decision = 'allow'
    result = "tool=$ToolName hash=$($summary.hash.Substring(0,16))"
    previousHash = [string]$state.lastAuditHash
  }
  $canonical = ConvertTo-Json -InputObject $record -Compress -Depth 4
  $record.hash = Get-Hash $canonical
  $state.lastAuditHash = [string]$record.hash
  $json = ConvertTo-Json -InputObject $state -Depth 20
  $tmp = "$statePath.tmp"
  [IO.File]::WriteAllText($tmp, $json, $utf8)
  if ([IO.File]::Exists($statePath)) { [IO.File]::Delete($statePath) }
  [IO.File]::Move($tmp, $statePath)
  [IO.File]::AppendAllText($auditPath, ((ConvertTo-Json -InputObject $record -Compress -Depth 4) + "`n"), $utf8)
  $result.wroteAudit = $true
  return [pscustomobject]$result
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('hook-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Hyper-Hub.ps1') init -Root $temp | Out-Null

    $payload = '{"tool":"bash","arguments":{"command":"curl secret"}}'
    $before = [IO.File]::ReadAllText((Join-Path $temp 'audit.jsonl'), $utf8)
    $result = Invoke-HookAudit $temp 'tool.before' 'bash' 'job-x' $payload $false
    if (-not $result.wroteAudit) { $failures.Add('audit harus ditulis') }
    if ($result.modifiedPayload) { $failures.Add('hook tidak boleh mengubah payload') }
    $after = [IO.File]::ReadAllText((Join-Path $temp 'audit.jsonl'), $utf8)
    if ($after.Length -le $before.Length) { $failures.Add('baris audit harus bertambah') }
    if ($after -match 'curl secret' -or $after -match 'arguments') { $failures.Add('hook tidak boleh menulis argumen/prompt mentah') }
    if ((& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Hyper-Hub.ps1') audit -Root $temp).Text -notmatch 'Audit chain valid') {
      $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Hyper-Hub.ps1') audit -Root $temp) | Out-String
      if ($out -notmatch 'Audit chain valid') { $failures.Add('rantai audit harus tetap valid setelah hook') }
    }

    $preview = Invoke-HookAudit $temp 'tool.after' 'read' 'job-y' '{"tool":"read"}' $true
    if ($preview.wroteAudit) { $failures.Add('dry-run tidak boleh menulis') }

    $missingRoot = Join-Path $temp 'tidak-ada'
    $threw = $false
    try { Invoke-HookAudit $missingRoot 'tool.before' 'bash' 'j' '{}' $false | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('tanpa audit harus gagal-tertutup') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Hook audit self-check passed: menulis audit tanpa payload mentah, payload tidak diubah, fail-closed.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root)) { [Console]::Error.WriteLine('Pemakaian: -Root <state> [-Event <nama>] [-Tool <nama>] [-JobId <id>] [-DryRun] | -SelfCheck'); exit 1 }
$stdin = ''
if ([Console]::IsInputRedirected) { $stdin = [Console]::In.ReadToEnd() }
try {
  Invoke-HookAudit $Root $Event $Tool $JobId $stdin ([bool]$DryRun) | ConvertTo-Json -Depth 4
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
