[CmdletBinding()]
param(
  [string]$Root = '.',
  [string]$OutFile,
  [switch]$SelfCheck
)

# N-06: indeks artefak benchmark lokal (model x decode backend x panjang konteks x
# kualitas) dari hub/flm-results. Read-only: tidak mengubah artefak, tidak memanggil
# model, tidak memakai jaringan.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function ConvertFrom-ResultName([string]$Name) {
  # Pola: <model>-<backend>-<ctx>.txt / <model>-<backend>.csv / quality-<slug>.jsonl
  $base = [IO.Path]::GetFileNameWithoutExtension($Name)
  $extension = [IO.Path]::GetExtension($Name).ToLowerInvariant()
  $model = $base
  $backend = ''
  $context = ''
  $kind = switch ($extension) {
    '.csv' { 'benchmark' }
    '.jsonl' { 'quality' }
    '.txt' { 'log' }
    '.log' { 'server-log' }
    '.err' { 'error' }
    '.py' { 'script' }
    default { 'other' }
  }
  if ($kind -ceq 'quality') {
    $model = $base -replace '^(quality|compare)', ''
    $model = $model.Trim('-', '_')
    return [pscustomobject]@{ kind = 'quality'; model = $model; backend = ''; context = '' }
  }
  if ($kind -in @('server-log', 'error')) {
    return [pscustomobject]@{ kind = $kind; model = $base; backend = ''; context = '' }
  }
  if ($kind -ceq 'script') {
    return [pscustomobject]@{ kind = 'script'; model = $base; backend = ''; context = '' }
  }
  if ($base -match '^(?<m>.+)-(?<b>iGPU|NPU2|CPU|dGPU)-(?<c>\d+k)$') {
    $model = $Matches['m']; $backend = $Matches['b']; $context = $Matches['c']
  } elseif ($base -match '^(?<m>.+)-(?<b>iGPU|NPU2|CPU|dGPU)$') {
    $model = $Matches['m']; $backend = $Matches['b']
  } elseif ($base -match '^(?<m>bench_.+)_(?<d>\d{8})_') {
    $model = $Matches['m'] -replace '^bench_', ''
  }
  return [pscustomobject]@{ kind = $kind; model = $model; backend = $backend; context = $context }
}

function Get-ResultIndex([string]$Directory) {
  if (-not [IO.Directory]::Exists($Directory)) { throw "Folder hasil tidak ada: $Directory" }
  $rows = @()
  foreach ($file in [IO.Directory]::GetFiles($Directory)) {
    $info = [IO.FileInfo]::new($file)
    $parsed = ConvertFrom-ResultName $info.Name
    $rows += [pscustomobject]@{
      file = $info.Name
      kind = $parsed.kind
      model = $parsed.model
      backend = $parsed.backend
      context = $parsed.context
      bytes = $info.Length
      modifiedUtc = $info.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
  }
  return @($rows | Sort-Object kind, model, backend, context, file)
}

function Format-ResultIndex($Rows) {
  $lines = @(
    '# Indeks hasil benchmark model lokal',
    '',
    '<!-- HYPER_AI_MANAGED: flm-results index -->',
    '',
    'Dibuat oleh `Hyper-Hub-Index.ps1`. Bukan hasil baru: hanya pemetaan artefak yang sudah ada di `hub/flm-results`.',
    '',
    "Total artefak: $(@($Rows).Count)",
    '',
    '## Matriks model x backend x konteks',
    '',
    '| Model | Backend | Konteks | Berkas |',
    '| --- | --- | --- | --- |'
  )
  foreach ($row in @($Rows | Where-Object { $_.kind -eq 'benchmark' -or $_.kind -eq 'log' })) {
    $lines += "| $($row.model) | $(if ($row.backend) { $row.backend } else { '-' }) | $(if ($row.context) { $row.context } else { '-' }) | $($row.file) |"
  }
  $lines += @('', '## Hasil kualitas', '')
  $quality = @($Rows | Where-Object { $_.kind -eq 'quality' })
  if ($quality.Count -eq 0) { $lines += '- (tidak ada berkas quality)' }
  else { foreach ($row in $quality) { $lines += "- $($row.file) (model: $($row.model))" } }
  $lines += @('', '## Skrip dan log server', '')
  foreach ($row in @($Rows | Where-Object { $_.kind -in @('script', 'server-log', 'error') })) {
    $lines += "- $($row.file) ($($row.kind), $($row.bytes) byte)"
  }
  $lines += @('', '## Catatan', '', '- Angka benchmark tidak diekstrak ulang di sini; buka berkas CSV/TXT sumber untuk nilai.', '')
  return ($lines -join "`n")
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('index-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    foreach ($name in @('qwen3.5-2b-NPU2.csv', 'lfm3-1.7b-iGPU-16k.txt', 'quality-lfm3-1-7b.jsonl', 'quality_probe.py', 'foo.server.log', 'x.err')) {
      [IO.File]::WriteAllText((Join-Path $temp $name), 'x', $utf8)
    }
    $rows = Get-ResultIndex $temp
    if (@($rows).Count -ne 6) { $failures.Add("harus 6 artefak, dapat $(@($rows).Count)") }

    $bench = @($rows | Where-Object { $_.file -eq 'qwen3.5-2b-NPU2.csv' })[0]
    if ($bench.model -cne 'qwen3.5-2b' -or $bench.backend -cne 'NPU2') { $failures.Add("parse model/backend gagal: $($bench.model)/$($bench.backend)") }
    $ctx = @($rows | Where-Object { $_.file -eq 'lfm3-1.7b-iGPU-16k.txt' })[0]
    if ($ctx.backend -cne 'iGPU' -or $ctx.context -cne '16k') { $failures.Add("parse konteks gagal: $($ctx.backend)/$($ctx.context)") }
    $q = @($rows | Where-Object { $_.file -eq 'quality-lfm3-1-7b.jsonl' })[0]
    if ($q.kind -cne 'quality') { $failures.Add('quality harus terdeteksi') }
    $py = @($rows | Where-Object { $_.file -eq 'quality_probe.py' })[0]
    if ($py.kind -cne 'script') { $failures.Add('script harus terdeteksi') }
    $log = @($rows | Where-Object { $_.file -eq 'foo.server.log' })[0]
    if ($log.kind -cne 'server-log') { $failures.Add('server log harus terdeteksi') }

    $text = Format-ResultIndex $rows
    if ($text -notmatch 'HYPER_AI_MANAGED: flm-results index') { $failures.Add('marker managed hilang') }
    if ($text -notmatch 'qwen3\.5-2b') { $failures.Add('tabel harus memuat model') }
    if ($text -notmatch 'Total artefak: 6') { $failures.Add('total artefak salah') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Index self-check passed: klasifikasi artefak, parse model/backend/konteks, marker managed.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

$resultsDir = Join-Path $Root 'hub\flm-results'
if (-not (Test-Path $resultsDir)) { $resultsDir = Join-Path $Root 'flm-results' }
$rows = Get-ResultIndex $resultsDir
$target = if ([string]::IsNullOrWhiteSpace($OutFile)) { Join-Path $resultsDir 'INDEX.md' } else { $OutFile }
$content = Format-ResultIndex $rows
[IO.File]::WriteAllText($target, $content, $utf8)
[pscustomobject]@{ index = (Resolve-Path $target).Path; artifacts = @($rows).Count; benchmark = @($rows | Where-Object { $_.kind -eq 'benchmark' }).Count; quality = @($rows | Where-Object { $_.kind -eq 'quality' }).Count } | ConvertTo-Json -Depth 3
exit 0
