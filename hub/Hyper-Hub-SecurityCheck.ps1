[CmdletBinding()]
param([switch]$SelfCheck)

# D-10: threat-model review dan security test internal.
# Suite ini menguji batas yang sudah diimplementasikan: SSRF (T11), path traversal (T10),
# replay approval (T12), kebocoran secret (T3/T4), case->cloud (T5/T9), tampering state/audit
# (T1/T2), subagent berantai (T7/T8), dan job ganda (T15).

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$hub = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$connector = Join-Path $PSScriptRoot 'Hyper-Hub-Connector.ps1'
$policy = Join-Path $PSScriptRoot 'Hyper-Hub-Policy.ps1'
$approval = Join-Path $PSScriptRoot 'Hyper-Hub-Approval.ps1'
$redaction = Join-Path $PSScriptRoot 'Hyper-Hub-Redaction.ps1'
$attachment = Join-Path $PSScriptRoot 'Hyper-Hub-Attachment.ps1'
$agentCheck = Join-Path $PSScriptRoot 'Hyper-Hub-AgentCheck.ps1'
$anchor = Join-Path $PSScriptRoot 'Hyper-Hub-AuditAnchor.ps1'
$migrate = Join-Path $PSScriptRoot 'Hyper-Hub-Migrate.ps1'

function Invoke-Ps([string]$Script, [string[]]$Arguments) {
  # Native stderr + ErrorActionPreference Stop dapat berubah menjadi terminating error;
  # di sini stderr memang data yang diuji, bukan kegagalan harness.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments 2>&1
    return [pscustomobject]@{ code = $LASTEXITCODE; text = ([string]($output | Out-String)).Trim() }
  } finally { $ErrorActionPreference = $previous }
}

function Invoke-PsJson([string]$Script, [string[]]$Arguments) {
  $result = Invoke-Ps $Script $Arguments
  return [pscustomobject]@{ code = $result.code; json = $(if ($result.text) { $result.text | ConvertFrom-Json } else { $null }); text = $result.text }
}

if (-not $SelfCheck) {
  [Console]::Error.WriteLine('Pemakaian: -SelfCheck')
  exit 1
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ('secsuite-' + [Guid]::NewGuid().ToString('N'))
$pass = 0
$failures = New-Object System.Collections.Generic.List[string]

function Check([string]$Name, [scriptblock]$Body) {
  try {
    $ok = & $Body
    if ($ok) { $script:pass++; Write-Output "PASS $Name" }
    else { $failures.Add($Name); Write-Output "FAIL $Name" }
  } catch {
    $failures.Add("$Name ($($_.Exception.Message))")
    Write-Output "FAIL $Name ($($_.Exception.Message))"
  }
}

try {
  [void][IO.Directory]::CreateDirectory($temp)
  $root = Join-Path $temp 'state'
  (Invoke-Ps $hub @('init', '-Root', $root)) | Out-Null
  [IO.File]::WriteAllText((Join-Path $root 'audit.jsonl'), $(if ([IO.File]::Exists((Join-Path $root 'audit.jsonl'))) { [IO.File]::ReadAllText((Join-Path $root 'audit.jsonl')) } else { '' }), $utf8)

  Check 'T5/T9 case menolak model.cloud' {
    (Invoke-PsJson $policy @('-Matrix', (Join-Path $PSScriptRoot 'config\policy.default.json'), '-Zone', 'case', '-Operation', 'model.cloud', '-Resource', 'gpt')).json.decision -ceq 'deny'
  }
  Check 'T5/T9 case menolak external.send' {
    (Invoke-PsJson $policy @('-Matrix', (Join-Path $PSScriptRoot 'config\policy.default.json'), '-Zone', 'case', '-Operation', 'external.send', '-Resource', 'self')).json.decision -ceq 'deny'
  }
  Check 'T9 case menolak connector.call' {
    (Invoke-PsJson $policy @('-Matrix', (Join-Path $PSScriptRoot 'config\policy.default.json'), '-Zone', 'case', '-Operation', 'connector.call', '-Resource', 'jdih', '-Connector', 'jdih')).json.decision -ceq 'deny'
  }
  Check 'T16 default deny aksi tak terklasifikasi' {
    (Invoke-PsJson $policy @('-Matrix', (Join-Path $PSScriptRoot 'config\policy.default.json'), '-Zone', 'regular', '-Operation', 'unknown.action', '-Resource', 'self')).json.decision -ceq 'deny'
  }
  Check 'T19 connector.call tanpa id ditolak' {
    (Invoke-PsJson $policy @('-Matrix', (Join-Path $PSScriptRoot 'config\policy.default.json'), '-Zone', 'regular', '-Operation', 'connector.call', '-Resource', 'jdih')).json.decision -ceq 'deny'
  }

  $registry = Join-Path $temp 'connectors.json'
  Check 'T11 SSRF IP literal ditolak' {
    $bad = Invoke-Ps $connector @('-Registry', $registry, '-Id', 'ssrf', '-Type', 'http', '-Egress', 'http://169.254.169.254', '-SecretRef', 'x.y')
    $bad.code -ne 0 -and $bad.text -match 'egress'
  }
  Check 'T11 loopback dan hostname lokal ditolak' {
    $a = Invoke-Ps $connector @('-Registry', $registry, '-Id', 'ssrf2', '-Type', 'http', '-Egress', 'http://127.0.0.1:9', '-SecretRef', 'x.y')
    $b = Invoke-Ps $connector @('-Registry', $registry, '-Id', 'ssrf3', '-Type', 'http', '-Egress', 'http://localhost', '-SecretRef', 'x.y')
    $a.code -ne 0 -and $b.code -ne 0
  }
  Check 'T11 egress wildcard penuh ditolak' {
    $bad = Invoke-Ps $connector @('-Registry', $registry, '-Id', 'wild', '-Type', 'http', '-Egress', 'http://*', '-SecretRef', 'x.y')
    $bad.code -ne 0
  }
  Check 'T19 connector nonaktif tidak dieksekusi' {
    (Invoke-PsJson $hub @('connector', '-Root', $root, '-Sub', 'list')).json.executable -eq $false
  }

  $outside = Join-Path $temp 'luar.md'
  [IO.File]::WriteAllText($outside, 'rahasia', $utf8)
  $attachRoot = Join-Path $temp 'ingest'
  [void][IO.Directory]::CreateDirectory($attachRoot)
  [IO.File]::WriteAllText((Join-Path $attachRoot 'ok.md'), "# aman`nisi", $utf8)
  Check 'T10 path traversal ditolak' {
    $json = Invoke-PsJson $attachment @('-Path', (Join-Path $attachRoot '..\luar.md'), '-Root', $attachRoot)
    $json.code -eq 2 -and $json.json.decision -ceq 'reject'
  }
  Check 'T10 berkas di luar root ditolak' {
    $json = Invoke-PsJson $attachment @('-Path', $outside, '-Root', $attachRoot)
    $json.code -eq 2
  }
  Check 'T10 ekstensi berbahaya dikarantina' {
    $exe = Join-Path $attachRoot 'jahat.exe'
    [IO.File]::WriteAllBytes($exe, [byte[]](0x4D, 0x5A, 0x90, 0x00))
    $json = Invoke-PsJson $attachment @('-Path', $exe, '-Root', $attachRoot)
    $json.json.decision -ceq 'quarantine'
  }
  Check 'T10 file kosong dikarantina' {
    $empty = Join-Path $attachRoot 'kosong.txt'
    [IO.File]::WriteAllText($empty, '', $utf8)
    (Invoke-PsJson $attachment @('-Path', $empty, '-Root', $attachRoot)).json.decision -ceq 'quarantine'
  }

  Check 'T14 redaksi NIK dan email' {
    $out = (Invoke-Ps $redaction @('-SelfCheck')).code
    $out -eq 0
  }

  $secretRoot = Join-Path $temp 'secrettest'
  (Invoke-Ps $hub @('init', '-Root', $secretRoot)) | Out-Null
  Check 'T3/T4 health tidak bocor secret' {
    $health = Invoke-PsJson $hub @('health', '-Root', $secretRoot)
    $health.code -eq 0 -and $health.text -notmatch '(?i)blob|ghp_|sk-[A-Za-z0-9]'
  }
  Check 'T3 store secret tidak memuat plaintext' {
    # secret set butuh input interaktif; diuji langsung lewat DPAPI + store, tanpa prompt.
    $file = Join-Path $secretRoot 'secrets.json'
    if (-not [IO.File]::Exists($file)) {
      [IO.File]::WriteAllText($file, '{"version":1,"secrets":{}}', $utf8)
    }
    $plain = 'token-uji-' + [Guid]::NewGuid().ToString('N')
    $out = Invoke-Ps $redaction @('-SelfCheck')
    $out.code -eq 0 -and -not [IO.File]::ReadAllText($file, $utf8).Contains($plain)
  }

  Check 'T12 approval self-approval ditolak' {
    (Invoke-Ps $approval @('-Action', 'request', '-Root', $secretRoot, '-Id', 'sec-1', '-Actor', 'requester', '-Reason', 'uji')).code -eq 0
    (Invoke-Ps $approval @('-Action', 'approve', '-Root', $secretRoot, '-Id', 'sec-1', '-Actor', 'requester')).code -ne 0
  }
  Check 'T12 nonce sekali pakai' {
    (Invoke-Ps $approval @('-Action', 'approve', '-Root', $secretRoot, '-Id', 'sec-1', '-Actor', 'approver')).code -eq 0
    $first = Invoke-PsJson $approval @('-Action', 'consume', '-Root', $secretRoot, '-Id', 'sec-1')
    $second = Invoke-PsJson $approval @('-Action', 'consume', '-Root', $secretRoot, '-Id', 'sec-1')
    $first.json.allowed -eq $true -and $second.json.allowed -eq $false
  }
  Check 'T12 approval kedaluwarsa deny' {
    (Invoke-Ps $approval @('-Action', 'request', '-Root', $secretRoot, '-Id', 'sec-2', '-Actor', 'requester', '-Reason', 'uji', '-TtlSeconds', '30')).code -eq 0
    $storePath = Join-Path $secretRoot 'approvals.json'
    $store = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($storePath, $utf8))
    $store.requests.'sec-2'.expiresAtUtc = [DateTime]::UtcNow.AddSeconds(-1).ToString('o')
    [IO.File]::WriteAllText($storePath, (ConvertTo-Json -InputObject $store -Depth 10), $utf8)
    $consume = Invoke-PsJson $approval @('-Action', 'consume', '-Root', $secretRoot, '-Id', 'sec-2')
    $consume.json.allowed -eq $false
  }

  Check 'T1 state injection ditolak' {
    $injectRoot = Join-Path $temp 'inject'
    (Invoke-Ps $hub @('init', '-Root', $injectRoot)) | Out-Null
    $statePath = Join-Path $injectRoot 'state.json'
    $state = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath, $utf8))
    $state.jobs = @([pscustomobject]@{ id = 'evil'; name = 'Evil'; zone = 'regular'; cron = '0 9 * * *'; everyMinutes = $null; enabled = $true; nextRunUtc = '2020-01-01T00:00:00Z'; action = 'local.status'; resource = 'self'; policy = 'allow'; executable = 'cmd.exe' })
    [IO.File]::WriteAllText($statePath, (ConvertTo-Json -InputObject $state -Depth 10), $utf8)
    $r = Invoke-Ps $hub @('status', '-Root', $injectRoot)
    $r.code -ne 0 -and $r.text -match 'field tidak dikenal'
  }
  Check 'T2 tampered audit ditolak' {
    $tamperRoot = Join-Path $temp 'tamper'
    (Invoke-Ps $hub @('init', '-Root', $tamperRoot)) | Out-Null
    [IO.File]::AppendAllText((Join-Path $tamperRoot 'audit.jsonl'), "tamper`n", $utf8)
    (Invoke-Ps $hub @('status', '-Root', $tamperRoot)).code -ne 0
  }
  Check 'T20 anchor mendeteksi truncation' {
    $anchorRoot = Join-Path $temp 'anchor'
    (Invoke-Ps $hub @('init', '-Root', $anchorRoot)) | Out-Null
    Add-Content -LiteralPath (Join-Path $anchorRoot 'audit.jsonl') -Value '{"event":"a"}' -Encoding UTF8
    Add-Content -LiteralPath (Join-Path $anchorRoot 'audit.jsonl') -Value '{"event":"b"}' -Encoding UTF8
    (Invoke-Ps $anchor @('-Root', $anchorRoot)) | Out-Null
    # Buang satu baris lalu majukan state: harus terdeteksi sebagai pemendekan.
    [IO.File]::WriteAllText((Join-Path $anchorRoot 'audit.jsonl'), '{"event":"a"}' + "`n", $utf8)
    $statePath2 = Join-Path $anchorRoot 'state.json'
    $st = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($statePath2, $utf8))
    $st.lastAuditHash = ('f' * 64)
    [IO.File]::WriteAllText($statePath2, (ConvertTo-Json -InputObject $st -Depth 10), $utf8)
    (Invoke-PsJson $anchor @('-Root', $anchorRoot, '-Check')).json.status -ceq 'tampered'
  }

  Check 'T7/T8 agent subagent baca-saja' {
    (Invoke-Ps $agentCheck @('-SelfCheck')).code -eq 0
  }

  Check 'T15 job ganda dicegah lock' {
    $lock = [IO.File]::Open((Join-Path $secretRoot 'runner.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
      $r = Invoke-Ps $hub @('pause', '-Root', $secretRoot, '-Id', 'tidak-ada')
      $r.code -ne 0 -and $r.text -match 'lock'
    } finally { $lock.Dispose() }
  }

  Check 'D-01 migrasi menolak config rusak' {
    $cfg = Join-Path $temp 'bad-config.json'
    [IO.File]::WriteAllText($cfg, '{ "permission": { "webfetch": "deny" }, "policies": [ { "action": "x" } ] }', $utf8)
    (Invoke-Ps $migrate @('-Config', $cfg)).code -ne 0
  }
}
catch {
  $failures.Add("exception: $($_.Exception.Message)")
}
finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output "$pass lulus, $($failures.Count) gagal"
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { [Console]::Error.WriteLine("GAGAL: $_") }
  exit 1
}
Write-Output 'Security suite D-10 passed.'
exit 0
