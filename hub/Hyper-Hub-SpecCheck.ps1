[CmdletBinding()]
param(
  [string]$Spec,
  [switch]$SelfCheck,
  [string]$Template
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Template)) {
  $Template = Join-Path $PSScriptRoot 'Hyper-Hub-Spec-Template.md'
}

$requiredSections = @(
  '## Tujuan',
  '## Lingkup',
  '## Di luar lingkup',
  '## Jalur kegagalan',
  '## Kriteria penerimaan',
  '## Gate manusia'
)

function Get-SpecIssues([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @('spec file tidak ditemukan') }
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $issues = @()

  foreach ($section in $requiredSections) {
    if ($text.IndexOf($section, [StringComparison]::Ordinal) -lt 0) { $issues += "bagian wajib hilang: $section" }
  }

  $zoneMatch = [regex]::Match($text, '(?m)^\|\s*Zona data\s*\|\s*(regular|case)\s*\|')
  if (-not $zoneMatch.Success) { $issues += 'tabel "Zona data" harus berisi regular atau case' }
  $zone = if ($zoneMatch.Success) { $zoneMatch.Groups[1].Value } else { 'unknown' }

  if ($zone -ceq 'case' -and $text.IndexOf('## Batas egress', [StringComparison]::Ordinal) -lt 0) {
    $issues += 'zona case wajib punya bagian "## Batas egress"'
  }

  $gate = [regex]::Match($text, '(?m)^\|\s*HG-AUDIT-R1\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$')
  if (-not $gate.Success) {
    $issues += 'baris gate HG-AUDIT-R1 dengan 4 kolom tidak ditemukan'
  } elseif ($gate.Groups[1].Value.Trim() -cne 'approved') {
    $issues += "gate HG-AUDIT-R1 belum approved (status: $($gate.Groups[1].Value.Trim()))"
  }

  $acceptance = [regex]::Match($text, '(?s)## Kriteria penerimaan(.*?)(?=\n## |\z)')
  if ($acceptance.Success -and $acceptance.Groups[1].Value -notmatch '`[^`]+`') {
    $issues += 'kriteria penerimaan tidak memuat perintah yang dapat dijalankan'
  }

  return [pscustomobject]@{ zone = $zone; issues = @($issues) }
}

function Write-Result([string]$Path, $Result) {
  [pscustomobject]@{
    spec = $Path
    zone = $Result.zone
    decision = if ($Result.issues.Count -eq 0) { 'allow' } else { 'block' }
    issues = @($Result.issues)
    writes = $false
    network = $false
  } | ConvertTo-Json -Depth 4
}

if ($SelfCheck) {
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("hyper-hub-spec-" + [Guid]::NewGuid().ToString('N') + '.md')
  try {
    if (-not (Test-Path -LiteralPath $Template)) { throw 'template tidak ditemukan' }
    $body = Get-Content -LiteralPath $Template -Raw -Encoding UTF8

    [System.IO.File]::WriteAllText($temp, $body)
    $pending = Get-SpecIssues $temp
    if ($pending.issues.Count -ne 1 -or $pending.issues[0] -notmatch 'belum approved') { throw 'gate pending harus menolak tepat satu alasan.' }

    [System.IO.File]::WriteAllText($temp, $body.Replace('| HG-AUDIT-R1 | pending |', '| HG-AUDIT-R1 | approved |'))
    if ((Get-SpecIssues $temp).issues.Count -ne 0) { throw 'spec approved harus lulus.' }

    $caseBody = $body.Replace('| HG-AUDIT-R1 | pending |', '| HG-AUDIT-R1 | approved |').Replace('| Zona data | regular |', '| Zona data | case |')
    $caseBody = [regex]::Replace($caseBody, '(?s)## Batas egress.*?(?=\n## )', '')
    [System.IO.File]::WriteAllText($temp, $caseBody)
    $case = Get-SpecIssues $temp
    if ($case.issues.Count -ne 1 -or $case.issues[0] -notmatch 'Batas egress') { throw 'case tanpa batas egress harus ditolak.' }

    'Spec gate self-check passed.'
  } finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Spec)) {
  [Console]::Error.WriteLine('Pemakaian: -Spec <berkas.md> atau -SelfCheck')
  exit 1
}

$result = Get-SpecIssues $Spec
Write-Result $Spec $result
if ($result.issues.Count -gt 0) { exit 2 }
exit 0
