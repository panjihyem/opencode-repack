[CmdletBinding()]
param(
  [string]$Root,
  [string]$Sub = 'selftest',
  [string]$UpdateId,
  [string]$UserId,
  [string]$ChatId,
  [string]$Text,
  [string]$CallbackData,
  [switch]$SelfCheck
)

# E-02/E-03/E-04: logika kanal yang deterministik dan bisa diuji tanpa Telegram.
# - dedupe update_id agar retry/duplikat menghasilkan satu efek
# - rate limit per user
# - allowlist fail-closed
# - parsing perintah /status /jobs /run
# - approval inline (callback) terikat user/chat/nonce dan expired ditolak

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-StatePath([string]$RootPath) { return (Join-Path $RootPath 'channel-state.json') }

function Read-ChannelState([string]$RootPath) {
  $path = Get-StatePath $RootPath
  if (-not [IO.File]::Exists($path)) { return [pscustomobject]@{ version = 1; seen = @(); users = [pscustomobject]@{} } }
  $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($path, $utf8))
  if ($state.version -ne 1) { throw 'Channel state tidak sah.' }
  return $state
}

function Save-ChannelState([string]$RootPath, $State) {
  $path = Get-StatePath $RootPath
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $State -Depth 8), $utf8)
  if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
  [IO.File]::Move($tmp, $path)
}

function Test-Allowed($Allowlist, [string]$Id) {
  if ([string]::IsNullOrWhiteSpace($Id)) { return $false }
  foreach ($entry in @($Allowlist)) { if ([string]$entry -ceq $Id) { return $true } }
  return $false
}

function Invoke-ChannelUpdate {
  param(
    [Parameter(Mandatory)][string]$RootPath,
    [Parameter(Mandatory)][string]$Id,
    [string]$Update,
    [string]$From,
    [string]$Chat,
    [string]$Body,
    [string[]]$Allowlist = @(),
    [int]$RateLimitPerMinute = 10
  )
  $state = Read-ChannelState $RootPath
  if (-not (Test-Allowed $Allowlist $From)) {
    return [pscustomobject]@{ accepted = $false; effect = 'none'; reason = 'allowlist menolak pengirim' }
  }
  if ([string]::IsNullOrWhiteSpace($Update)) { return [pscustomobject]@{ accepted = $false; effect = 'none'; reason = 'update_id kosong' } }
  if (@($state.seen) -contains $Update) {
    return [pscustomobject]@{ accepted = $false; effect = 'none'; reason = 'duplikat update_id' }
  }
  $now = [DateTime]::UtcNow
  $user = $state.users.PSObject.Properties[$From]
  $windowStart = $now.AddMinutes(-1)
  $recent = @()
  if ($null -ne $user) {
    $recent = @($user.Value.recent | Where-Object { [DateTime]::Parse([string]$_).ToUniversalTime() -ge $windowStart })
  }
  if ($recent.Count -ge $RateLimitPerMinute) {
    return [pscustomobject]@{ accepted = $false; effect = 'none'; reason = 'rate limit' }
  }
  $recent += $now.ToString('o')
  $entry = [pscustomobject]@{ recent = @($recent | Select-Object -Last 30); chat = $Chat; lastUpdate = $Update }
  if ($null -eq $user) { $state.users | Add-Member -NotePropertyName $From -NotePropertyValue $entry } else { $state.users.$From = $entry }
  $state.seen = @(@($state.seen) + $Update | Select-Object -Last 500)
  Save-ChannelState $RootPath $state

  $command = ''
  if ($Body -match '^\s*/([A-Za-z]+)') { $command = $Matches[1].ToLowerInvariant() }
  $effect = if (-not $command) { 'message' } else {
    switch ($command) {
      'status' { 'reply-status' }
      'jobs' { 'reply-jobs' }
      'run' { 'request-approval' }
      'approve' { 'approve' }
      'reject' { 'reject' }
      default { 'unknown-command' }
    }
  }
  return [pscustomobject]@{ accepted = $true; effect = $effect; command = $command; updateId = $Update; userId = $From; chatId = $Chat }
}

function Invoke-InlineDecision {
  param([string]$RootPath, [string]$Data, [string]$From, [string]$Chat, [string]$Allowlist)
  # Format callback: action|requestId|nonce
  $parts = @($Data -split '\|')
  if ($parts.Count -ne 3) { return [pscustomobject]@{ allowed = $false; reason = 'callback tidak lengkap' } }
  $action = $parts[0]
  if ($action -notin @('approve', 'reject')) { return [pscustomobject]@{ allowed = $false; reason = 'aksi callback tidak dikenal' } }
  $allow = @($Allowlist -split ',' | ForEach-Object { $_.Trim() })
  if (-not (Test-Allowed $allow $From)) { return [pscustomobject]@{ allowed = $false; reason = 'pengirim tidak di allowlist' } }
  return [pscustomobject]@{ allowed = $true; action = $action; requestId = $parts[1]; nonce = $parts[2]; userId = $From; chatId = $Chat }
}

if ($Sub -ceq 'selftest' -or $SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('channel-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $allow = @('111')

    $first = Invoke-ChannelUpdate -RootPath $temp -Id 'u1' -Update 'up-1' -From '111' -Chat 'c1' -Body '/status' -Allowlist $allow
    if (-not $first.accepted -or $first.effect -cne 'reply-status') { $failures.Add('perintah /status harus diterima') }
    $dup = Invoke-ChannelUpdate -RootPath $temp -Id 'u1' -Update 'up-1' -From '111' -Chat 'c1' -Body '/status' -Allowlist $allow
    if ($dup.accepted -or $dup.reason -notmatch 'duplikat') { $failures.Add('update_id duplikat harus diabaikan') }
    $blocked = Invoke-ChannelUpdate -RootPath $temp -Id 'u2' -Update 'up-2' -From '999' -Chat 'c9' -Body '/status' -Allowlist $allow
    if ($blocked.accepted -or $blocked.reason -notmatch 'allowlist') { $failures.Add('pengirim luar allowlist harus ditolak') }
    $empty = Invoke-ChannelUpdate -RootPath $temp -Id 'u3' -Update 'up-3' -From '111' -Chat 'c1' -Body '/status' -Allowlist @() -RateLimitPerMinute 100
    if ($empty.accepted) { $failures.Add('allowlist kosong harus menolak semua') }

    foreach ($cmd in @('/jobs', '/run job-a', '/approve', '/reject', '/tidakada', 'halo')) {
      $null = Invoke-ChannelUpdate -RootPath $temp -Id 'u4' -Update ("up-" + $cmd) -From '111' -Chat 'c1' -Body $cmd -Allowlist $allow -RateLimitPerMinute 100
    }
    $jobs = Invoke-ChannelUpdate -RootPath $temp -Id 'u5' -Update 'up-jobs' -From '111' -Chat 'c1' -Body '/jobs' -Allowlist $allow -RateLimitPerMinute 100
    $run = Invoke-ChannelUpdate -RootPath $temp -Id 'u6' -Update 'up-run' -From '111' -Chat 'c1' -Body '/run job-a' -Allowlist $allow -RateLimitPerMinute 100
    $unknown = Invoke-ChannelUpdate -RootPath $temp -Id 'u7' -Update 'up-unknown' -From '111' -Chat 'c1' -Body '/tidakada' -Allowlist $allow -RateLimitPerMinute 100
    $plain = Invoke-ChannelUpdate -RootPath $temp -Id 'u8' -Update 'up-plain' -From '111' -Chat 'c1' -Body 'halo' -Allowlist $allow -RateLimitPerMinute 100
    if ($jobs.effect -cne 'reply-jobs') { $failures.Add('/jobs harus reply-jobs') }
    if ($run.effect -cne 'request-approval') { $failures.Add('/run harus meminta approval') }
    if ($unknown.effect -cne 'unknown-command') { $failures.Add('perintah tak dikenal harus ditandai') }
    if ($plain.effect -cne 'message') { $failures.Add('pesan biasa harus message') }

    # Rate limit: 3 update cepat dengan batas 2.
    $limited = 0
    for ($i = 1; $i -le 4; $i++) {
      $r = Invoke-ChannelUpdate -RootPath $temp -Id 'u9' -Update "rl-$i" -From '111' -Chat 'c1' -Body '/status' -Allowlist $allow -RateLimitPerMinute 2
      if (-not $r.accepted) { $limited++ }
    }
    if ($limited -lt 2) { $failures.Add("rate limit harus menolak sebagian (ditolak $limited)") }

    $okDecision = Invoke-InlineDecision -RootPath $temp -Data 'approve|req-1|nonce-1' -From '111' -Chat 'c1' -Allowlist '111'
    if (-not $okDecision.allowed -or $okDecision.requestId -cne 'req-1') { $failures.Add('callback sah harus diterima') }
    $badActor = Invoke-InlineDecision -RootPath $temp -Data 'approve|req-1|nonce-1' -From '999' -Chat 'c1' -Allowlist '111'
    if ($badActor.allowed) { $failures.Add('callback dari luar allowlist harus ditolak') }
    $badAction = Invoke-InlineDecision -RootPath $temp -Data 'hapus|req-1|nonce-1' -From '111' -Chat 'c1' -Allowlist '111'
    if ($badAction.allowed) { $failures.Add('aksi callback tak dikenal harus ditolak') }
    $badFormat = Invoke-InlineDecision -RootPath $temp -Data 'approve|req-1' -From '111' -Chat 'c1' -Allowlist '111'
    if ($badFormat.allowed) { $failures.Add('callback tidak lengkap harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Channel self-check passed: dedupe update_id, allowlist fail-closed, rate limit, perintah, dan callback approval.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root) -or [string]::IsNullOrWhiteSpace($UpdateId) -or [string]::IsNullOrWhiteSpace($UserId)) {
  [Console]::Error.WriteLine('Pemakaian: -Root <state> -Sub update -UpdateId <id> -UserId <id> -ChatId <id> -Text <isi> [-Allowlist a,b] | -SelfCheck')
  exit 1
}
$result = Invoke-ChannelUpdate -RootPath $Root -Id $Sub -Update $UpdateId -From $UserId -Chat $ChatId -Body $Text -Allowlist @($Allowlist -split ',')
$result | ConvertTo-Json -Depth 4
if (-not $result.accepted) { exit 2 }
exit 0
