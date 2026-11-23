[CmdletBinding()]
param([switch]$SelfCheck)

# B-08: drill runbook otomatis. Menjalankan setiap langkah runbook yang bisa dieksekusi
# (start/status/stop/backup/restore/audit/rollback) pada root sementara, lalu memastikan
# dokumen runbook tetap menyebut semua langkah. Persetujuan "diuji orang lain" tetap
# butuh manusia; skrip ini hanya membuktikan perintahnya benar-benar berjalan.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$hub = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$runbook = Join-Path $PSScriptRoot 'docs\Runbook.md'
$pass = 0
$failures = New-Object System.Collections.Generic.List[string]

function Invoke-Ps([string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hub @Arguments 2>&1
    return [pscustomobject]@{ code = $LASTEXITCODE; text = ([string]($output | Out-String)).Trim() }
  } finally { $ErrorActionPreference = $previous }
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

$temp = Join-Path ([IO.Path]::GetTempPath()) ('runbook-' + [Guid]::NewGuid().ToString('N'))
try {
  [void][IO.Directory]::CreateDirectory($temp)
  $root = Join-Path $temp 'state'
  $backupDir = Join-Path $temp 'backup'

  Check 'START: init lalu status bersih' {
    $init = Invoke-Ps @('init', '-Root', $root)
    $status = Invoke-Ps @('status', '-Root', $root)
    $json = $status.text | ConvertFrom-Json
    $init.code -eq 0 -and $status.code -eq 0 -and $json.lastAuditHash -match '^0{64}$'
  }

  Check 'START: health melaporkan rantai valid dan lock bebas' {
    $health = (Invoke-Ps @('health', '-Root', $root)).text | ConvertFrom-Json
    $health.auditChain -ceq 'valid' -and $health.lockFree -eq $true -and $health.executable -eq $false
  }

  Check 'STOP: tidak ada runner yang menahan lock setelah perintah selesai' {
    $health = (Invoke-Ps @('health', '-Root', $root)).text | ConvertFrom-Json
    $health.lockFree -eq $true
  }

  Check 'BACKUP: backup tercatat dan checksum dibuat' {
    $result = Invoke-Ps @('backup', '-Root', $root, '-BackupPath', $backupDir)
    if ($result.code -ne 0) { return $false }
    (Test-Path (Join-Path $backupDir 'SHA256SUMS.json')) -and (Test-Path (Join-Path $backupDir 'state.json'))
  }

  Check 'RESTORE: restore dari backup mempertahankan audit valid' {
    $result = Invoke-Ps @('restore', '-Root', $root, '-BackupPath', $backupDir)
    if ($result.code -ne 0) { return $false }
    ((($result.text | ConvertFrom-Json).auditChain) -ceq 'valid') -and ((Invoke-Ps @('audit', '-Root', $root)).code -eq 0)
  }

  Check 'AUDIT: chain valid setelah restore' {
    (Invoke-Ps @('audit', '-Root', $root)).text -match 'Audit chain valid'
  }

  Check 'ROLLBACK: restore backup rusak ditolak tanpa mengubah state' {
    $statePath = Join-Path $root 'state.json'
    $before = [IO.File]::ReadAllText($statePath, $utf8)
    [IO.File]::AppendAllText((Join-Path $backupDir 'audit.jsonl'), "`n")
    $result = Invoke-Ps @('restore', '-Root', $root, '-BackupPath', $backupDir)
    $result.code -ne 0 -and ([IO.File]::ReadAllText($statePath, $utf8) -ceq $before)
  }

  Check '7: init ulang dengan audit hilang ditolak' {
    $broken = Join-Path $temp 'broken'
    (Invoke-Ps @('init', '-Root', $broken)) | Out-Null
    [IO.File]::Delete((Join-Path $broken 'audit.jsonl'))
    $result = Invoke-Ps @('init', '-Root', $broken)
    $result.code -ne 0 -and -not (Test-Path (Join-Path $broken 'audit.jsonl'))
  }

  Check 'runbook memuat semua bagian wajib' {
    $text = [IO.File]::ReadAllText($runbook, $utf8)
    $required = @('## 2. START', '## 3. STOP', '## 4. STATUS', '## 5. BACKUP', '## 6. RESTORE', '## 7.', '## 8. UPGRADE', '## 9. ROLLBACK')
    foreach ($section in $required) { if ($text.IndexOf($section, [StringComparison]::Ordinal) -lt 0) { return $false } }
    $true
  }

  Check 'runbook memakai perintah backup/restore Hub, bukan hanya salin manual' {
    $text = [IO.File]::ReadAllText($runbook, $utf8)
    $text -match 'Hyper-Hub\.ps1 backup' -and $text -match 'Hyper-Hub\.ps1 restore'
  }
}
finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output "$pass lulus, $($failures.Count) gagal"
if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine("GAGAL: $_") }; exit 1 }
Write-Output 'Runbook drill B-08 passed.'
exit 0
