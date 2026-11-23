[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('init', 'status', 'discover', 'policy-check', 'add', 'run', 'tick', 'audit', 'self-check', 'jobs', 'schedule', 'remove', 'pause', 'resume', 'health', 'remote', 'backup', 'restore')]
  [string]$Command = 'status',
  [string]$Zone,
  [string]$Operation,
  [string]$Id,
  [string]$Name,
  [string]$EveryMinutes,
  [string]$Cron,
  [string]$Action,
  [string]$Resource,
  [string]$Policy = 'deny',
  [string]$Origin,
  [string]$OwnerId,
  [string]$Channel,
  [switch]$Reset,
  [string]$ServerVersion,
  [string]$ApiUrl,
  [string]$ModelProvider,
  [string]$ModelId,
  [string]$Sub,
  [switch]$DryRun,
  [string]$BackupPath,
  [string]$Root = (Join-Path $PWD.Path '.hyper-hub')
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$statePath = Join-Path $Root 'state.json'
$auditPath = Join-Path $Root 'audit.jsonl'
$lockPath = Join-Path $Root 'runner.lock'
$timeZoneId = 'Asia/Jakarta'
$exitFailure = 1
$idPattern = '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'
$cronPattern = '^(\*|\d{1,2}|\*/\d{1,2}|\d{1,2}-\d{1,2})( (\*|\d{1,2}|\*/\d{1,2}|\d{1,2}-\d{1,2})){4}$'
$utcPattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'

function Get-Hash([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $utf8.GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Write-Atomic([string]$Path, [string]$Text) {
  if (-not ('HyperHubNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HyperHubNative {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "ReplaceFileW")]
  public static extern bool ReplaceFile(string replaced, string replacement, IntPtr backup, uint flags, IntPtr exclude, IntPtr reserved);
}
'@
  }
  $full = [System.IO.Path]::GetFullPath($Path)
  $temp = "$full.$([Guid]::NewGuid().ToString('N')).tmp"
  try {
    [System.IO.File]::WriteAllText($temp, $Text, $utf8)
    if (-not [System.IO.File]::Exists($full)) {
      [System.IO.File]::Move($temp, $full)
    } elseif (-not [HyperHubNative]::ReplaceFile($full, $temp, [IntPtr]::Zero, 2, [IntPtr]::Zero, [IntPtr]::Zero)) {
      throw "ReplaceFile gagal ($([Runtime.InteropServices.Marshal]::GetLastWin32Error())) untuk $full"
    }
  } finally {
    if ([System.IO.File]::Exists($temp)) { [System.IO.File]::Delete($temp) }
  }
}

function New-State {
  return [ordered]@{ version = 1; jobs = @(); runs = @(); lastAuditHash = ('0' * 64) }
}

function Get-JobError($Job) {
  if ($null -eq $Job -or $Job -isnot [pscustomobject]) { return 'job bukan objek' }
  $allowed = @('id', 'name', 'zone', 'cron', 'everyMinutes', 'enabled', 'nextRunUtc', 'action', 'resource', 'policy')
  foreach ($field in $Job.PSObject.Properties.Name) { if ($field -cnotin $allowed) { return "field tidak dikenal: $field" } }
  foreach ($field in $allowed) { if ($field -cnotin $Job.PSObject.Properties.Name) { return "field wajib hilang: $field" } }
  if ([string]$Job.id -notmatch $idPattern) { return 'id' }
  if ([string]$Job.name -notmatch '\S' -or ([string]$Job.name).Length -gt 80 -or [string]$Job.name -match '[\x00-\x1f\x7f]') { return 'name' }
  if ($Job.enabled -isnot [bool]) { return 'enabled' }
  if ([string]$Job.nextRunUtc -notmatch $utcPattern) { return 'nextRunUtc' }
  try { [DateTime]::ParseExact([string]$Job.nextRunUtc, 'yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture) | Out-Null } catch { return 'nextRunUtc' }
  if ([string]$Job.zone -cnotin @('case', 'regular')) { return 'zone' }
  if ([string]$Job.cron -notmatch $cronPattern) { return 'cron' }
  if ($Job.action -cne 'local.status') { return 'action (hanya local.status selama registry kosong)' }
  if ($Job.resource -cne 'self') { return 'resource (hanya self selama registry kosong)' }
  if ([string]$Job.policy -cnotin @('allow', 'ask', 'deny')) { return 'policy' }
  if ($null -ne $Job.everyMinutes -and ($Job.everyMinutes -isnot [int] -or $Job.everyMinutes -lt 1 -or $Job.everyMinutes -gt 1440)) { return 'everyMinutes' }
  try { Read-Cron ([string]$Job.cron) | Out-Null } catch { return "cron ($($_.Exception.Message))" }
  return $null
}

function Read-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    if (Test-Path -LiteralPath $auditPath) { throw 'State missing while audit exists; refuse to continue.' }
    return (New-State)
  }
  $raw = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8
  $state = ConvertFrom-Json -InputObject $raw
  if ($state.version -ne 1 -or $state.jobs -isnot [array] -or $state.runs -isnot [array] -or [string]$state.lastAuditHash -notmatch '^[a-f0-9]{64}$') {
    throw 'State format invalid; refuse to continue.'
  }
  $jobIds = @($state.jobs | ForEach-Object { [string]$_.id })
  if (($jobIds | Select-Object -Unique).Count -ne $jobIds.Count) { throw 'Duplicate job IDs in state; refuse to continue.' }
  foreach ($job in $state.jobs) {
    $problem = Get-JobError $job
    if ($null -ne $problem) { throw "Job state invalid ($($job.id)): field $problem; refuse to continue." }
  }
  return $state
}

function Save-State($State) {
  $json = ConvertTo-Json -InputObject $State -Depth 20
  Write-Atomic -Path $statePath -Text $json
}

function New-AuditRecord($State, [string]$Event, [string]$JobId, [string]$Decision, [string]$Result) {
  if ([System.IO.File]::Exists($auditPath) -and -not (Test-Audit $State)) {
    throw 'AUDIT INVALID: refusing append to broken chain.'
  }
  $record = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    event = $Event
    jobId = $JobId
    decision = $Decision
    result = $Result
    previousHash = [string]$State.lastAuditHash
  }
  $canonical = ConvertTo-Json -InputObject $record -Compress -Depth 5
  $record.hash = Get-Hash $canonical
  $State.lastAuditHash = $record.hash
  return (ConvertTo-Json -InputObject $record -Compress -Depth 5)
}

function Add-Audit($State, [string]$Event, [string]$JobId, [string]$Decision, [string]$Result) {
  $line = New-AuditRecord $State $Event $JobId $Decision $Result
  [System.IO.File]::AppendAllText($auditPath, "$line`n", $utf8)
}

function Save-Commit($State, [string]$Event, [string]$JobId, [string]$Decision, [string]$Result) {
  # Urutan wajib: hitung record -> simpan state -> append audit. Gagal di langkah mana pun
  # tidak boleh membuat rantai audit menyimpang dari lastAuditHash di state.
  $line = New-AuditRecord $State $Event $JobId $Decision $Result
  Save-State $State
  [System.IO.File]::AppendAllText($auditPath, "$line`n", $utf8)
}

function Write-Status($State) {
  [pscustomobject]@{
    root = $Root
    jobs = @($State.jobs).Count
    enabled = @($State.jobs | Where-Object { $_.enabled }).Count
    successfulRuns = @($State.runs | Where-Object { $_.status -eq 'succeeded' }).Count
    failedRuns = @($State.runs | Where-Object { $_.status -eq 'failed' }).Count
    lastAuditHash = $State.lastAuditHash
  } | ConvertTo-Json -Depth 5
}

function Get-Discovery {
  $found = @()
  $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1') })
  foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='opencode-cli.exe' OR Name='Hyper AI.exe'" -ErrorAction SilentlyContinue)) {
    if (-not $process.ExecutablePath -or $process.CommandLine -notmatch '\bserve\s+--service(?:\s|$)') { continue }
    foreach ($listener in @($listeners | Where-Object { $_.OwningProcess -eq $process.ProcessId })) {
      $found += [pscustomobject]@{
        address = $listener.LocalAddress
        port = $listener.LocalPort
        processId = $process.ProcessId
        process = $process.Name
        executable = $process.ExecutablePath
        version = $null
        authChecked = $false
        readOnly = $true
      }
    }
  }
  [pscustomobject]@{ discoveredAtUtc = [DateTime]::UtcNow.ToString('o'); services = @($found); externalRequests = $false } | ConvertTo-Json -Depth 5
}

function ConvertTo-NormalOrigin([string]$Value) {
  # ponytail: pencocokan string origin saja; tanpa DNS, proxy, atau redirect.
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  if ($Value.Length -gt 2048) { return $null }
  if ($Value -match '[\x00-\x1F\x7F]') { return $null }
  if ($Value -match '^[^/]*@') { return $null }
  $m = [regex]::Match($Value, '^(?i)(https?)://([^/?#]+)(?:[/?#]|$)')
  if (-not $m.Success) { return $null }
  $scheme = $m.Groups[1].Value.ToLowerInvariant()
  $authority = $m.Groups[2].Value.ToLowerInvariant()
  if ($authority -notmatch '^([a-z0-9.-]+)(?::(\d{1,5}))?$') { return $null }
  $hostName = $Matches[1]
  $port = if ($Matches[2]) { [int]$Matches[2] } else { if ($scheme -ceq 'https') { 443 } else { 80 } }
  if ($port -lt 1 -or $port -gt 65535) { return $null }
  if ($hostName -match '^[0-9.]+$' -or $hostName -match ':' -or $hostName -ceq 'localhost' -or $hostName -ceq '*.localhost' -or $hostName -match '\.localhost$') { return $null }
  if ($hostName -match '^\*\.(localhost|)' -or $hostName -match '\*\.\*|\.\*$' -or $hostName -match '(^|\.)\*(\.|$)') { return $null }
  return [pscustomobject]@{ scheme = $scheme; host = $hostName; port = $port; text = "${scheme}://${hostName}:$port" }
}

function Test-OriginMatch($Origin, [string]$Pattern) {
  $p = [regex]::Match($Pattern, '^([a-z]+)://([^/:]+)(?::(\d+))?$')
  if (-not $p.Success) { return $false }
  $pScheme = $p.Groups[1].Value
  $pHost = $p.Groups[2].Value
  $pPort = if ($p.Groups[3].Success) { [int]$p.Groups[3].Value } else { if ($pScheme -ceq 'https') { 443 } else { 80 } }
  if ($Origin.scheme -cne $pScheme -or $Origin.port -ne $pPort) { return $false }
  if ($pHost.StartsWith('*.')) {
    $suffix = '.' + $pHost.Substring(2)
    if (-not $Origin.host.EndsWith($suffix, [StringComparison]::Ordinal)) { return $false }
    $label = $Origin.host.Substring(0, $Origin.host.Length - $suffix.Length)
    return ($label.Length -gt 0 -and $label -notmatch '\.')
  }
  return ($Origin.host -ceq $pHost)
}

function Read-OriginPolicy([string]$Root) {
  # ponytail: policy dibaca dari root Hub; berkas tidak ada = semua deny.
  $path = Join-Path $Root 'browser-origin-policy.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  try { $policy = [IO.File]::ReadAllText($path) | ConvertFrom-Json } catch { return $null }
  foreach ($zoneName in 'regular', 'case') {
    $entry = $policy.$zoneName
    if ($null -eq $entry) { return $null }
    foreach ($allow in @($entry.allow)) {
      if ([string]::IsNullOrWhiteSpace($allow.alasan) -or [string]::IsNullOrWhiteSpace($allow.pemilik)) { return $null }
    }
  }
  return $policy
}

function Test-OriginPolicy([string]$DataZone, [string]$RawOrigin) {
  # ponytail: evaluasi statis; tidak ada navigasi, DNS, atau egress.
  $decision = 'deny'
  $reason = 'origin tidak dapat dinormalisasi'
  $origin = ConvertTo-NormalOrigin $RawOrigin
  if ($null -ne $origin) {
    $policy = Read-OriginPolicy (Split-Path -Parent $statePath)
    if ($null -eq $policy) {
      $reason = 'policy tidak terbaca'
    } else {
      $blocked = @(@($policy.block) | Where-Object { Test-OriginMatch $origin ([string]$_) })
      if (@($blocked).Count -gt 0) {
        $reason = "origin ada di blocklist: $($blocked[0])"
      } elseif ($DataZone -cnotin @('regular', 'case')) {
        $reason = 'zona tidak dikenal'
      } else {
        $zoneEntry = $policy.PSObject.Properties[$DataZone].Value
        $hits = @(@($zoneEntry.allow) | Where-Object { Test-OriginMatch $origin ([string]$_.origin) })
        if (@($hits).Count -gt 0) { $decision = 'allow'; $reason = "allowlist $DataZone : $(@($hits)[0].origin)" }
        else { $reason = "origin tidak ada di allowlist $DataZone" }
      }
    }
  }
  [pscustomobject]@{ zone = $DataZone; operation = 'browser.navigate'; origin = $origin.text; decision = $decision; reason = $reason; executable = $false } | ConvertTo-Json -Compress
}

function Test-HubPolicy([string]$DataZone, [string]$RequestedOperation, [string]$RawOrigin) {
  # ponytail: kontrak lokal Hub saja; connector wajib menegakkan policy sebelum eksekusi.
  if ($RequestedOperation -ceq 'browser.navigate') { return (Test-OriginPolicy $DataZone $RawOrigin) }
  $decision = 'deny'
  $reason = 'zone or operation not classified'
  if ($DataZone -ceq 'case' -and $RequestedOperation -ceq 'local.status') {
    $decision = 'allow'; $reason = 'case local status only'
  } elseif ($DataZone -ceq 'case') {
    $reason = 'case zone blocks all other operations'
  } elseif ($DataZone -ceq 'regular' -and $RequestedOperation -ceq 'local.status') {
    $decision = 'allow'; $reason = 'regular local status'
  } elseif ($DataZone -ceq 'regular' -and $RequestedOperation -ceq 'external.send') {
    $reason = 'regular external operation needs reviewed connector and approval'
  }
  [pscustomobject]@{ zone = $DataZone; operation = $RequestedOperation; decision = $decision; reason = $reason; executable = $false } | ConvertTo-Json -Compress
}

function Get-JakartaZone {
  # ponytail: zona tetap Asia/Jakarta; ubah ke parameter saat perlu lokasi lain.
  try { return [System.TimeZoneInfo]::FindSystemTimeZoneById($timeZoneId) } catch { return [System.TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time') }
}

$cronFields = @(
  @{ Name = 'menit'; Min = 0; Max = 59 },
  @{ Name = 'jam'; Min = 0; Max = 23 },
  @{ Name = 'hari'; Min = 1; Max = 31 },
  @{ Name = 'bulan'; Min = 1; Max = 12 },
  @{ Name = 'minggu'; Min = 0; Max = 7 }
)

function ConvertTo-CronField([string]$Value, [string]$FieldName, [int]$Min, [int]$Max) {
  # ponytail: nama field 'minggu' jadi penanda normalisasi hari Minggu 7 -> 0.
  $isDow = ($FieldName -ceq 'minggu')
  if ($Value -ceq '*') { return [pscustomobject]@{ kind = 'any' } }
  if ($Value -match '^\*/(\d{1,2})$') {
    $step = [int]$Matches[1]
    if ($step -lt 1 -or $step -gt $Max) { throw "Langkah $FieldName tidak sah: $Value (1-$Max)" }
    return [pscustomobject]@{ kind = 'step'; step = $step; min = $Min }
  }
  if ($Value -match '^(\d{1,2})-(\d{1,2})$') {
    $a = [int]$Matches[1]; $b = [int]$Matches[2]
    if ($isDow -and $b -eq 7) { $b = 6 }
    if ($a -lt $Min -or $b -gt $Max -or $a -ge $b) { throw "Rentang $FieldName tidak sah: $Value ($Min-$Max)" }
    return [pscustomobject]@{ kind = 'range'; from = $a; to = $b }
  }
  if ($Value -match '^\d{1,2}$') {
    $n = [int]$Value
    if ($n -lt $Min -or $n -gt $Max) { throw "Nilai $FieldName di luar rentang: $Value ($Min-$Max)" }
    if ($isDow -and $n -eq 7) { $n = 0 }
    return [pscustomobject]@{ kind = 'exact'; value = $n }
  }
  throw "Field $FieldName tidak dikenal: $Value"
}

function Read-Cron([string]$Expression) {
  $parts = @(([string]$Expression).Trim() -split '\s+')
  if ($parts.Count -ne 5) { throw "Cron harus 5 field (menit jam hari bulan minggu): $Expression" }
  $parsed = @()
  for ($i = 0; $i -lt 5; $i++) {
    $parsed += ConvertTo-CronField $parts[$i] $cronFields[$i].Name $cronFields[$i].Min $cronFields[$i].Max
  }
  $bounds = @{}
  for ($i = 0; $i -lt 5; $i++) {
    $range = ConvertTo-IntRange $parsed[$i] $cronFields[$i].Min $cronFields[$i].Max
    $name = @('minute', 'hour', 'day', 'month', 'week')[$i]
    $bounds["${name}From"] = $range[0]
    $bounds["${name}To"] = $range[1]
    $bounds["${name}Step"] = if ($parsed[$i].kind -eq 'step') { [int]$parsed[$i].step } else { 1 }
  }
  return [pscustomobject]$bounds
}

function ConvertTo-IntRange($Field, [int]$Min, [int]$Max) {
  switch ($Field.kind) {
    'any' { return @($Min, $Max) }
    'exact' { return @($Field.value, $Field.value) }
    'step' { return @([int]$Field.min, [int]$Max) }
    'range' { return @([int]$Field.from, [int]$Field.to) }
  }
  throw "Jenis field tidak dikenal: $($Field.kind)"
}

function Test-CronMatch($Cron, [datetime]$Value) {
  $dow = [int]$Value.DayOfWeek
  return (
    $Value.Minute -ge $Cron.minuteFrom -and $Value.Minute -le $Cron.minuteTo -and ($Cron.minuteStep -eq 1 -or (($Value.Minute % $Cron.minuteStep) -eq 0)) -and
    $Value.Hour -ge $Cron.hourFrom -and $Value.Hour -le $Cron.hourTo -and ($Cron.hourStep -eq 1 -or (($Value.Hour % $Cron.hourStep) -eq 0)) -and
    $Value.Day -ge $Cron.dayFrom -and $Value.Day -le $Cron.dayTo -and ($Cron.dayStep -eq 1 -or (($Value.Day % $Cron.dayStep) -eq 0)) -and
    $Value.Month -ge $Cron.monthFrom -and $Value.Month -le $Cron.monthTo -and ($Cron.monthStep -eq 1 -or (($Value.Month % $Cron.monthStep) -eq 0)) -and
    $dow -ge $Cron.weekFrom -and $dow -le $Cron.weekTo -and ($Cron.weekStep -eq 1 -or (($dow % $Cron.weekStep) -eq 0))
  )
}

function Format-Utc([datetime]$Value) {
  return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}

function Get-NextRunUtc($Job, [datetime]$FromUtc) {
  $zone = Get-JakartaZone
  $cron = Read-Cron ([string]$Job.cron)
  $local = [System.TimeZoneInfo]::ConvertTimeFromUtc($FromUtc, $zone)
  $candidate = $local.AddMinutes(1)
  $candidate = [datetime]::new($candidate.Year, $candidate.Month, $candidate.Day, $candidate.Hour, $candidate.Minute, 0, [System.DateTimeKind]::Unspecified)
  # ponytail: pindai per menit dengan perbandingan numerik (bukan per-field objek); cukup untuk skala lokal.
  for ($i = 0; $i -lt 527040; $i++) {
    if (Test-CronMatch $cron $candidate) {
      return [System.TimeZoneInfo]::ConvertTimeToUtc($candidate, $zone)
    }
    $candidate = $candidate.AddMinutes(1)
  }
  throw "Jadwal tidak pernah terpenuhi dalam 1 tahun: $($Job.cron)"
}

function ConvertFrom-EveryMinutes([int]$Minutes) {
  # ponytail: interval dipetakan ke langkah yang membagi habis 60; selain itu diminta cron eksplisit.
  if ($Minutes -lt 1 -or $Minutes -gt 1440) { throw "EveryMinutes harus 1-1440, bukan $Minutes" }
  if ($Minutes -gt 59) {
    if ($Minutes -eq 1440) { return '0 0 * * *' }
    if ((1440 % $Minutes) -ne 0) { throw "EveryMinutes $Minutes tidak membagi habis 1440; pakai -Cron." }
    return "0 */$([int]($Minutes / 60)) * * *"
  }
  if ((60 % $Minutes) -ne 0) { throw "EveryMinutes $Minutes tidak membagi habis 60; pakai -Cron." }
  return "*/$Minutes * * * *"
}

function Read-CronText([string]$Value) {
  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) { throw 'Jadwal wajib diisi (--cron atau --every-minutes).' }
  $trim = $text.Trim()
  if ($trim -match '^(\d+)m$') {
    $trim = ConvertFrom-EveryMinutes ([int]$Matches[1])
  } elseif ($trim -match '^\d+$') {
    throw 'Jadwal menit polos tidak didukung; pakai format cron 5 field atau <n>m.'
  }
  Read-Cron $trim | Out-Null
  return $trim
}

function ConvertTo-ChildList($Job) {
  return [pscustomobject][ordered]@{ id = [string]$Job.id; enabled = [bool]$Job.enabled; nextRunUtc = [string]$Job.nextRunUtc }
}

function Write-Jobs($State) {
  $list = @($State.jobs | Sort-Object { $_.nextRunUtc } | ForEach-Object {
      [pscustomobject]@{ id = [string]$_.id; name = [string]$_.name; zone = [string]$_.zone; cron = [string]$_.cron; enabled = [bool]$_.enabled; nextRunUtc = [string]$_.nextRunUtc; every = $_.everyMinutes }
    })
  [pscustomobject]@{ count = $list.Count; jobs = $list; executable = $false } | ConvertTo-Json -Depth 5
}

function Invoke-Add($State) {
  if ([string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib.' }
  if ($Id -notmatch $idPattern) { throw "Id job tidak sah: $Id" }
  foreach ($existing in @($State.jobs)) { if ([string]$existing.id -ceq $Id) { throw "Job sudah ada: $Id" } }
  if ([string]::IsNullOrWhiteSpace($Name)) { throw 'Parameter -Name wajib.' }
  if ([string]::IsNullOrWhiteSpace($Action)) { throw 'Parameter -Action wajib.' }
  if ([string]::IsNullOrWhiteSpace($Resource)) { throw 'Parameter -Resource wajib.' }
  $jobZone = if ([string]::IsNullOrWhiteSpace($Zone)) { 'case' } else { $Zone }
  if ($jobZone -cnotin @('case', 'regular')) { throw "Zona tidak dikenal: $jobZone (hanya case atau regular)." }
  if ($Policy -cnotin @('allow', 'ask', 'deny')) { throw "Policy tidak dikenal: $Policy" }
  if ($Action -cne 'local.status' -or $Resource -cne 'self') { throw 'Hanya local.status pada resource self boleh disimpan selama connector registry kosong.' }
  if (-not [string]::IsNullOrWhiteSpace($Cron) -and -not [string]::IsNullOrWhiteSpace($EveryMinutes)) {
    throw 'Pilih salah satu: -Cron atau -EveryMinutes, bukan keduanya.'
  }
  $every = $null
  if (-not [string]::IsNullOrWhiteSpace($EveryMinutes)) {
    if ($EveryMinutes -notmatch '^\d+$') { throw 'EveryMinutes harus bilangan bulat.' }
    $every = [int]$EveryMinutes
    $cronText = ConvertFrom-EveryMinutes $every
  } else {
    $cronText = Read-CronText $Cron
  }
  $job = [pscustomobject][ordered]@{
    id = $Id; name = $Name; zone = $jobZone; cron = $cronText; everyMinutes = $every
    enabled = $true; nextRunUtc = (Format-Utc (Get-NextRunUtc ([pscustomobject]@{ cron = $cronText }) ([DateTime]::UtcNow)))
    action = $Action; resource = $Resource; policy = $Policy
  }
  $problem = Get-JobError $job
  if ($null -ne $problem) { throw "Job tidak sah: field $problem" }
  $State.jobs = @(@($State.jobs) + @($job))
  Save-Commit $State 'job.added' $Id $Policy 'stored (execution disabled)'
  [pscustomobject]@{ id = $Id; cron = $cronText; zone = $jobZone; nextRunUtc = $job.nextRunUtc; executable = $false } | ConvertTo-Json -Depth 5
}

function Invoke-JobCommand([string]$Mode) {
  if ($Mode -ne 'list' -and [string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib.' }
  $state = Read-State
  if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing job command.' }
  if ($Mode -eq 'list') {
    Write-Jobs $state
    return
  }
  $target = @($state.jobs | Where-Object { [string]$_.id -ceq $Id })
  if ($target.Count -ne 1) { throw "Job tidak ditemukan: $Id" }
  $job = $target[0]
  $previous = [string]$job.enabled
  $event = 'job.updated'
  $result = $Mode
  switch ($Mode) {
    'remove' {
      $state.jobs = @($state.jobs | Where-Object { [string]$_.id -cne $Id })
      $event = 'job.removed'
      $result = 'removed'
    }
    'pause' {
      $job.enabled = $false
      $event = 'job.paused'
      $result = "enabled $previous -> False"
    }
    'resume' {
      $job.enabled = $true
      $job.nextRunUtc = Format-Utc (Get-NextRunUtc $job ([DateTime]::UtcNow))
      $event = 'job.resumed'
      $result = "enabled $previous -> True"
    }
    'schedule' {
      $next = Format-Utc (Get-NextRunUtc $job ([DateTime]::UtcNow))
      $job.nextRunUtc = $next
      $event = 'job.scheduled'
      $result = "nextRunUtc $next"
    }
  }
  Save-Commit $state $event $Id 'n/a' $result
  [pscustomobject]@{ id = $Id; enabled = [bool]$job.enabled; nextRunUtc = [string]$job.nextRunUtc; mode = $Mode; executable = $false } | ConvertTo-Json -Depth 5
}

function Get-HubLock {
  # ponytail: satu instance per root. Lock = handle file eksklusif; proses mati = lock lepas otomatis.
  try {
    return [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch [System.IO.IOException] {
    throw 'Another runner holds lock; no job launched.'
  }
}

function Invoke-WithLock([scriptblock]$Body) {
  $lock = Get-HubLock
  try {
    & $Body
  } finally {
    if ($null -ne $lock) { $lock.Dispose() }
  }
}

function Invoke-Tick {
  $lock = Get-HubLock

  try {
    $state = Read-State
    if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing scheduler tick.' }
    if (-not $DryRun) {
      'Runner disabled: connector registry and reviewed job schema not implemented.'
      return
    }
    $due = @()
    $notDue = 0
    $now = [DateTime]::UtcNow
    $ordered = @($state.jobs)
    for ($i = 0; $i -lt $ordered.Count; $i++) {
      $job = $ordered[$i]
      if (-not $job.enabled) { continue }
      if ([DateTime]::Parse([string]$job.nextRunUtc).ToUniversalTime() -le $now) {
        $due += [pscustomobject]@{ id = [string]$job.id; zone = [string]$job.zone; action = [string]$job.action; nextRunUtc = [string]$job.nextRunUtc }
      } else { $notDue++ }
    }
    $ro = $ordered | ForEach-Object { ConvertTo-ChildList $_ }
    [pscustomobject]@{ mode = 'dry-run'; due = @($due); dueCount = @($due).Count; notDue = $notDue; launched = 0; executable = $false; jobs = @($ro) } | ConvertTo-Json -Depth 6
  } finally {
    if ($null -ne $lock) { $lock.Dispose() }
  }
}

function Invoke-ScheduleList {
  $state = Read-State
  if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing schedule.' }
  $zone = 'regular'
  $rows = @($state.jobs | Sort-Object { $_.nextRunUtc } | ForEach-Object {
      $j = $_
      [pscustomobject]@{ id = [string]$j.id; zone = [string]$j.zone; cron = [string]$j.cron; enabled = [bool]$j.enabled; nextRunUtc = [string]$j.nextRunUtc }
    })
  [pscustomobject]@{ checkedAtUtc = (Format-Utc ([DateTime]::UtcNow)); timeZoneId = $timeZoneId; zone = $zone; count = $rows.Count; jobs = $rows; executable = $false } | ConvertTo-Json -Depth 5
}

function Get-UnitHash([string]$Path) {
  if (-not [System.IO.File]::Exists($Path)) { return $null }
  return Get-Hash ([System.IO.File]::ReadAllText($Path, $utf8))
}

function Get-BackupTarget {
  if ([string]::IsNullOrWhiteSpace($BackupPath)) {
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    return (Join-Path (Split-Path -Parent $Root) ("backups\hyper-hub-$stamp"))
  }
  $full = [System.IO.Path]::GetFullPath($BackupPath)
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  if ($full.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $full -ceq $rootFull) {
    throw 'Backup tidak boleh berada di dalam root state.'
  }
  return $full
}

function Invoke-Backup {
  # B-05/M-04: salin state+audit sebagai satu tangkapan, beri checksum, dan tolak rantai rusak.
  return Invoke-WithLock -Body {
    $state = Read-State
    if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing backup of broken chain.' }
    $target = Get-BackupTarget
    if ([System.IO.Directory]::Exists($target) -and @([System.IO.Directory]::GetFiles($target)).Count -gt 0) {
      throw "Folder backup sudah berisi berkas: $target"
    }
    [void][System.IO.Directory]::CreateDirectory($target)
    $files = [ordered]@{}
    foreach ($name in @('state.json', 'audit.jsonl')) {
      $source = Join-Path $Root $name
      if (-not [System.IO.File]::Exists($source)) { throw "Berkas wajib hilang saat backup: $name" }
      $destination = Join-Path $target $name
      [System.IO.File]::Copy($source, $destination, $false)
      $files[$name] = Get-UnitHash $destination
    }
    $manifest = [ordered]@{
      createdAtUtc = (Format-Utc ([DateTime]::UtcNow))
      sourceRoot = [System.IO.Path]::GetFullPath($Root)
      lastAuditHash = [string]$state.lastAuditHash
      jobs = @($state.jobs).Count
      files = $files
      restore = 'jalankan: Hyper-Hub.ps1 restore -BackupPath <folder ini>'
    }
    Write-Atomic -Path (Join-Path $target 'SHA256SUMS.json') -Text (ConvertTo-Json -InputObject $manifest -Depth 5)
    Add-Audit $state 'hub.backup' 'n/a' 'allow' "backup $target"
    Save-State $state
    [pscustomobject]@{ backup = $target; jobs = @($state.jobs).Count; files = $files; auditChain = 'valid' } | ConvertTo-Json -Depth 5
  }
}

function Invoke-Restore {
  if ([string]::IsNullOrWhiteSpace($BackupPath)) { throw 'Parameter -BackupPath wajib untuk restore.' }
  $source = [System.IO.Path]::GetFullPath($BackupPath)
  $manifestPath = Join-Path $source 'SHA256SUMS.json'
  if (-not [System.IO.File]::Exists($manifestPath)) { throw "Manifest backup tidak ditemukan: $manifestPath" }
  $manifest = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($manifestPath, $utf8))
  if ($null -eq $manifest.files -or [string]::IsNullOrWhiteSpace([string]$manifest.lastAuditHash)) { throw 'Manifest backup tidak sah.' }

  return Invoke-WithLock -Body {
    # Verifikasi seluruh backup SEBELUM menyentuh state aktif.
    foreach ($name in @('state.json', 'audit.jsonl')) {
      $path = Join-Path $source $name
      if (-not [System.IO.File]::Exists($path)) { throw "Berkas backup hilang: $name" }
      $expected = [string]$manifest.files.$name
      if ($expected -notmatch '^[a-f0-9]{64}$') { throw "Checksum backup tidak sah: $name" }
      if ((Get-UnitHash $path) -cne $expected) { throw "Checksum tidak cocok: $name; restore dibatalkan." }
    }
    $restoredState = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText((Join-Path $source 'state.json'), $utf8))
    if ([string]$restoredState.lastAuditHash -cne [string]$manifest.lastAuditHash) { throw 'lastAuditHash backup tidak cocok dengan manifest; restore dibatalkan.' }

    $currentState = Read-State
    if (-not (Test-Audit $currentState)) { throw 'AUDIT INVALID: state aktif rusak; restore butuh -Force dari owner.' }

    # Snapshot state aktif lebih dulu agar restore yang gagal di tengah bisa dibalik.
    $backup = Join-Path ([System.IO.Path]::GetTempPath()) ('hyper-hub-rollback-' + [Guid]::NewGuid().ToString('N'))
    [void][System.IO.Directory]::CreateDirectory($backup)
    $originals = @{}
    foreach ($name in @('state.json', 'audit.jsonl')) {
      $path = Join-Path $Root $name
      if ([System.IO.File]::Exists($path)) {
        [System.IO.File]::Copy($path, (Join-Path $backup $name), $true)
        $originals[$name] = Get-UnitHash $path
      }
    }
    try {
      foreach ($name in @('audit.jsonl', 'state.json')) {
        Write-Atomic -Path (Join-Path $Root $name) -Text ([System.IO.File]::ReadAllText((Join-Path $source $name), $utf8))
      }
      $verify = Read-State
      if ([string]$verify.lastAuditHash -cne [string]$manifest.lastAuditHash -or -not (Test-Audit $verify)) {
        throw 'Verifikasi pasca-restore gagal.'
      }
    } catch {
      foreach ($name in @('state.json', 'audit.jsonl')) {
        $target = Join-Path $Root $name
        if ($originals.ContainsKey($name)) {
          [System.IO.File]::Copy((Join-Path $backup $name), $target, $true)
        } elseif ([System.IO.File]::Exists($target)) { [System.IO.File]::Delete($target) }
      }
      throw "Restore dibatalkan dan rollback diterapkan: $($_.Exception.Message)"
    } finally {
      Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
    }

    $state = Read-State
    Add-Audit $state 'hub.restore' 'n/a' 'allow' "restored from $source"
    Save-State $state
    [pscustomobject]@{ restoredFrom = $source; jobs = @($state.jobs).Count; auditChain = 'valid'; rollback = 'not needed' } | ConvertTo-Json -Depth 5
  }
}

function Invoke-Health {
  # ponytail: ringkasan baca-saja; tanpa prompt mentah, tanpa HTTP, tanpa eksekusi.
  $state = Read-State
  $auditOk = Test-Audit $state
  $jobs = @($state.jobs)
  $now = [DateTime]::UtcNow
  $due = 0
  $invalid = 0
  $next = $null
  foreach ($job in $jobs) {
    $parsed = [DateTime]::MinValue
    if (-not [DateTime]::TryParse([string]$job.nextRunUtc, [ref]$parsed)) { $invalid++; continue }
    $utc = $parsed.ToUniversalTime()
    if ($job.enabled -and $utc -le $now) { $due++ }
    if ($null -eq $next -or $utc -lt $next) { $next = $utc }
  }
  $lockFree = $true
  if (Test-Path -LiteralPath $lockPath) {
    try {
      $probe = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      $probe.Dispose()
    } catch [System.IO.IOException] { $lockFree = $false }
  }
  [pscustomobject]@{
    checkedAtUtc = (Format-Utc $now)
    initialized = (Test-Path -LiteralPath $statePath)
    auditChain = $(if ($auditOk) { 'valid' } else { 'invalid' })
    lockFree = $lockFree
    jobs = @{
      total = $jobs.Count
      enabled = @($jobs | Where-Object { $_.enabled }).Count
      paused = @($jobs | Where-Object { -not $_.enabled }).Count
      due = $due
      invalidSchedule = $invalid
      nextRunUtc = $(if ($null -ne $next) { Format-Utc $next } else { $null })
    }
    queue = @{ pending = 0; running = 0; deadLetter = 0; note = 'runner disabled: no job is ever launched' }
    approvals = @{ pending = 0; note = 'approval broker not implemented (D-07)' }
    executable = $false
  } | ConvertTo-Json -Depth 5
}

# Allowlist wajib untuk semua kanal remote: tanpa allowlist, bot menerima siapa pun.
function Get-RemoteChannels {
  # ponytail: daftar kanal statis. WhatsApp memakai WAHA (belum dipasang); jangan tampilkan seolah aktif.
  return @(
    [pscustomobject]@{ id = 'telegram'; supported = $true; status = 'implemented'; note = "bot grammY (grinev/opencode-telegram-bot), folder $(Join-Path $env:LOCALAPPDATA 'HyperHub\remote-telegram')" }
    [pscustomobject]@{ id = 'whatsapp'; supported = $false; status = 'planned'; note = 'WAHA/loopback belum dipasang (backlog E-05, E-06); butuh keputusan go/no-go' }
  )
}

function Get-RemoteChannel([string]$Channel) {
  if ([string]::IsNullOrWhiteSpace($Channel)) { throw 'Parameter -Channel wajib; jalankan: remote -Sub channels' }
  $hit = @(Get-RemoteChannels | Where-Object { $_.id -ceq $Channel.ToLowerInvariant() })
  if ($hit.Count -eq 0) { throw "Kanal tidak dikenal: $Channel. Pilihan: $(($(Get-RemoteChannels).id) -join ', ')." }
  if (-not $hit[0].supported) { throw "Kanal $Channel belum tersedia (status: $($hit[0].status)). $($hit[0].note)" }
  return $hit[0]
}

function Get-RemoteDir([string]$Channel) {
  # ponytail: satu folder per kanal, di luar OneDrive.
  return (Join-Path $env:LOCALAPPDATA "HyperHub\remote-$Channel")
}

function Read-RemoteAllowlist($Map, [string]$Channel) {
  $key = $(if ($Channel -ceq 'telegram') { 'TELEGRAM_ALLOWED_USERS' } else { 'WHATSAPP_ALLOWED_USERS' })
  if ([string]::IsNullOrWhiteSpace($Map[$key])) { return @() }
  return @($Map[$key] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Add-RemoteAllowlist($Map, [string]$Channel, [string]$Id) {
  # fail-closed: nomor/ID dinormalisasi, lalu ditambah ke allowlist kanal.
  if ($Channel -ceq 'telegram') {
    Assert-Secret $Id 'OwnerId' '^\d{5,20}$'
    $list = @(Read-RemoteAllowlist $Map 'telegram')
    if ($list -notcontains $Id) { $list += $Id }
    $Map['TELEGRAM_ALLOWED_USERS'] = ($list -join ',')
    # bridge grinev hanya mengenal satu ID pemilik
    $Map['TELEGRAM_ALLOWED_USER_ID'] = $list[0]
  } else {
    $norm = (ConvertTo-RemoteNumber $Id)
    if ($norm -cnotmatch '^\d{5,20}$') { throw "Nomor tidak valid: $Id. Pakai format internasional tanpa tanda +, mis. 6281234567890." }
    $list = @(Read-RemoteAllowlist $Map 'whatsapp')
    if ($list -notcontains $norm) { $list += $norm }
    $Map['WHATSAPP_ALLOWED_USERS'] = ($list -join ',')
  }
  return $Map
}

function ConvertTo-RemoteNumber([string]$Id) {
  # 08xx / +62 8xx / 62-8xx → 628xx (digit saja).
  $d = ($Id -replace '[^\d]', '')
  if ($d -cmatch '^0(\d{8,13})$') { return "62$($Matches[1])" }
  return $d
}

function Get-RemoteBridgeStatus([string]$Dir) {
  $f = Join-Path $Dir 'status.json'
  if (-not (Test-Path -LiteralPath $f)) { return $null }
  try { return ([IO.File]::ReadAllText($f) | ConvertFrom-Json) } catch { return $null }
}

function Get-RemoteProcess([string]$Dir) {
  # Cari proses bridge hidup yang cwd-nya folder kanal (bun/node).
  try {
    return @(Get-CimInstance Win32_Process -Filter "Name='bun.exe' OR Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Dir*" })
  } catch { return @() }
}

function Read-DotEnv([string]$Path) {
  $map = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in ([IO.File]::ReadAllLines($Path) | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' })) {
    if ($line.TrimStart().StartsWith('#')) { continue }
    $idx = $line.IndexOf('=')
    $map[$line.Substring(0, $idx).Trim()] = $line.Substring($idx + 1).Trim()
  }
  return $map
}

function Write-DotEnv([string]$Path, $Map) {
  # Tulis atomik + ACL hanya pemilik. Gagal ACL = gagal keras.
  if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Path .env kosong; kanal tidak dapat ditemukan.' }
  $tmp = "$Path.tmp"
  $lines = foreach ($k in $Map.Keys) { "$k=$($Map[$k])" }
  [IO.File]::WriteAllText($tmp, (($lines -join "`n") + "`n"), $utf8)
  if (Test-Path -LiteralPath $Path) { [IO.File]::Copy($tmp, $Path, $true); [IO.File]::Delete($tmp) } else { [IO.File]::Move($tmp, $Path) }
  # ACL = hanya pemilik, tanpa warisan. icacls tidak butuh SeSecurityPrivilege
  # (Set-Acl + SetAccessRuleProtection gagal di sesi non-admin).
  $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $out = & icacls.exe $Path /inheritance:r /grant:r "${me}:(F)" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Gagal mengunci ACL $Path : $out" }
}

function Assert-Secret([string]$Value, [string]$Label, [string]$Pattern) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Label wajib diisi." }
  if ($Value -notmatch $Pattern) { throw "$Label tidak sesuai pola yang diharapkan." }
}

function Read-SecretInput([string]$Label) {
  # ponytail: input tersembunyi; nilai tidak pernah jadi argumen perintah atau log sesi.
  $secure = Read-Host -Prompt $Label -AsSecureString
  if ($null -eq $secure) { return '' }
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-Remote([string]$Sub, [string]$Channel, [switch]$Reset) {
  # ponytail: hanya mengurus konfigurasi kanal remote; rahasia tidak pernah masuk state/audit/argumen.
  $BotToken = $null
  $ServerPassword = $null

  if ($Sub -ceq 'channels') {
    return ([pscustomobject]@{ channels = @(Get-RemoteChannels | ForEach-Object { [pscustomobject]@{ id = $_.id; supported = $_.supported; status = $_.status; note = $_.note } }); executable = $false } | ConvertTo-Json -Depth 5)
  }

  $meta = Get-RemoteChannel $Channel
  $dir = Get-RemoteDir $meta.id
  $envPath = Join-Path $dir '.env'

  switch ($Sub) {
    'status' {
      $map = Read-DotEnv $envPath
      $installed = Test-Path -LiteralPath (Join-Path $dir 'dist\index.js')
      $tokenKey = $(if ($meta.id -ceq 'telegram') { 'TELEGRAM_BOT_TOKEN' } else { 'WAHA_API_KEY' })
      $ownerKey = $(if ($meta.id -ceq 'telegram') { 'TELEGRAM_ALLOWED_USER_ID' } else { 'WHATSAPP_ALLOWED_USERS' })
      return ([pscustomobject]@{
          channel = $meta.id
          installed = $installed
          directory = $dir
          configured = (-not [string]::IsNullOrWhiteSpace($map[$tokenKey]) -and -not [string]::IsNullOrWhiteSpace($map[$ownerKey]))
          secretPresent = -not [string]::IsNullOrWhiteSpace($map[$tokenKey])
          allowedUsers = $(if (-not [string]::IsNullOrWhiteSpace($map[$ownerKey])) { $map[$ownerKey] } else { $null })
          serverVersion = $(if (-not [string]::IsNullOrWhiteSpace($map['OPENCODE_SERVER_VERSION'])) { $map['OPENCODE_SERVER_VERSION'] } else { $null })
          apiUrl = $(if (-not [string]::IsNullOrWhiteSpace($map['OPENCODE_API_URL'])) { $map['OPENCODE_API_URL'] } else { $null })
          modelProvider = $(if (-not [string]::IsNullOrWhiteSpace($map['OPENCODE_MODEL_PROVIDER'])) { $map['OPENCODE_MODEL_PROVIDER'] } else { $null })
          modelId = $(if (-not [string]::IsNullOrWhiteSpace($map['OPENCODE_MODEL_ID'])) { $map['OPENCODE_MODEL_ID'] } else { $null })
          serverPasswordPresent = -not [string]::IsNullOrWhiteSpace($map['OPENCODE_SERVER_PASSWORD'])
          executable = $false
        } | ConvertTo-Json -Compress)
    }
    'setup' {
      if ($meta.id -cne 'telegram') { throw "Kanal $($meta.id) belum dapat dikonfigurasi (status: $($meta.status))." }
      # Allowlist wajib untuk SEMUA kanal: tanpa allowlist bot menerima siapa pun.
      Assert-Secret $OwnerId 'OwnerId' '^\d{5,20}$'
      # Token dan password TIDAK lewat parameter: prompt tersembunyi, agar tidak muncul di
      # riwayat shell, log sesi chat, atau daftar proses.
      if ([string]::IsNullOrWhiteSpace($BotToken)) {
        if ([Console]::IsInputRedirected) { throw 'Token bot diperlukan dan input bukan terminal; jalankan remote setup di jendela PowerShell interaktif.' }
        $BotToken = Read-SecretInput 'Token bot dari @BotFather (input tersembunyi)'
      }
      if ([string]::IsNullOrWhiteSpace($ServerPassword) -and -not [Console]::IsInputRedirected) {
        $ServerPassword = Read-SecretInput 'Password service OpenCode (kosongkan bila tidak ada)'
      }
      Assert-Secret $BotToken 'BotToken' '^\d{5,}:[A-Za-z0-9_-]{30,}$'
      $map = Read-DotEnv $envPath
      $map['TELEGRAM_BOT_TOKEN'] = $BotToken
      $map['TELEGRAM_ALLOWED_USER_ID'] = $OwnerId
      # Bridge telegram (grinev) memakai TELEGRAM_ALLOWED_USER_ID; bridge chat (opencode-chat-bridge)
      # memakai TELEGRAM_ALLOWED_USERS. Tulis keduanya agar tidak ada jalur "semua orang diizinkan".
      $map['TELEGRAM_ALLOWED_USERS'] = $OwnerId
      $map['OPENCODE_SERVER_VERSION'] = $(if ([string]::IsNullOrWhiteSpace($ServerVersion)) { 'v2' } else { $ServerVersion })
      $map['OPENCODE_API_URL'] = $(if ([string]::IsNullOrWhiteSpace($ApiUrl)) { 'http://127.0.0.1:28894' } else { $ApiUrl })
      if (-not [string]::IsNullOrWhiteSpace($ServerPassword)) { $map['OPENCODE_SERVER_PASSWORD'] = $ServerPassword }
      if (-not [string]::IsNullOrWhiteSpace($ModelProvider)) { $map['OPENCODE_MODEL_PROVIDER'] = $ModelProvider }
      if (-not [string]::IsNullOrWhiteSpace($ModelId)) { $map['OPENCODE_MODEL_ID'] = $ModelId }
      if ([string]::IsNullOrWhiteSpace($map['OPENCODE_MODEL_PROVIDER']) -or [string]::IsNullOrWhiteSpace($map['OPENCODE_MODEL_ID'])) {
        throw 'OPENCODE_MODEL_PROVIDER dan OPENCODE_MODEL_ID wajib; kirim -ModelProvider dan -ModelId.'
      }
      Write-DotEnv $envPath $map
      return '{"channel":"' + $meta.id + '","configured":true,"wrote":"' + ($envPath -replace '\\', '\\') + '","secretStored":true,"executable":false}'
    }
    'clear' {
      if (-not (Test-Path -LiteralPath $envPath)) { return '{"cleared":false,"reason":"tidak ada .env","executable":false}' }
      $map = Read-DotEnv $envPath
      foreach ($k in 'TELEGRAM_BOT_TOKEN', 'WAHA_API_KEY', 'OPENCODE_SERVER_PASSWORD') { if ($map.Contains($k)) { $map[$k] = '' } }
      Write-DotEnv $envPath $map
      return '{"cleared":true,"note":"rahasia dikosongkan; isi ulang lewat remote setup","executable":false}'
    }
    'allow' {
      # Tambah/lihat whitelist tanpa membuka file .env.
      $map = Read-DotEnv $envPath
      if ([string]::IsNullOrWhiteSpace($OwnerId)) {
        return ([pscustomobject]@{ channel = $meta.id; allowed = @(Read-RemoteAllowlist $map $meta.id); executable = $false } | ConvertTo-Json -Compress -Depth 4)
      }
      $map = Add-RemoteAllowlist $map $meta.id $OwnerId
      Write-DotEnv $envPath $map
      return ([pscustomobject]@{ channel = $meta.id; added = $OwnerId; allowed = @(Read-RemoteAllowlist $map $meta.id); executable = $false } | ConvertTo-Json -Compress -Depth 4)
    }
    'unpair' {
      # Putus perangkat tertaut: hapus sesi login WhatsApp. Nomor harus login ulang.
      if ($meta.id -cne 'whatsapp') { throw "unpair hanya untuk kanal yang memakai sesi tertaut (whatsapp). Telegram cukup 'remote -Sub clear'." }
      $auth = Join-Path $Dir 'auth'
      $procs = @(Get-RemoteProcess $Dir)
      foreach ($pr in $procs) { try { Stop-Process -Id $pr.ProcessId -Force -ErrorAction Stop } catch { } }
      if (Test-Path -LiteralPath $auth) { Remove-Item -LiteralPath $auth -Recurse -Force }
      $statusFile = Join-Path $Dir 'status.json'
      if (Test-Path -LiteralPath $statusFile) { Remove-Item -LiteralPath $statusFile -Force }
      return '{"channel":"whatsapp","unpaired":true,"note":"sesi login dihapus; jalankan remote -Sub pair untuk menautkan ulang","executable":false}'
    }
    'pair' {
      # Pairing WhatsApp lewat QR: Hub menjalankan bridge, menulis QR ke berkas, pengguna memindai.
      if ($meta.id -cne 'whatsapp') { throw "pair hanya untuk whatsapp; telegram memakai remote -Sub setup (token dari @BotFather)." }
      $bridge = Join-Path $Dir 'connectors\whatsapp.ts'
      if (-not (Test-Path -LiteralPath $bridge)) { throw "Bridge WhatsApp belum terpasang di $Dir. Salin opensource bridge ke folder ini lebih dulu." }
      $bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
      if (-not (Test-Path -LiteralPath $bun)) { throw 'bun tidak ditemukan; pasang dari https://bun.sh lalu ulangi.' }

      $map = Read-DotEnv $envPath
      $allowed = @(Read-RemoteAllowlist $map 'whatsapp')
      if ($allowed.Count -eq 0) { throw 'Allowlist WhatsApp masih kosong; jalankan remote -Sub allow -Channel whatsapp -OwnerId <nomor> dulu.' }

      if ($Reset -and (Test-Path -LiteralPath (Join-Path $Dir 'auth'))) { Remove-Item -LiteralPath (Join-Path $Dir 'auth') -Recurse -Force }
      $qrFile = Join-Path $Dir 'qr.txt'
      $statusFile = Join-Path $Dir 'status.json'
      foreach ($f in $qrFile, $statusFile) { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force } }

      $env:WHATSAPP_ALLOWED_USERS = ($allowed -join ',')
      $env:WHATSAPP_RESPOND_TO_OTHERS = 'false'
      $env:BRIDGE_QR_FILE = $qrFile
      $env:BRIDGE_STATUS_FILE = $statusFile
      if (-not [string]::IsNullOrWhiteSpace($map['BRIDGE_AGENT'])) { $env:BRIDGE_AGENT = $map['BRIDGE_AGENT'] }
      $env:OPENCODE_PATH = "$env:APPDATA\ai.hyperai.desktop\cli\2.1.10-x64\opencode-cli.exe"
      Start-Process -FilePath $bun -ArgumentList @('run', 'connectors/whatsapp.ts') -WorkingDirectory $Dir -WindowStyle Hidden -PassThru | Out-Null

      # Tunggu QR atau status "open" (maks 45 dtk).
      $deadline = (Get-Date).AddSeconds(45)
      $state = $null
      while ((Get-Date) -lt $deadline) {
        $state = Get-RemoteBridgeStatus $Dir
        if ($null -ne $state -and ($state.state -cin @('qr', 'open'))) { break }
        Start-Sleep -Milliseconds 700
      }
      if ($null -eq $state) { throw 'Bridge tidak melapor dalam 45 detik; periksa jaringan, lalu ulangi.' }
      if ($state.state -ceq 'open') {
        return ([pscustomobject]@{ channel = 'whatsapp'; paired = $true; myNumber = $state.myNumber; allowed = $allowed; executable = $false } | ConvertTo-Json -Compress)
      }
      return ([pscustomobject]@{
          channel = 'whatsapp'
          paired = $false
          qrFile = $qrFile
          instruction = 'Buka qr.txt di hub, atau jalankan: remote -Sub pair -Wait, lalu pindai QR di WhatsApp > Perangkat Tertaut > Tautkan Perangkat.'
          allowed = $allowed
          executable = $false
        } | ConvertTo-Json -Compress)
    }
    default { throw "Subperintah remote tidak dikenal: $Sub (pakai channels|status|setup|allow|pair|unpair|clear)." }
  }
}

$auditFields = @('timestamp', 'event', 'jobId', 'decision', 'result', 'previousHash', 'hash')

function Test-Audit($State) {
  $previous = '0' * 64
  if (-not (Test-Path -LiteralPath $auditPath)) {
    if (Test-Path -LiteralPath $statePath) { return $false }
    return ($previous -ceq [string]$State.lastAuditHash)
  }
  $text = [System.IO.File]::ReadAllText($auditPath, $utf8)
  if ($text.Length -eq 0) { return ($previous -ceq [string]$State.lastAuditHash) }
  # Setiap record wajib diakhiri newline: file terpotong di tengah baris harus ditolak.
  if (-not $text.EndsWith("`n")) { return $false }
  foreach ($line in ($text -split "`n")) {
    if ($line.Length -eq 0) { continue }
    if ([string]::IsNullOrWhiteSpace($line)) { return $false }
    try { $record = ConvertFrom-Json -InputObject $line } catch { return $false }
    if ($null -eq $record -or $record -isnot [pscustomobject]) { return $false }
    if (($record.PSObject.Properties.Name -join ',') -cne ($auditFields -join ',')) { return $false }
    if ([string]$record.previousHash -cne $previous) { return $false }
    $expected = [string]$record.hash
    if ($expected -notmatch '^[a-f0-9]{64}$') { return $false }
    $copy = [ordered]@{
      timestamp = [string]$record.timestamp; event = [string]$record.event; jobId = [string]$record.jobId
      decision = [string]$record.decision; result = [string]$record.result; previousHash = [string]$record.previousHash
    }
    if ((Get-Hash (ConvertTo-Json -InputObject $copy -Compress -Depth 5)) -cne $expected) { return $false }
    $previous = $expected
  }
  return ($previous -ceq [string]$State.lastAuditHash)
}

if ($Command -eq 'self-check') {
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("hyper-hub-check-" + [Guid]::NewGuid().ToString('N'))
  try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $testState = Join-Path $tempRoot 'state.json'
    $testAudit = Join-Path $tempRoot 'audit.jsonl'
    $test = New-State
    $test.lastAuditHash = '0' * 64
    $script:statePath = $testState
    $script:auditPath = $testAudit
    Add-Audit $test 'test.started' 'self-check' 'allow' 'ok'
    Save-State $test
    if (-not (Test-Audit $test)) { throw 'Audit self-check failed.' }
    [System.IO.File]::AppendAllText($testAudit, "tamper`n", $utf8)
    if (Test-Audit $test) { throw 'Tamper was not detected.' }

    [System.IO.File]::WriteAllText($testAudit, '', $utf8)
    $script:statePath = Join-Path $tempRoot 'state2.json'
    $script:auditPath = Join-Path $tempRoot 'audit2.jsonl'
    [System.IO.File]::WriteAllText($script:auditPath, '', $utf8)
    $scheduleState = New-State
    Save-State $scheduleState
    $scheduleState = Read-State

    $anchor = [datetime]::UtcNow
    $nextHour = Get-NextRunUtc ([pscustomobject]@{ cron = '0 * * * *' }) $anchor
    if ($nextHour -le $anchor -or $nextHour -gt $anchor.AddMinutes(61)) { throw 'Hourly schedule self-check failed.' }
    $nextTwo = Get-NextRunUtc ([pscustomobject]@{ cron = (ConvertFrom-EveryMinutes 2) }) $anchor
    if ($nextTwo -le $anchor -or $nextTwo -gt $anchor.AddMinutes(3)) { throw 'Interval schedule self-check failed.' }
    $nextDay = Get-NextRunUtc ([pscustomobject]@{ cron = (ConvertFrom-EveryMinutes 1440) }) $anchor
    if ($nextDay -le $anchor -or $nextDay -gt $anchor.AddMinutes(1441)) { throw 'Daily cron self-check failed.' }
    if ((Format-Utc $nextHour) -notmatch $utcPattern) { throw 'UTC format self-check failed.' }

    $rejects = @(
      '0 99 * * *', '0 8 99 * *', '0 8 * 13 *', '0 8 * * 9', '*/0 * * * *', '*/99 * * * *',
      '5-5 * * * *', '60 * * * *', '0 0 0 * *', '0 8 * *', 'a b c d e', '0 8 * * * *'
    )
    foreach ($bad in $rejects) {
      $rejected = $false
      try { Read-Cron $bad | Out-Null } catch { $rejected = $true }
      if (-not $rejected) { throw "cron tidak sah diterima: $bad" }
    }
    foreach ($bad in @(0, 7, 1441, 2000)) {
      $rejected = $false
      try { ConvertFrom-EveryMinutes $bad | Out-Null } catch { $rejected = $true }
      if (-not $rejected) { throw "everyMinutes tidak sah diterima: $bad" }
    }
    foreach ($good in @(1, 15, 30, 60, 90, 120, 360, 720, 1440)) {
      Read-Cron (ConvertFrom-EveryMinutes $good) | Out-Null
    }

    $validJob = [pscustomobject]@{
      id = 'j1'; name = 'J'; zone = 'regular'; cron = '30 9 * * *'; everyMinutes = $null
      enabled = $true; nextRunUtc = (Format-Utc $nextHour); action = 'local.status'; resource = 'self'; policy = 'deny'
    }
    if ($null -ne (Get-JobError $validJob)) { throw 'job sah ditolak oleh Get-JobError.' }
    foreach ($field in @('id', 'name', 'zone', 'cron', 'enabled', 'nextRunUtc', 'action', 'resource', 'policy')) {
      $broken = [pscustomobject]@{
        id = 'j2'; name = 'J'; zone = 'regular'; cron = '30 9 * * *'; everyMinutes = $null
        enabled = $true; nextRunUtc = '2026-01-01T00:00:00Z'; action = 'local.status'; resource = 'self'; policy = 'deny'
      }
      $broken.$field = ''
      if ($null -eq (Get-JobError $broken)) { throw "Get-JobError meloloskan field kosong: $field" }
    }
    foreach ($change in @(
      @{ field = 'action'; value = 'external.send' },
      @{ field = 'resource'; value = 'outside' },
      @{ field = 'nextRunUtc'; value = '2026-99-99T00:00:00Z' },
      @{ field = 'enabled'; value = 'true' }
    )) {
      $broken = $validJob.PSObject.Copy()
      $broken.($change.field) = $change.value
      if ($null -eq (Get-JobError $broken)) { throw "Get-JobError meloloskan nilai tak sah: $($change.field)" }
    }

    $chainState = New-State
    $script:auditPath = Join-Path $tempRoot 'audit3.jsonl'
    $script:statePath = Join-Path $tempRoot 'state3.json'
    [System.IO.File]::WriteAllText($script:auditPath, '', $utf8)
    Save-Commit $chainState 'job.added' 'j1' 'deny' 'ok'
    if (-not (Test-Audit $chainState)) { throw 'commit pertama tidak valid.' }
    Save-Commit $chainState 'job.paused' 'j1' 'n/a' 'ok'
    if (-not (Test-Audit $chainState)) { throw 'commit kedua tidak valid.' }

    $text = [System.IO.File]::ReadAllText($script:auditPath, $utf8)
    [System.IO.File]::WriteAllText($script:auditPath, $text.Substring(0, $text.Length - 1), $utf8)
    if (Test-Audit $chainState) { throw 'audit tanpa newline akhir harus ditolak.' }
    [System.IO.File]::WriteAllText($script:auditPath, $text + '{"x":1}' + "`n", $utf8)
    if (Test-Audit $chainState) { throw 'record tambahan sah harus ditolak.' }
    [System.IO.File]::WriteAllText($script:auditPath, $text.Replace('job.paused', 'job.hacked'), $utf8)
    if (Test-Audit $chainState) { throw 'perubahan isi record harus ditolak.' }
    [System.IO.File]::WriteAllText($script:auditPath, $text, $utf8)
    if (-not (Test-Audit $chainState)) { throw 'audit yang dipulihkan harus valid.' }

    'Self-check passed: audit chain, tamper, cron bounds, everyMinutes mapping, job validation, and commit order.'
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    $script:statePath = Join-Path $Root 'state.json'
    $script:auditPath = Join-Path $Root 'audit.jsonl'
  }
  exit 0
}

function Assert-Parameters {
  $idCommands = @('add', 'remove', 'pause', 'resume', 'schedule')
  if ($DryRun -and $Command -cne 'tick') { throw "Flag -DryRun hanya berlaku untuk tick, bukan $Command." }
  if (-not [string]::IsNullOrWhiteSpace($Id) -and $Command -cnotin $idCommands) { throw "Parameter -Id tidak berlaku untuk $Command." }
  foreach ($pair in @(@('Name', $Name), @('Cron', $Cron), @('EveryMinutes', $EveryMinutes), @('Action', $Action), @('Resource', $Resource))) {
    if (-not [string]::IsNullOrWhiteSpace($pair[1]) -and $Command -cne 'add') { throw "Parameter -$($pair[0]) hanya berlaku untuk add." }
  }
  if (-not [string]::IsNullOrWhiteSpace($Zone) -and $Command -cnotin @('add', 'policy-check')) { throw "Parameter -Zone hanya berlaku untuk add dan policy-check." }
  if (-not [string]::IsNullOrWhiteSpace($Operation) -and $Command -cne 'policy-check') { throw 'Parameter -Operation hanya berlaku untuk policy-check.' }
  if (-not [string]::IsNullOrWhiteSpace($Origin) -and $Command -cne 'policy-check') { throw 'Parameter -Origin hanya berlaku untuk policy-check.' }
  if (-not [string]::IsNullOrWhiteSpace($Sub) -and $Command -cne 'remote') { throw 'Parameter -Sub hanya berlaku untuk remote.' }
  if (-not [string]::IsNullOrWhiteSpace($BackupPath) -and $Command -cnotin @('backup', 'restore')) { throw 'Parameter -BackupPath hanya berlaku untuk backup dan restore.' }
  if ($Command -ceq 'restore' -and [string]::IsNullOrWhiteSpace($BackupPath)) { throw 'Parameter -BackupPath wajib untuk restore.' }
  if (-not [string]::IsNullOrWhiteSpace($Channel) -and $Command -cne 'remote') { throw 'Parameter -Channel hanya berlaku untuk remote.' }
  foreach ($extra in @(@('OwnerId', $OwnerId), @('ServerVersion', $ServerVersion), @('ApiUrl', $ApiUrl), @('ModelProvider', $ModelProvider), @('ModelId', $ModelId))) {
    if (-not [string]::IsNullOrWhiteSpace($extra[1]) -and $Command -cne 'remote') { throw "Parameter -$($extra[0]) hanya berlaku untuk remote." }
  }
}

if ($Command -cnotin @('init', 'discover', 'policy-check', 'remote') -and -not (Test-Path -LiteralPath $Root -PathType Container)) {
  [Console]::Error.WriteLine('Hub not initialized; run init first.')
  exit $exitFailure
}

try {
  Assert-Parameters
  if ($Command -eq 'init') { New-Item -ItemType Directory -Path $Root -Force | Out-Null }
  switch ($Command) {
    'init' {
      Invoke-WithLock -Body {
        $state = Read-State
        if (-not (Test-Path -LiteralPath $statePath)) {
          [System.IO.File]::WriteAllText($auditPath, '', $utf8)
          Save-State $state
        }
        if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing init.' }
        Write-Status $state
      }
    }
    'status' {
      $state = Read-State
      if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing status.' }
      Write-Status $state
    }
    'discover' { Get-Discovery }
    'policy-check' { Test-HubPolicy $Zone $Operation $Origin }
    'add' {
      Invoke-WithLock -Body {
        $state = Read-State
        if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: refusing add.' }
        Invoke-Add $state
      }
    }
    'jobs' { Invoke-JobCommand 'list' }
    'health' { Invoke-Health }
    'backup' { Invoke-Backup }
    'restore' { Invoke-Restore }
    'remote' { Invoke-Remote $Sub $Channel $Reset }
    'schedule' {
      if ([string]::IsNullOrWhiteSpace($Id)) { Invoke-ScheduleList } else { Invoke-WithLock -Body { Invoke-JobCommand 'schedule' } }
    }
    'remove' { Invoke-WithLock -Body { Invoke-JobCommand 'remove' } }
    'pause' { Invoke-WithLock -Body { Invoke-JobCommand 'pause' } }
    'resume' { Invoke-WithLock -Body { Invoke-JobCommand 'resume' } }
    'run' { throw 'Manual run disabled: job execution is not implemented.' }
    'tick' { Invoke-Tick }
    'audit' {
      $state = Read-State
      if (-not (Test-Audit $state)) { throw 'AUDIT INVALID: hash chain broken or state head mismatch.' }
      if (Test-Path -LiteralPath $auditPath) { [System.IO.File]::ReadAllText($auditPath, $utf8).TrimEnd("`n") }
      'Audit chain valid.'
    }
    default { throw "Unsupported command: $Command" }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit $exitFailure
}
