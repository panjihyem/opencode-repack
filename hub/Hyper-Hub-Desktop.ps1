[CmdletBinding()]
param(
  [string]$Root,
  [string]$Action,
  [string]$Target,
  [string]$ApprovalId,
  [string]$Zone = 'regular',
  [switch]$SelfCheck
)

# H-03: approval + audit untuk aksi desktop (Windows-MCP).
# Aturan keras:
#   - read/screenshot: boleh, tapi isi screenshot TIDAK pernah masuk audit/disk Hub
#   - write/delete/click/type: wajib approval nonce yang sudah approved dan belum dipakai
#   - zona case: seluruh aksi desktop ditolak
# Sidecar Windows-MCP belum terpasang (H-02); modul ini adalah lapisan yang menegakkan
# keputusan, bukan pengganti sidecar.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$approvalScript = Join-Path $PSScriptRoot 'Hyper-Hub-Approval.ps1'

$script:WriteActions = @('write', 'delete', 'click', 'type', 'keypress', 'drag')
$script:ReadActions = @('read', 'screenshot', 'observe')

function Get-Hash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Test-Approval([string]$RootPath, [string]$Id) {
  if ([string]::IsNullOrWhiteSpace($Id)) { return [pscustomobject]@{ allowed = $false; reason = 'approval wajib untuk aksi tulis' } }
  if (-not [IO.File]::Exists((Join-Path $RootPath 'approvals.json'))) { return [pscustomobject]@{ allowed = $false; reason = 'approval broker tidak ada' } }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $approvalScript -Action consume -Root $RootPath -Id $Id 2>&1
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { return [pscustomobject]@{ allowed = $false; reason = 'consume approval gagal' } }
  $result = ([string]($out | Out-String)).Trim() | ConvertFrom-Json
  return [pscustomobject]@{ allowed = [bool]$result.allowed; reason = [string]$result.reason }
}

function Invoke-DesktopAction([string]$RootPath, [string]$Kind, [string]$Subject, [string]$Approval, [string]$DataZone) {
  if ([string]::IsNullOrWhiteSpace($Kind)) { return [pscustomobject]@{ allowed = $false; decision = 'deny'; reason = 'aksi kosong' } }
  if ($DataZone -cnotin @('regular', 'case')) { return [pscustomobject]@{ allowed = $false; decision = 'deny'; reason = 'zona tidak dikenal' } }
  if ($DataZone -ceq 'case') { return [pscustomobject]@{ allowed = $false; decision = 'deny'; reason = 'zona case menolak seluruh aksi desktop' } }
  if ($script:ReadActions -contains $Kind) {
    return [pscustomobject]@{ allowed = $true; decision = 'allow'; reason = 'aksi baca; isi tidak disimpan'; persisted = $false; auditsContent = $false }
  }
  if ($script:WriteActions -notcontains $Kind) { return [pscustomobject]@{ allowed = $false; decision = 'deny'; reason = "aksi tidak terklasifikasi: $Kind" } }
  $check = Test-Approval $RootPath $Approval
  if (-not $check.allowed) { return [pscustomobject]@{ allowed = $false; decision = 'deny'; reason = $check.reason } }
  return [pscustomobject]@{ allowed = $true; decision = 'allow'; reason = 'approval nonce terpakai'; persisted = $false; auditsContent = $false; targetHash = (Get-Hash $Subject) }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('desktop-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Hyper-Hub.ps1') init -Root $temp | Out-Null

    $read = Invoke-DesktopAction $temp 'screenshot' 'screen-1' '' 'regular'
    if (-not $read.allowed -or $read.auditsContent) { $failures.Add('screenshot harus allow tanpa menyimpan isi') }

    $noApproval = Invoke-DesktopAction $temp 'write' 'C:\x.txt' '' 'regular'
    if ($noApproval.allowed) { $failures.Add('write tanpa approval harus deny') }

    $fakeApproval = Invoke-DesktopAction $temp 'write' 'C:\x.txt' 'tidak-ada' 'regular'
    if ($fakeApproval.allowed) { $failures.Add('approval tak dikenal harus deny') }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $approvalScript -Action request -Root $temp -Id desktop-1 -Actor 'sidecar' -Reason 'hapus berkas uji' | Out-Null
    $pending = Invoke-DesktopAction $temp 'delete' 'C:\x.txt' 'desktop-1' 'regular'
    if ($pending.allowed) { $failures.Add('approval pending belum boleh dipakai') }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $approvalScript -Action approve -Root $temp -Id desktop-1 -Actor 'owner' | Out-Null
    $approved = Invoke-DesktopAction $temp 'delete' 'C:\x.txt' 'desktop-1' 'regular'
    if (-not $approved.allowed) { $failures.Add("approval sah harus allow: $($approved.reason)") }
    $replay = Invoke-DesktopAction $temp 'delete' 'C:\x.txt' 'desktop-1' 'regular'
    if ($replay.allowed) { $failures.Add('nonce yang sudah dipakai harus ditolak') }

    $caseDeny = Invoke-DesktopAction $temp 'screenshot' 'screen' '' 'case'
    if ($caseDeny.allowed) { $failures.Add('zona case harus menolak desktop') }
    $unknown = Invoke-DesktopAction $temp 'format-disk' 'C:\' '' 'regular'
    if ($unknown.allowed) { $failures.Add('aksi tak terklasifikasi harus deny') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Desktop gate self-check passed: write/delete wajib approval sekali pakai, screenshot tanpa isi, zona case ditolak.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root) -or [string]::IsNullOrWhiteSpace($Action)) {
  [Console]::Error.WriteLine('Pemakaian: -Root <state> -Action <read|write|delete|screenshot|click|type> [-Target <x>] [-ApprovalId <id>] [-Zone regular|case] | -SelfCheck')
  exit 1
}
$result = Invoke-DesktopAction $Root $Action $Target $ApprovalId $Zone
$result | ConvertTo-Json -Depth 4
if (-not $result.allowed) { exit 2 }
exit 0
