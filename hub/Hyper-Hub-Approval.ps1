[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('request', 'list', 'approve', 'reject', 'expire', 'consume', 'self-check')][string]$Action,
  [string]$Root,
  [string]$Id,
  [string]$Actor,
  [string]$Reason,
  [int]$TtlSeconds = 900
)

# D-07: approval broker lokal. Nonce sekali pakai, terikat id, kedaluwarsa => deny,
# setiap perubahan dicatat di file audit broker terpisah (append-only + hash chain).
# Tidak ada jaringan: broker hanya menulis berkas di folder state.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Hash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-StorePath([string]$RootPath) { return (Join-Path $RootPath 'approvals.json') }
function Get-BrokerAuditPath([string]$RootPath) { return (Join-Path $RootPath 'approvals-audit.jsonl') }

function Read-Broker([string]$RootPath) {
  $path = Get-StorePath $RootPath
  if (-not [IO.File]::Exists($path)) { return [pscustomobject]@{ version = 1; requests = [pscustomobject]@{}; lastHash = ('0' * 64) } }
  $broker = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($path, $utf8))
  if ($broker.version -ne 1 -or $null -eq $broker.requests -or [string]$broker.lastHash -notmatch '^[a-f0-9]{64}$') { throw 'Approval store tidak sah; tolak.' }
  return $broker
}

function Save-Broker([string]$RootPath, $Broker) {
  $path = Get-StorePath $RootPath
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $Broker -Depth 10), $utf8)
  if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
  [IO.File]::Move($tmp, $path)
}

function Add-BrokerAudit([string]$RootPath, $Broker, [string]$Event, [string]$RequestId, [string]$Decision, [string]$Detail) {
  $record = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    event = $Event
    requestId = $RequestId
    decision = $Decision
    detail = $Detail
    previousHash = [string]$Broker.lastHash
  }
  $canonical = ConvertTo-Json -InputObject $record -Compress -Depth 4
  $record.hash = Get-Hash $canonical
  $Broker.lastHash = [string]$record.hash
  [IO.File]::AppendAllText((Get-BrokerAuditPath $RootPath), ((ConvertTo-Json -InputObject $record -Compress -Depth 4) + "`n"), $utf8)
}

function Get-RequestState($Broker, [string]$RequestId) {
  if ($null -eq $Broker.requests.PSObject.Properties[$RequestId]) { return $null }
  return $Broker.requests.$RequestId
}

function Test-Expired($Request, [datetime]$NowUtc) {
  return [DateTime]::Parse([string]$Request.expiresAtUtc).ToUniversalTime() -le $NowUtc
}

function Invoke-Broker([string]$RootPath) {
  $now = [DateTime]::UtcNow
  $broker = Read-Broker $RootPath
  switch ($Action) {
    'request' {
      if ([string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib untuk request.' }
      if ($Id -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$') { throw 'Id approval tidak sah.' }
      if ([string]::IsNullOrWhiteSpace($Actor)) { throw 'Parameter -Actor wajib untuk request.' }
      if ([string]::IsNullOrWhiteSpace($Reason)) { throw 'Parameter -Reason wajib untuk request.' }
      if ($TtlSeconds -lt 30 -or $TtlSeconds -gt 86400) { throw 'TtlSeconds harus 30-86400.' }
      if ($null -ne (Get-RequestState $broker $Id)) { throw "Approval sudah ada: $Id" }
      if (-not [IO.File]::Exists((Join-Path $RootPath 'audit.jsonl'))) { throw 'Audit Hub tidak ada; approval ditolak (fail-closed).' }
      $nonce = [Guid]::NewGuid().ToString('N')
      $request = [pscustomobject]@{
        id = $Id; actor = $Actor; reason = $Reason; nonce = $nonce
        createdAtUtc = $now.ToString('o'); expiresAtUtc = $now.AddSeconds($TtlSeconds).ToString('o')
        state = 'pending'; consumed = $false; decision = $null; decidedAtUtc = $null; decidedBy = $null
      }
      $broker.requests | Add-Member -NotePropertyName $Id -NotePropertyValue $request -Force
      Add-BrokerAudit $RootPath $broker 'approval.requested' $Id 'pending' "actor=$Actor ttl=$TtlSeconds"
      Save-Broker $RootPath $broker
      return [pscustomobject]@{ id = $Id; state = 'pending'; nonce = $nonce; expiresAtUtc = $request.expiresAtUtc; executable = $false } | ConvertTo-Json -Depth 4
    }
    'list' {
      $rows = @($broker.requests.PSObject.Properties | Sort-Object Name | ForEach-Object {
          $r = $_.Value
          $state = [string]$r.state
          if ($state -ceq 'pending' -and (Test-Expired $r $now)) { $state = 'expired' }
          [pscustomobject]@{ id = $_.Name; actor = [string]$r.actor; state = $state; expiresAtUtc = [string]$r.expiresAtUtc; consumed = [bool]$r.consumed; decidedBy = [string]$r.decidedBy }
        })
      return [pscustomobject]@{ count = $rows.Count; pending = @($rows | Where-Object { $_.state -ceq 'pending' }).Count; expired = @($rows | Where-Object { $_.state -ceq 'expired' }).Count; requests = $rows; executable = $false } | ConvertTo-Json -Depth 5
    }
    'approve' {
      if ([string]::IsNullOrWhiteSpace($Id) -or [string]::IsNullOrWhiteSpace($Actor)) { throw 'Parameter -Id dan -Actor wajib untuk approve.' }
      $request = Get-RequestState $broker $Id
      if ($null -eq $request) { throw "Approval tidak ada: $Id" }
      if ([string]$request.state -cne 'pending') { throw "Approval tidak dalam status pending: $($request.state)" }
      if (Test-Expired $request $now) {
        $request.state = 'expired'; $request.decision = 'deny'; $request.decidedAtUtc = $now.ToString('o')
        Add-BrokerAudit $RootPath $broker 'approval.expired' $Id 'deny' "actor=$Actor"
        Save-Broker $RootPath $broker
        throw "Approval kedaluwarsa: $Id (deny)"
      }
      if ([string]$request.actor -ceq $Actor) { throw 'Pemohon tidak boleh menyetujui permintaannya sendiri.' }
      $request.state = 'approved'; $request.decision = 'allow'; $request.decidedBy = $Actor; $request.decidedAtUtc = $now.ToString('o')
      Add-BrokerAudit $RootPath $broker 'approval.approved' $Id 'allow' "by=$Actor"
      Save-Broker $RootPath $broker
      return [pscustomobject]@{ id = $Id; state = 'approved'; decidedBy = $Actor; executable = $false } | ConvertTo-Json -Depth 4
    }
    'reject' {
      if ([string]::IsNullOrWhiteSpace($Id) -or [string]::IsNullOrWhiteSpace($Actor)) { throw 'Parameter -Id dan -Actor wajib untuk reject.' }
      $request = Get-RequestState $broker $Id
      if ($null -eq $request) { throw "Approval tidak ada: $Id" }
      if ([string]$request.state -cne 'pending') { throw "Approval tidak dalam status pending: $($request.state)" }
      $request.state = 'rejected'; $request.decision = 'deny'; $request.decidedBy = $Actor; $request.decidedAtUtc = $now.ToString('o')
      Add-BrokerAudit $RootPath $broker 'approval.rejected' $Id 'deny' "by=$Actor"
      Save-Broker $RootPath $broker
      return [pscustomobject]@{ id = $Id; state = 'rejected'; decidedBy = $Actor; executable = $false } | ConvertTo-Json -Depth 4
    }
    'expire' {
      $changed = @()
      foreach ($property in @($broker.requests.PSObject.Properties)) {
        $r = $property.Value
        if ([string]$r.state -ceq 'pending' -and (Test-Expired $r $now)) {
          $r.state = 'expired'; $r.decision = 'deny'; $r.decidedAtUtc = $now.ToString('o')
          Add-BrokerAudit $RootPath $broker 'approval.expired' $property.Name 'deny' 'sweep'
          $changed += $property.Name
        }
      }
      if ($changed.Count -gt 0) { Save-Broker $RootPath $broker }
      return [pscustomobject]@{ expired = @($changed); count = @($changed).Count; executable = $false } | ConvertTo-Json -Depth 4
    }
    'consume' {
      if ([string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib untuk consume.' }
      $request = Get-RequestState $broker $Id
      if ($null -eq $request) { return [pscustomobject]@{ id = $Id; allowed = $false; reason = 'tidak ada approval' } | ConvertTo-Json -Depth 4 }
      if ([string]$request.state -cne 'approved') {
        $why = if ([string]$request.state -ceq 'consumed' -or [bool]$request.consumed) { 'nonce sudah dipakai' } else { "status $($request.state)" }
        return [pscustomobject]@{ id = $Id; allowed = $false; reason = $why } | ConvertTo-Json -Depth 4
      }
      if (Test-Expired $request $now) {
        $request.state = 'expired'; $request.decision = 'deny'
        Add-BrokerAudit $RootPath $broker 'approval.expired' $Id 'deny' 'consume'
        Save-Broker $RootPath $broker
        return [pscustomobject]@{ id = $Id; allowed = $false; reason = 'kedaluwarsa' } | ConvertTo-Json -Depth 4
      }
      $request.consumed = $true; $request.state = 'consumed'; $request.decision = 'allow'
      Add-BrokerAudit $RootPath $broker 'approval.consumed' $Id 'allow' "nonce=used"
      Save-Broker $RootPath $broker
      return [pscustomobject]@{ id = $Id; allowed = $true; reason = 'sekali pakai'; executable = $false } | ConvertTo-Json -Depth 4
    }
  }
}

if ($Action -ceq 'self-check') {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('approval-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    [IO.File]::WriteAllText((Join-Path $temp 'audit.jsonl'), '', $utf8)

    $script:Action = 'request'; $script:Root = $temp; $script:Id = 'job-a'; $script:Actor = 'requester'; $script:Reason = 'uji'; $script:TtlSeconds = 900
    $created = Invoke-Broker $temp | ConvertFrom-Json
    if ($created.state -cne 'pending') { $failures.Add('request harus pending') }

    $script:Action = 'approve'; $script:Actor = 'requester'
    $threw = $false; try { Invoke-Broker $temp | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('pemohon tidak boleh menyetujui sendiri') }

    $script:Actor = 'approver'
    (Invoke-Broker $temp | ConvertFrom-Json) | Out-Null
    $script:Action = 'list'
    $list = (Invoke-Broker $temp | ConvertFrom-Json)
    if ($list.count -ne 1) { $failures.Add('list harus 1') }

    $script:Action = 'consume'
    $first = Invoke-Broker $temp | ConvertFrom-Json
    if ($first.allowed -ne $true) { $failures.Add('consume pertama harus allow') }
    $second = Invoke-Broker $temp | ConvertFrom-Json
    if ($second.allowed -ne $false -or $second.reason -notmatch 'dipakai') { $failures.Add('consume kedua harus ditolak (nonce sekali pakai)') }

    $script:Action = 'request'; $script:Id = 'job-b'; $script:Actor = 'requester'; $script:TtlSeconds = 30
    $short = Invoke-Broker $temp | ConvertFrom-Json
    $path = Join-Path $temp 'approvals.json'
    $store = [IO.File]::ReadAllText($path, $utf8) | ConvertFrom-Json
    $store.requests.'job-b'.expiresAtUtc = [DateTime]::UtcNow.AddSeconds(-5).ToString('o')
    [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $store -Depth 10), $utf8)
    $script:Action = 'approve'; $script:Id = 'job-b'; $script:Actor = 'approver'
    $threw = $false; try { Invoke-Broker $temp | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('approval kedaluwarsa harus deny') }
    $script:Action = 'list'
    $expired = Invoke-Broker $temp | ConvertFrom-Json
    if (@($expired.requests | Where-Object { $_.id -ceq 'job-b' -and $_.state -ceq 'expired' }).Count -ne 1) { $failures.Add('status harus expired') }
    $script:Action = 'consume'; $script:Id = 'job-b'
    $denyExpired = Invoke-Broker $temp | ConvertFrom-Json
    if ($denyExpired.allowed -ne $false) { $failures.Add('consume expired harus deny') }

    $script:Action = 'request'; $script:Id = 'job-c'; $script:Actor = 'requester'; $script:TtlSeconds = 900
    (Invoke-Broker $temp | ConvertFrom-Json) | Out-Null
    $script:Action = 'reject'; $script:Id = 'job-c'; $script:Actor = 'approver'
    (Invoke-Broker $temp | ConvertFrom-Json) | Out-Null
    $script:Action = 'consume'; $script:Id = 'job-c'
    if ((Invoke-Broker $temp | ConvertFrom-Json).allowed -ne $false) { $failures.Add('rejected tidak boleh dikonsumsi') }

    $auditLines = @([IO.File]::ReadAllLines((Join-Path $temp 'approvals-audit.jsonl')) | Where-Object { $_.Length -gt 0 })
    if ($auditLines.Count -lt 6) { $failures.Add("audit broker terlalu pendek: $($auditLines.Count)") }
    $previous = '0' * 64
    foreach ($line in $auditLines) {
      $record = ConvertFrom-Json -InputObject $line
      if ([string]$record.previousHash -cne $previous) { $failures.Add('rantai audit broker putus'); break }
      $copy = [ordered]@{ timestamp = [string]$record.timestamp; event = [string]$record.event; requestId = [string]$record.requestId; decision = [string]$record.decision; detail = [string]$record.detail; previousHash = [string]$record.previousHash }
      if ((Get-Hash (ConvertTo-Json -InputObject $copy -Compress -Depth 4)) -cne [string]$record.hash) { $failures.Add('hash record broker salah'); break }
      $previous = [string]$record.hash
    }
    if ([IO.File]::ReadAllText((Join-Path $temp 'approvals-audit.jsonl'), $utf8) -match 'secret|token=') { $failures.Add('audit broker tidak boleh memuat secret') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Approval broker self-check passed: nonce sekali pakai, self-approval ditolak, expiry deny, reject, dan rantai audit.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root)) { [Console]::Error.WriteLine('Pemakaian: -Action <request|list|approve|reject|expire|consume> -Root <folder state>'); exit 1 }
try { Invoke-Broker $Root } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
