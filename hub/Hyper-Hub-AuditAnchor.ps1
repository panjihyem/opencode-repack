[CmdletBinding()]
param(
  [string]$Root,
  [switch]$Check,
  [switch]$SelfCheck
)

# D-05: anchor harian audit hash chain ke lokasi terpisah.
# Tujuan: deteksi penulisan ulang state+audit sekaligus (T20) selama anchor tidak
# dapat ditulis oleh akun yang sama. Anchor menyimpan hash terakhir, jumlah baris,
# dan hash file; tidak pernah menyimpan isi prompt.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Sha([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-AuditFacts([string]$AuditPath, [string]$StatePath) {
  if (-not [IO.File]::Exists($AuditPath)) { throw "Audit tidak ada: $AuditPath" }
  if (-not [IO.File]::Exists($StatePath)) { throw "State tidak ada: $StatePath" }
  $text = [IO.File]::ReadAllText($AuditPath, $utf8)
  $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($StatePath, $utf8))
  $lines = @($text -split "`n" | Where-Object { $_.Length -gt 0 })
  return [pscustomobject]@{
    lastAuditHash = [string]$state.lastAuditHash
    auditLines = $lines.Count
    auditHash = Get-Sha $text
    anchoredAtUtc = [DateTime]::UtcNow.ToString('o')
  }
}

function Get-AnchorPath([string]$RootPath) {
  # Anchor sengaja di luar folder state agar tidak ikut terhapus bersama state.
  return (Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($RootPath))) 'hyper-hub-audit-anchor.json')
}

function Invoke-Anchor([string]$RootPath, [bool]$VerifyOnly) {
  $audit = Join-Path $RootPath 'audit.jsonl'
  $state = Join-Path $RootPath 'state.json'
  $anchor = Get-AnchorPath $RootPath
  $facts = Get-AuditFacts $audit $state

  if ($VerifyOnly) {
    if (-not [IO.File]::Exists($anchor)) { return [pscustomobject]@{ status = 'missing'; note = 'belum ada anchor; buat dengan -Check tanpa state kosong' } }
    $saved = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($anchor, $utf8))
    $problems = @()
    if ([int]$saved.auditLines -gt $facts.auditLines) { $problems += 'audit lebih pendek dari anchor (baris dihapus)' }
    if ([int]$saved.auditLines -eq $facts.auditLines -and [string]$saved.auditHash -cne $facts.auditHash) { $problems += 'isi audit berubah pada jumlah baris sama' }
    if ([int]$saved.auditLines -eq $facts.auditLines -and [string]$saved.lastAuditHash -cne $facts.lastAuditHash) { $problems += 'lastAuditHash berbeda dari anchor' }
    return [pscustomobject]@{
      status = $(if ($problems.Count -eq 0) { 'consistent' } else { 'tampered' })
      anchoredAtUtc = [string]$saved.anchoredAtUtc
      anchoredLines = [int]$saved.auditLines
      currentLines = $facts.auditLines
      problems = @($problems)
    }
  }

  $payload = [ordered]@{
    lastAuditHash = $facts.lastAuditHash
    auditLines = $facts.auditLines
    auditHash = $facts.auditHash
    anchoredAtUtc = $facts.anchoredAtUtc
    root = [IO.Path]::GetFullPath($RootPath)
  }
  $tmp = "$anchor.tmp"
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $payload -Depth 4), $utf8)
  if ([IO.File]::Exists($anchor)) { [IO.File]::Delete($anchor) }
  [IO.File]::Move($tmp, $anchor)
  return [pscustomobject]@{ status = 'anchored'; anchor = $anchor; auditLines = $facts.auditLines; lastAuditHash = $facts.lastAuditHash }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('anchor-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    $root = Join-Path $temp 'state'
    [void][IO.Directory]::CreateDirectory($root)
    $state = [pscustomobject]@{ version = 1; jobs = @(); runs = @(); lastAuditHash = ('a' * 64) }
    [IO.File]::WriteAllText((Join-Path $root 'state.json'), (ConvertTo-Json -InputObject $state -Depth 5), $utf8)
    [IO.File]::WriteAllText((Join-Path $root 'audit.jsonl'), '{"event":"e1"}' + "`n", $utf8)

    $anchor = Invoke-Anchor $root $false
    if ($anchor.status -cne 'anchored') { $failures.Add('anchor harus dibuat') }
    if ((Invoke-Anchor $root $true).status -cne 'consistent') { $failures.Add('anchor baru harus konsisten') }

    [IO.File]::AppendAllText((Join-Path $root 'audit.jsonl'), '{"event":"e2"}' + "`n", $utf8)
    $state.lastAuditHash = ('b' * 64)
    [IO.File]::WriteAllText((Join-Path $root 'state.json'), (ConvertTo-Json -InputObject $state -Depth 5), $utf8)
    $afterAppend = Invoke-Anchor $root $true
    if ($afterAppend.status -cne 'consistent') { $failures.Add('penambahan baris harus tetap konsisten (prefix anchor)') }
    # Anchor ulang di 2 baris agar truncation/rewrite punya baseline yang benar.
    [void](Invoke-Anchor $root $false)

    # Hapus baris terakhir lalu majukan state: harus terdeteksi.
    [IO.File]::WriteAllText((Join-Path $root 'audit.jsonl'), '{"event":"e1"}' + "`n", $utf8)
    $state.lastAuditHash = ('c' * 64)
    [IO.File]::WriteAllText((Join-Path $root 'state.json'), (ConvertTo-Json -InputObject $state -Depth 5), $utf8)
    $truncated = Invoke-Anchor $root $true
    if ($truncated.status -cne 'tampered' -or @($truncated.problems | Where-Object { $_ -match 'lebih pendek' }).Count -ne 1) { $failures.Add("truncation harus terdeteksi (dapat $($truncated.status): $($truncated.problems -join '; '))") }

    # Ubah isi pada jumlah baris sama.
    [IO.File]::WriteAllText((Join-Path $root 'audit.jsonl'), '{"event":"e1"}' + "`n" + '{"event":"evil"}' + "`n", $utf8)
    $state.lastAuditHash = ('b' * 64)
    [IO.File]::WriteAllText((Join-Path $root 'state.json'), (ConvertTo-Json -InputObject $state -Depth 5), $utf8)
    $rewritten = Invoke-Anchor $root $true
    if ($rewritten.status -cne 'tampered') { $failures.Add("penulisan ulang isi harus terdeteksi (dapat $($rewritten.status))") }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Audit anchor self-check passed: konsisten setelah append, deteksi truncation dan penulisan ulang.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root)) { [Console]::Error.WriteLine('Pemakaian: -Root <folder state> [-Check] | -SelfCheck'); exit 1 }
try {
  [pscustomobject](Invoke-Anchor $Root ([bool]$Check)) | ConvertTo-Json -Depth 4
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
