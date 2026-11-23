[CmdletBinding()]
param(
  [string]$Root,
  [string]$OutDir,
  [string]$Sub = 'recap',
  [string]$Id,
  [string]$Actor,
  [int]$Days = 7,
  [string]$SnoozeUntil,
  [switch]$SelfCheck
)

# F-08: rekap mingguan deterministik dengan provenance.
# Setiap klaim menunjuk sumber (runId/jobId atau baris audit), tanpa prompt mentah.
# F-09: reminder lokal dengan aksi snooze/done; status tersimpan dan diaudit.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Sha([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Read-JsonFile([string]$Path, $Default) {
  if (-not [IO.File]::Exists($Path)) { return $Default }
  return (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8)))
}

function Read-AuditRows([string]$Path, [int]$SinceDays) {
  if (-not [IO.File]::Exists($Path)) { return @() }
  $cutoff = [DateTime]::UtcNow.AddDays(-$SinceDays)
  $rows = @()
  foreach ($line in [IO.File]::ReadAllLines($Path, $utf8)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $record = ConvertFrom-Json -InputObject $line } catch { continue }
    $at = [DateTime]::MinValue
    if (-not [DateTime]::TryParse([string]$record.timestamp, [ref]$at)) { continue }
    if ($at.ToUniversalTime() -lt $cutoff) { continue }
    $rows += $record
  }
  return $rows
}

function New-WeeklyRecap([string]$RootPath, [string]$OutputDir, [int]$WindowDays) {
  $state = Read-JsonFile (Join-Path $RootPath 'state.json') $null
  if ($null -eq $state) { throw 'State tidak ada; rekap ditolak (fail-closed).' }
  $audit = Read-AuditRows (Join-Path $RootPath 'audit.jsonl') $WindowDays
  $runs = @($state.runs | Where-Object {
      $at = [DateTime]::MinValue
      [DateTime]::TryParse([string]$_.finishedAtUtc, [ref]$at) -and $at.ToUniversalTime() -ge [DateTime]::UtcNow.AddDays(-$WindowDays)
    })

  $succeeded = @($runs | Where-Object { [string]$_.status -ceq 'succeeded' })
  $dead = @($runs | Where-Object { [string]$_.status -ceq 'dead-letter' })
  $blocked = @($audit | Where-Object { [string]$_.event -ceq 'job.blocked' })
  $missed = @($audit | Where-Object { [string]$_.event -ceq 'job.missed' })

  $lines = @(
    '# Rekap mingguan Hyper Hub',
    '',
    '<!-- HYPER_AI_MANAGED: weekly recap -->',
    '',
    "Periode: $([DateTime]::UtcNow.AddDays(-$WindowDays).ToString('yyyy-MM-dd')) s/d $([DateTime]::UtcNow.ToString('yyyy-MM-dd'))",
    '',
    '> Rekap faktual dari state dan audit. Bukan ringkasan model; setiap angka menunjuk sumber.',
    '',
    '## Ringkasan',
    '',
    "| Metrik | Jumlah | Sumber |",
    "| --- | --- | --- |",
    "| Job sukses | $($succeeded.Count) | state.json runs |",
    "| Dead-letter | $($dead.Count) | state.json runs |",
    "| Diblokir policy | $($blocked.Count) | audit job.blocked |",
    "| Terlewat (grace) | $($missed.Count) | audit job.missed |",
    "| Job aktif | $(@($state.jobs | Where-Object { $_.enabled }).Count) | state.json jobs |",
    ''
  )

  if ($succeeded.Count -gt 0) {
    $lines += @('## Run sukses (provenance)', '')
    foreach ($run in ($succeeded | Select-Object -First 20)) {
      $lines += "- ``$($run.runId)`` job ``$($run.jobId)`` percobaan $($run.attempts) pada $($run.finishedAtUtc)"
    }
    $lines += ''
  }
  if ($dead.Count -gt 0) {
    $lines += @('## Dead-letter (perlu tindakan)', '')
    foreach ($run in ($dead | Select-Object -First 20)) {
      $lines += "- ``$($run.runId)`` job ``$($run.jobId)`` error: $($run.error)"
    }
    $lines += ''
  }
  if ($blocked.Count -gt 0 -or $missed.Count -gt 0) {
    $lines += @('## Peristiwa kebijakan', '')
    foreach ($row in (@($blocked) + @($missed) | Select-Object -First 20)) {
      $lines += "- $($row.event) job ``$($row.jobId)``: $($row.result) (hash $(([string]$row.hash).Substring(0, 12)))"
    }
    $lines += ''
  }
  $lines += @('## Batas', '', '- Rekap hanya memuat metadata; tidak ada isi percakapan, kredensial, atau data perkara.', '')

  $content = ($lines -join "`n")
  $hash = Get-Sha $content
  $file = Join-Path $OutputDir 'rekap-mingguan.md'
  $changed = $true
  if ([IO.File]::Exists($file)) {
    $existing = [IO.File]::ReadAllText($file, $utf8)
    if ($existing -and -not $existing.Contains('HYPER_AI_MANAGED: weekly recap')) { throw "Menolak menimpa file pengguna: $file" }
    if ((Get-Sha $existing) -ceq $hash) { $changed = $false }
  }
  if ($changed) {
    [void][IO.Directory]::CreateDirectory($OutputDir)
    [IO.File]::WriteAllText($file, $content, $utf8)
  }
  return [pscustomobject]@{ file = $file; changed = $changed; succeeded = $succeeded.Count; deadLetter = $dead.Count; blocked = $blocked.Count; missed = $missed.Count }
}

function Get-ReminderPath([string]$RootPath) { return (Join-Path $RootPath 'reminders.json') }

function Read-Reminders([string]$RootPath) {
  $store = Read-JsonFile (Get-ReminderPath $RootPath) ([pscustomobject]@{ version = 1; items = [pscustomobject]@{} })
  if ($store.version -ne 1 -or $null -eq $store.items) { throw 'Reminder store tidak sah.' }
  return $store
}

function Save-Reminders([string]$RootPath, $Store) {
  $path = Get-ReminderPath $RootPath
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $Store -Depth 8), $utf8)
  if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
  [IO.File]::Move($tmp, $path)
}

function Invoke-Reminder([string]$RootPath, [string]$Mode) {
  $store = Read-Reminders $RootPath
  $now = [DateTime]::UtcNow
  switch ($Mode) {
    'list' {
      $rows = @($store.items.PSObject.Properties | ForEach-Object {
          $r = $_.Value
          [pscustomobject]@{ id = $_.Name; status = [string]$r.status; dueAtUtc = [string]$r.dueAtUtc; note = [string]$r.note; updatedAtUtc = [string]$r.updatedAtUtc }
        } | Sort-Object dueAtUtc)
      return [pscustomobject]@{ count = $rows.Count; open = @($rows | Where-Object { $_.status -ceq 'open' }).Count; items = $rows } | ConvertTo-Json -Depth 4
    }
    'add' {
      if ([string]::IsNullOrWhiteSpace($Id) -or $Id -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$') { throw 'Id reminder tidak sah.' }
      if ([string]::IsNullOrWhiteSpace($Actor)) { throw 'Parameter -Actor wajib untuk reminder add.' }
      if ($null -ne $store.items.PSObject.Properties[$Id]) { throw "Reminder sudah ada: $Id" }
      $due = if ([string]::IsNullOrWhiteSpace($SnoozeUntil)) { $now.AddDays(7) } else { [DateTime]::Parse($SnoozeUntil).ToUniversalTime() }
      $item = [pscustomobject]@{ status = 'open'; dueAtUtc = $due.ToString('o'); note = ''; createdBy = $Actor; updatedAtUtc = $now.ToString('o') }
      $store.items | Add-Member -NotePropertyName $Id -NotePropertyValue $item -Force
      Save-Reminders $RootPath $store
      return [pscustomobject]@{ id = $Id; status = 'open'; dueAtUtc = $item.dueAtUtc } | ConvertTo-Json -Depth 3
    }
    'snooze' {
      if ([string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib.' }
      if ([string]::IsNullOrWhiteSpace($SnoozeUntil)) { throw 'Parameter -SnoozeUntil wajib untuk snooze.' }
      $item = $store.items.PSObject.Properties[$Id]
      if ($null -eq $item) { throw "Reminder tidak ada: $Id" }
      $until = [DateTime]::Parse($SnoozeUntil).ToUniversalTime()
      if ($until -le $now) { throw 'SnoozeUntil harus di masa depan.' }
      $item.Value.status = 'snoozed'; $item.Value.dueAtUtc = $until.ToString('o'); $item.Value.updatedAtUtc = $now.ToString('o')
      Save-Reminders $RootPath $store
      return [pscustomobject]@{ id = $Id; status = 'snoozed'; dueAtUtc = $item.Value.dueAtUtc } | ConvertTo-Json -Depth 3
    }
    'done' {
      if ([string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib.' }
      $item = $store.items.PSObject.Properties[$Id]
      if ($null -eq $item) { throw "Reminder tidak ada: $Id" }
      $item.Value.status = 'done'; $item.Value.updatedAtUtc = $now.ToString('o')
      Save-Reminders $RootPath $store
      return [pscustomobject]@{ id = $Id; status = 'done' } | ConvertTo-Json -Depth 3
    }
    default { throw 'Sub reminder: list, add, snooze, done.' }
  }
}

if ($Sub -ceq 'self-check') {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('recap-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $state = [pscustomobject]@{
      version = 1
      jobs = @([pscustomobject]@{ id = 'j1'; name = 'J1'; zone = 'regular'; cron = '0 9 * * *'; everyMinutes = $null; enabled = $true; nextRunUtc = '2026-12-01T00:00:00Z'; action = 'local.status'; resource = 'self'; policy = 'allow' })
      runs = @(
        [pscustomobject]@{ runId = 'r1'; jobId = 'j1'; status = 'succeeded'; attempts = 1; finishedAtUtc = [DateTime]::UtcNow.AddHours(-2).ToString('o') }
        [pscustomobject]@{ runId = 'r2'; jobId = 'j1'; status = 'dead-letter'; attempts = 3; error = 'timeout'; finishedAtUtc = [DateTime]::UtcNow.AddHours(-1).ToString('o') }
      )
      lastAuditHash = ('0' * 64)
    }
    [IO.File]::WriteAllText((Join-Path $temp 'state.json'), (ConvertTo-Json -InputObject $state -Depth 8), $utf8)
    $auditLines = @(
      (@{ timestamp = [DateTime]::UtcNow.AddHours(-3).ToString('o'); event = 'job.blocked'; jobId = 'j1'; decision = 'deny'; result = 'policy'; previousHash = ('0' * 64); hash = ('a' * 64) } | ConvertTo-Json -Compress)
      (@{ timestamp = [DateTime]::UtcNow.AddHours(-4).ToString('o'); event = 'job.missed'; jobId = 'j1'; decision = 'deny'; result = 'terlambat 300 menit'; previousHash = ('a' * 64); hash = ('b' * 64) } | ConvertTo-Json -Compress)
    )
    [IO.File]::WriteAllText((Join-Path $temp 'audit.jsonl'), (($auditLines -join "`n") + "`n"), $utf8)

    $out = Join-Path $temp 'out'
    $recap = New-WeeklyRecap $temp $out 7
    $text = [IO.File]::ReadAllText($recap.file, $utf8)
    if ($recap.succeeded -ne 1 -or $recap.deadLetter -ne 1 -or $recap.blocked -ne 1 -or $recap.missed -ne 1) { $failures.Add("hitungan rekap salah: $($recap | ConvertTo-Json -Compress)") }
    if ($text -notmatch 'HYPER_AI_MANAGED: weekly recap') { $failures.Add('marker managed hilang') }
    if ($text -notmatch 'r1' -or $text -notmatch 'r2' -or $text -notmatch 'job\.blocked') { $failures.Add('provenance tidak lengkap') }
    if ($text -match 'prompt|rahasia|password') { $failures.Add('rekap memuat kata sensitif') }
    $second = New-WeeklyRecap $temp $out 7
    if ($second.changed) { $failures.Add('rekap identik tidak boleh ditulis ulang') }
    [IO.File]::WriteAllText($recap.file, 'milik pengguna', $utf8)
    $threw = $false
    try { New-WeeklyRecap $temp $out 7 | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('harus menolak menimpa file pengguna') }

    # F-09 reminder.
    [IO.File]::WriteAllText((Join-Path $temp 'reminders.json'), '{"version":1,"items":{}}', $utf8)
    $script:Root = $temp; $script:Id = 'rem-1'; $script:Actor = 'uji'; $script:SnoozeUntil = ''
    (Invoke-Reminder $temp 'add' | ConvertFrom-Json) | Out-Null
    $list = Invoke-Reminder $temp 'list' | ConvertFrom-Json
    if ($list.count -ne 1 -or $list.open -ne 1) { $failures.Add('reminder add/list gagal') }
    $script:SnoozeUntil = [DateTime]::UtcNow.AddDays(2).ToString('o')
    $snoozed = Invoke-Reminder $temp 'snooze' | ConvertFrom-Json
    if ($snoozed.status -cne 'snoozed') { $failures.Add('snooze gagal') }
    $past = [DateTime]::UtcNow.AddDays(-1).ToString('o')
    $script:SnoozeUntil = $past
    $threw = $false
    try { Invoke-Reminder $temp 'snooze' | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('snooze ke masa lalu harus ditolak') }
    $done = Invoke-Reminder $temp 'done' | ConvertFrom-Json
    if ($done.status -cne 'done') { $failures.Add('done gagal') }
    if ((Invoke-Reminder $temp 'list' | ConvertFrom-Json).open -ne 0) { $failures.Add('setelah done, open harus 0') }
    $script:Id = 'bad id!'
    $threw = $false
    try { Invoke-Reminder $temp 'add' | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('id reminder tak sah harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Recap/reminder self-check passed: provenance lengkap, idempotensi, file pengguna aman, snooze/done.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root)) { [Console]::Error.WriteLine('Pemakaian: -Root <state> [-Sub recap|reminder] ...'); exit 1 }
try {
  switch ($Sub) {
    'recap' {
      $target = if ([string]::IsNullOrWhiteSpace($OutDir)) { Join-Path $Root 'rekap' } else { $OutDir }
      New-WeeklyRecap $Root $target $Days | ConvertTo-Json -Depth 3
    }
    'reminder' {
      if ([string]::IsNullOrWhiteSpace($Actor)) { $Actor = 'sistem' }
      Invoke-Reminder $Root 'list' | Out-Null
      $mode = if ($PSBoundParameters.ContainsKey('Id') -and [string]::IsNullOrWhiteSpace($SnoozeUntil)) { 'done' } else { 'list' }
      Invoke-Reminder $Root $mode
    }
    default { [Console]::Error.WriteLine('Sub: recap, reminder, self-check'); exit 1 }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
