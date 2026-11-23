[CmdletBinding()]
param(
  [string]$ResultsDir = 'flm-results',
  [switch]$SelfCheck
)

# N-07: ulangi perbandingan dengan kriteria seragam TANPA menjalankan model.
# Artefak lama memakai tiga skema CSV berbeda; skrip ini mendeteksi skema lalu menilai
# komparabilitas. Output = daftar ulang yang diperlukan, bukan angka baru.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-CsvSchema([string[]]$Headers) {
  $set = ($Headers -join ',')
  if ($set -match 'functional_status') { return 'bench-functional' }
  if ($set -match 'iterations' -and $set -match 'tool_call') { return 'bench-v2' }
  if ($set -match 'iterations') { return 'bench-v1' }
  if ($set -match 'tool_call_ok' -and $set -match 'load_ok') { return 'compare' }
  if ($set -match 'context_length_k') { return 'bench-agg' }
  # Artefak kegagalan: tidak ada metrik kecepatan sama sekali.
  if ($set -match 'status' -and $set -match 'error') { return 'load-failed' }
  if ($set -match 'result' -and $set -match 'detail') { return 'test-failed' }
  return 'unknown'
}

function Test-IsFailureArtifact([string]$Schema) {
  return ($Schema -eq 'load-failed' -or $Schema -eq 'test-failed')
}

function Read-BenchRows([string]$Path) {
  $rows = @(Import-Csv -LiteralPath $Path -Encoding UTF8)
  if ($rows.Count -eq 0) { return [pscustomobject]@{ schema = 'empty'; rows = @() } }
  $headers = @($rows[0].PSObject.Properties.Name)
  $schema = Get-CsvSchema $headers
  $parsed = @()
  foreach ($row in $rows) {
    $item = [pscustomobject]@{
      device = [string]$row.device
      ctx = $(if ($null -ne $row.PSObject.Properties['ctx']) { [string]$row.ctx } elseif ($null -ne $row.PSObject.Properties['context_length_k']) { [string]$row.context_length_k } else { '' })
      iterations = $null
      toolCall = $(if ($null -ne $row.PSObject.Properties['tool_call']) { [string]$row.tool_call } elseif ($null -ne $row.PSObject.Properties['tool_call_ok']) { [string]$row.tool_call_ok } else { '' })
      loadOk = $(if ($null -ne $row.PSObject.Properties['load_ok']) { [string]$row.load_ok } else { '' })
      functional = $(if ($null -ne $row.PSObject.Properties['functional_status']) { [string]$row.functional_status } else { '' })
    }
    if ($null -ne $row.PSObject.Properties['iterations']) {
      $value = 0
      if ([int]::TryParse([string]$row.iterations, [ref]$value)) { $item.iterations = $value }
    }
    $parsed += $item
  }
  return [pscustomobject]@{ schema = $schema; rows = @($parsed) }
}

function Get-Comparability([string]$Schema, [object[]]$Rows) {
  if (@($Rows).Count -eq 0) { return [pscustomobject]@{ comparable = $false; issues = @('tidak ada baris') } }
  $issues = @()
  # Skema bench-v2 punya kolom iterations: wajib seragam dan >= 2.
  if ($Schema -in @('bench-v2', 'bench-v1', 'bench-functional')) {
    $iterations = @($Rows | ForEach-Object { $_.iterations } | Where-Object { $null -ne $_ } | Sort-Object -Unique)
    if ($iterations.Count -gt 1) { $issues += "iterations tidak seragam: $($iterations -join ',')" }
    if ($iterations.Count -gt 0 -and ($iterations | Measure-Object -Minimum).Minimum -lt 2) { $issues += 'ada run dengan <2 iterasi (noise tinggi)' }
  }
  # tool_call: 'x/y' atau PASS/FAIL. Yang tidak penuh dicatat.
  $toolValues = @($Rows | ForEach-Object { $_.toolCall } | Where-Object { $_ } | Sort-Object -Unique)
  foreach ($value in $toolValues) {
    if ($value -match '^(\d+)/(\d+)$' -and $Matches[1] -ne $Matches[2]) { $issues += "tool_call tidak penuh: $value" }
  }
  foreach ($value in $toolValues) {
    if ($value -match '^(PASS|FAIL)$') { continue }
  }
  $loadValues = @($Rows | ForEach-Object { $_.loadOk } | Where-Object { $_ } | Sort-Object -Unique)
  if (@($loadValues | Where-Object { $_ -match 'FAIL' }).Count -gt 0) { $issues += 'ada baris dengan load_ok FAIL' }
  # Output fungsional tidak valid berarti angka kecepatan tidak bisa dibandingkan.
  $functional = @($Rows | ForEach-Object { $_.functional } | Where-Object { $_ } | Sort-Object -Unique)
  foreach ($value in $functional) {
    if ($value -notmatch '^(OK|PASS|VALID)$') { $issues += "output fungsional tidak valid: $value" }
  }
  return [pscustomobject]@{ comparable = ($issues.Count -eq 0); issues = @($issues) }
}

function Get-RerunReport([string]$Directory) {
  $csvs = @(Get-ChildItem -LiteralPath $Directory -Filter '*.csv' -File)
  $groups = @()
  foreach ($csv in $csvs) {
    $parsed = Read-BenchRows $csv.FullName
    if ($parsed.schema -eq 'unknown' -or $parsed.schema -eq 'empty') {
      $groups += [pscustomobject]@{ file = $csv.Name; schema = $parsed.schema; device = ''; rows = @($parsed.rows).Count; comparable = $false; issues = @('skema tidak dikenali untuk perbandingan') }
      continue
    }
    foreach ($group in @($parsed.rows | Group-Object device)) {
      if (Test-IsFailureArtifact $parsed.schema) {
        $groups += [pscustomobject]@{ file = $csv.Name; schema = $parsed.schema; device = $group.Name; rows = @($group.Group).Count; comparable = $false; issues = @('artefak kegagalan load/tes: tidak ada metrik untuk dibandingkan') }
        continue
      }
      $verdict = Get-Comparability $parsed.schema @($group.Group)
      $groups += [pscustomobject]@{ file = $csv.Name; schema = $parsed.schema; device = $group.Name; rows = @($group.Group).Count; comparable = $verdict.comparable; issues = @($verdict.issues) }
    }
  }
  return [pscustomobject]@{
    files = $csvs.Count
    schemas = @($groups | Group-Object schema | ForEach-Object { "$($_.Name)=$($_.Count)" })
    groups = @($groups)
    comparableGroups = @($groups | Where-Object { $_.comparable }).Count
    nonComparable = @($groups | Where-Object { -not $_.comparable }).Count
    rerunNeeded = @($groups | Where-Object { -not $_.comparable } | ForEach-Object { "$($_.file) [$($_.schema)/$($_.device)]: $($_.issues -join '; ')" })
  }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('rerun-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    # Skema bench-v2 seragam.
    [IO.File]::WriteAllText((Join-Path $temp 'v2ok.csv'), "model,device,mode,ctx,ttft_s,prefill_tps,decode_tps,iterations,tool_call`nm,NPU2,performance,1k,1,1,9,2,2/2`nm,NPU2,performance,2k,2,1,8,2,2/2`n", $utf8)
    # Skema bench-v2 campur iterasi + tool_call tidak penuh.
    [IO.File]::WriteAllText((Join-Path $temp 'v2bad.csv'), "model,device,mode,ctx,ttft_s,prefill_tps,decode_tps,iterations,tool_call`nm1,NPU2,performance,1k,1,1,9,1,0/3`nm2,NPU2,performance,1k,2,1,8,4,3/3`n", $utf8)
    # Skema bench-agg (tanpa iterations) harus dinilai komparabel.
    [IO.File]::WriteAllText((Join-Path $temp 'agg.csv'), "context_length_k,ttft_avg_s,ttft_std_s,ttft_min_s,ttft_max_s,prefill_avg_toks_per_s,prefill_std_toks_per_s,prefill_min_toks_per_s,prefill_max_toks_per_s,decoding_avg_toks_per_s,decoding_std_toks_per_s,decoding_min_toks_per_s,decoding_max_toks_per_s`n1,2.22,0.01,2.2,2.23,440,2,438,443,29.6,0.2,29.3,29.8`n2,4.17,0.03,4.1,4.2,465,3,462,469,29.1,0.1,29.0,29.3`n", $utf8)
    # Skema compare dengan load FAIL.
    [IO.File]::WriteAllText((Join-Path $temp 'cmp.csv'), "model,quant,device,mode,ctx,prefill_tps,decode_tps,load_ok,tool_call_ok,notes`nm,Q4,iGPU,Vulkan,8k,352,18,FAIL,FAIL,x`n", $utf8)
    # Artefak kegagalan load: harus diklasifikasikan, bukan 'unknown'.
    [IO.File]::WriteAllText((Join-Path $temp 'loadfail.csv'), "model,device,status,error,free_ram_gb`nm,NPU2,GAGAL_LOAD,0xc01e0200,8.73`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $temp 'testfail.csv'), "model,device,mode,result,detail`nm,NPU2,performance,FAIL,XRT 0xc01e0200`n", $utf8)
    # Skema tanpa tool_call tapi dengan iterations.
    [IO.File]::WriteAllText((Join-Path $temp 'v1.csv'), "model,device,mode,ctx,ttft_s,prefill_tps,decode_tps,iterations`nm,NPU2,performance,1k,1.2,802,28,2`n", $utf8)
    # Output fungsional tidak valid: tidak boleh dianggap komparabel.
    [IO.File]::WriteAllText((Join-Path $temp 'funcbad.csv'), "model,device,mode,ctx,ttft_s,prefill_tps,decode_tps,iterations,functional_status`nm,NPU2,performance,1k,0.9,1101,21,2,INVALID_OUTPUT`n", $utf8)

    $report = Get-RerunReport $temp
    if ($report.files -ne 8) { $failures.Add("harus 8 berkas, dapat $($report.files)") }
    $v2ok = @($report.groups | Where-Object { $_.file -eq 'v2ok.csv' })[0]
    if (-not $v2ok.comparable -or $v2ok.schema -ne 'bench-v2') { $failures.Add("v2ok harus bench-v2 komparabel: $($v2ok.issues -join '; ')") }
    $v2bad = @($report.groups | Where-Object { $_.file -eq 'v2bad.csv' })[0]
    if ($v2bad.comparable) { $failures.Add('v2bad harus non-komparabel') }
    if (@($v2bad.issues | Where-Object { $_ -match 'tidak seragam' }).Count -eq 0) { $failures.Add('alasan iterations tidak seragam hilang') }
    if (@($v2bad.issues | Where-Object { $_ -match 'tidak penuh' }).Count -eq 0) { $failures.Add('alasan tool_call tidak penuh hilang') }
    $agg = @($report.groups | Where-Object { $_.file -eq 'agg.csv' })[0]
    if (-not $agg.comparable -or $agg.schema -ne 'bench-agg') { $failures.Add("bench-agg harus komparabel tanpa kolom iterations: $($agg.issues -join '; ')") }
    $cmp = @($report.groups | Where-Object { $_.file -eq 'cmp.csv' })[0]
    if ($cmp.comparable -or @($cmp.issues | Where-Object { $_ -match 'load_ok' }).Count -eq 0) { $failures.Add('compare dengan load FAIL harus non-komparabel') }
    $loadFail = @($report.groups | Where-Object { $_.file -eq 'loadfail.csv' })[0]
    if ($loadFail.schema -ne 'load-failed' -or @($loadFail.issues | Where-Object { $_ -match 'artefak kegagalan' }).Count -eq 0) { $failures.Add('artefak load gagal harus diklasifikasikan load-failed') }
    $testFail = @($report.groups | Where-Object { $_.file -eq 'testfail.csv' })[0]
    if ($testFail.schema -ne 'test-failed') { $failures.Add('artefak tes gagal harus diklasifikasikan test-failed') }
    $v1 = @($report.groups | Where-Object { $_.file -eq 'v1.csv' })[0]
    if ($v1.schema -ne 'bench-v1' -or -not $v1.comparable) { $failures.Add("bench-v1 harus komparabel: $($v1.issues -join '; ')") }
    $funcBad = @($report.groups | Where-Object { $_.file -eq 'funcbad.csv' })[0]
    if ($funcBad.schema -ne 'bench-functional' -or $funcBad.comparable) { $failures.Add('output fungsional tidak valid harus non-komparabel') }
    if (@($funcBad.issues | Where-Object { $_ -match 'fungsional' }).Count -eq 0) { $failures.Add('alasan output fungsional hilang') }
    if (@($report.groups | Where-Object { $_.schema -eq 'unknown' }).Count -ne 0) { $failures.Add('tidak boleh ada skema unknown pada data uji') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Rerun comparability self-check passed: tiga skema CSV dikenali, alasan tidak komparabel tercatat.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

Get-RerunReport $ResultsDir | ConvertTo-Json -Depth 6
exit 0
