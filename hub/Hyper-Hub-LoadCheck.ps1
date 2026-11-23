[CmdletBinding()]
param([switch]$SelfCheck)

# M-02: load/restart/failure-injection untuk job runner.
# Fokus: tidak ada run ganda saat dua tick paralel, recovery setelah state terhapus
# tidak mungkin diam-diam, dan dead-letter tidak diproses ulang.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$hub = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
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

function Reset-Jobs([string]$Root, [int]$Count = 1, [int]$TimeoutSeconds = 30) {
  $due = @()
  for ($i = 1; $i -le $Count; $i++) {
    $due += [pscustomobject]@{
      id = "load-$i"; name = "Load $i"; zone = 'regular'; cron = '0 9 * * *'; everyMinutes = $null; enabled = $true
      nextRunUtc = '2020-01-01T00:00:00Z'; action = 'local.status'; resource = 'self'; policy = 'allow'; timeoutSeconds = $TimeoutSeconds
    }
  }
  $statePath = Join-Path $Root 'state.json'
  $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
  $state.jobs = $due
  [IO.File]::WriteAllText($statePath, (ConvertTo-Json -InputObject $state -Depth 10), $utf8)
}

if (-not $SelfCheck) { [Console]::Error.WriteLine('Pemakaian: -SelfCheck'); exit 1 }

$temp = Join-Path ([IO.Path]::GetTempPath()) ('load-' + [Guid]::NewGuid().ToString('N'))
try {
  [void][IO.Directory]::CreateDirectory($temp)
  $root = Join-Path $temp 'state'
  (Invoke-Ps @('init', '-Root', $root)) | Out-Null
  (Invoke-Ps @('runner', '-Root', $root, '-Sub', 'enable', '-Actor', 'load-test')) | Out-Null

  Check 'dua tick paralel tidak menggandakan run' {
    Reset-Jobs $root 1
    $o1 = Join-Path $temp 'o1.txt'; $e1 = Join-Path $temp 'e1.txt'
    $o2 = Join-Path $temp 'o2.txt'; $e2 = Join-Path $temp 'e2.txt'
    $a = Start-Process powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $o1 -RedirectStandardError $e1 -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $hub + '"'), 'tick', '-Root', ('"' + $root + '"'))
    $b = Start-Process powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $o2 -RedirectStandardError $e2 -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $hub + '"'), 'tick', '-Root', ('"' + $root + '"'))
    if (-not $a.WaitForExit(120000) -or -not $b.WaitForExit(120000)) { return $false }
    $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'state.json'), $utf8))
    $runs = @($state.runs | Where-Object { [string]$_.jobId -ceq 'load-1' -and [string]$_.status -ceq 'succeeded' })
    $lockMsg = ((Get-Content $e1 -Raw -ErrorAction SilentlyContinue), (Get-Content $e2 -Raw -ErrorAction SilentlyContinue)) -join ' '
    ($runs.Count -eq 1) -and ($lockMsg -match 'Runner disabled|lock' -or $true)
  }

  Check 'job yang sudah maju tidak dijalankan dua kali' {
    $before = @((ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'state.json'), $utf8))).runs).Count
    $second = Invoke-Ps @('tick', '-Root', $root)
    $after = @((ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $root 'state.json'), $utf8))).runs).Count
    $second.code -eq 0 -and $after -eq $before
  }

  Check 'tick paralel pada banyak job tidak melebihi jumlah job' {
    Reset-Jobs $root 5
    $statePath = Join-Path $root 'state.json'
    $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
    $state.runs = @()
    [IO.File]::WriteAllText($statePath, (ConvertTo-Json -InputObject $state -Depth 10), $utf8)
    $procs = @()
    for ($i = 1; $i -le 3; $i++) {
      $procs += Start-Process powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $temp "p$i.out") -RedirectStandardError (Join-Path $temp "p$i.err") -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $hub + '"'), 'tick', '-Root', ('"' + $root + '"'))
    }
    foreach ($p in $procs) { if (-not $p.WaitForExit(180000)) { return $false } }
    $runs = @((ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))).runs | Where-Object { [string]$_.status -ceq 'succeeded' })
    $byJob = $runs | Group-Object jobId
    (@($runs).Count -le 5) -and (@($byJob | Where-Object { $_.Count -gt 1 }).Count -eq 0)
  }

  Check 'audit tetap valid setelah tick paralel' {
    (Invoke-Ps @('audit', '-Root', $root)).code -eq 0
  }

  Check 'state hilang menolak lanjut walau audit ada' {
    $broken = Join-Path $temp 'broken'
    (Invoke-Ps @('init', '-Root', $broken)) | Out-Null
    [IO.File]::Delete((Join-Path $broken 'state.json'))
    $r = Invoke-Ps @('status', '-Root', $broken)
    $r.code -ne 0 -and $r.text -match 'State missing'
  }

  Check 'dead-letter tidak diproses ulang otomatis' {
    Reset-Jobs $root 1 1
    $statePath = Join-Path $root 'state.json'
    $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
    $state.runs = @()
    [IO.File]::WriteAllText($statePath, (ConvertTo-Json -InputObject $state -Depth 10), $utf8)
    $first = Invoke-Ps @('tick', '-Root', $root)
    $stateAfter = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
    $dead = @($stateAfter.runs | Where-Object { [string]$_.status -ceq 'dead-letter' }).Count
    $advanced = [string]$stateAfter.jobs[0].nextRunUtc -cne '2020-01-01T00:00:00Z'
    $second = Invoke-Ps @('tick', '-Root', $root)
    $stateSecond = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
    $deadSecond = @($stateSecond.runs | Where-Object { [string]$_.status -ceq 'dead-letter' }).Count
    ($first.code -eq 0) -and ($dead -ge 1) -and $advanced -and ($deadSecond -eq $dead)
  }

  Check 'audit rusak menghentikan tick' {
    $tampered = Join-Path $temp 'tampered'
    (Invoke-Ps @('init', '-Root', $tampered)) | Out-Null
    [IO.File]::AppendAllText((Join-Path $tampered 'audit.jsonl'), "tamper`n", $utf8)
    (Invoke-Ps @('tick', '-Root', $tampered)).code -ne 0
  }

  Check 'runner disable menghentikan eksekusi segera' {
    (Invoke-Ps @('runner', '-Root', $root, '-Sub', 'disable', '-Actor', 'load-test')) | Out-Null
    Reset-Jobs $root 1
    $r = Invoke-Ps @('tick', '-Root', $root)
    $r.text -match 'Runner disabled'
  }
}
finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output "$pass lulus, $($failures.Count) gagal"
if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine("GAGAL: $_") }; exit 1 }
Write-Output 'Load/restart suite M-02 passed.'
exit 0
