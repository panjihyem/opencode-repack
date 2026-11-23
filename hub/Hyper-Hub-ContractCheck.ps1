$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("hyper-hub-contract-" + [Guid]::NewGuid().ToString('N'))
try {
  $discovery = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath discover -Root $root | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $discovery.externalRequests -ne $false -or (Test-Path -LiteralPath $root)) { throw 'discover must not create state or make network requests.' }
  foreach ($zone in @('case', 'regular', 'unknown')) {
    foreach ($operation in @('local.status', 'external.send', 'model.cloud', 'job.run')) {
      $result = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath policy-check -Zone $zone -Operation $operation -Root $root | ConvertFrom-Json
      # Kontrak satu sumber: matriks baseline. Allow hanya status di zona dikenal;
      # external.send/model.cloud = ask; job.run selalu deny; zona unknown selalu deny.
      $expected = if ($zone -cin @('case', 'regular') -and $operation -ceq 'local.status') { 'allow' } elseif ($zone -ceq 'regular' -and $operation -in @('external.send', 'model.cloud')) { 'ask' } else { 'deny' }
      if ($LASTEXITCODE -ne 0 -or $result.decision -cne $expected -or $result.executable -ne $false -or (Test-Path -LiteralPath $root)) {
        throw "policy contract failed: zone=$zone operation=$operation (got $($result.decision), expected $expected)"
      }
    }
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath init -Root $root | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'init contract failed.' }

  $status = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath status -Root $root | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $status.jobs -ne 0 -or $status.lastAuditHash -notmatch '^0{64}$') { throw 'status contract failed.' }

  $discovery = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath discover -Root $root | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $discovery.externalRequests -ne $false) { throw 'discovery contract failed.' }
  foreach ($service in $discovery.services) {
    if ($service.readOnly -ne $true -or $service.authChecked -ne $false -or $service.port -lt 1 -or $service.port -gt 65535) { throw 'discovery service schema failed.' }
    if ($service.process -eq 'opencode-cli.exe' -and $service.version -and $service.version -notmatch '^\d+\.\d+\.\d+') { throw 'discovery version format failed.' }
  }
  if ($discovery.services.Count -gt 0 -and $discovery.services[0].version -ne $null -and $discovery.services[0].version -notmatch '^\d+\.\d+\.\d+$') { throw 'unverified version must be null.' }

  $tick = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath tick -Root $root | Out-String
  if ($LASTEXITCODE -ne 0 -or $tick -notmatch 'Runner disabled') { throw 'fail-closed tick contract failed.' }

  $addArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'add', '-Root', ('"' + $root + '"'), '-Id', 'contract-job', '-Name', '"Contract job"', '-Zone', 'regular', '-Cron', '"30 9 * * *"', '-Action', 'local.status', '-Resource', 'self')
  $add = Start-Process -FilePath 'powershell.exe' -ArgumentList $addArgs -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'add.out')
  if ($add.ExitCode -ne 0) { throw 'add contract failed.' }
  $jobs = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath jobs -Root $root | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $jobs.count -ne 1 -or $jobs.executable -ne $false -or $jobs.jobs[0].id -cne 'contract-job') { throw 'jobs contract failed.' }
  if ($jobs.jobs[0].nextRunUtc -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') { throw 'nextRunUtc format contract failed.' }
  $schedule = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath schedule -Root $root | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $schedule.count -ne 1 -or $schedule.executable -ne $false) { throw 'schedule contract failed.' }
  $dry = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath tick -Root $root -DryRun | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $dry.mode -cne 'dry-run' -or $dry.launched -ne 0 -or $dry.executable -ne $false) { throw 'dry-run tick contract failed.' }
  $held = [IO.File]::Open((Join-Path $root 'runner.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    foreach ($mode in @('pause', 'resume', 'remove', 'schedule')) {
      $errorFile = Join-Path $root "$mode.lock.error"
      $attempt = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), $mode, '-Root', ('"' + $root + '"'), '-Id', 'contract-job') -RedirectStandardError $errorFile -Wait -PassThru -WindowStyle Hidden
      if ($attempt.ExitCode -eq 0) { throw "$mode must refuse mutation while writer lock held." }
    }
  } finally { $held.Dispose() }
  $lockedJob = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath jobs -Root $root | ConvertFrom-Json
  if ($lockedJob.count -ne 1 -or $lockedJob.jobs[0].enabled -ne $true) { throw 'Lock rejection changed job state.' }
  $pause = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath pause -Root $root -Id contract-job | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $pause.enabled -ne $false) { throw 'pause contract failed.' }
  $resume = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath resume -Root $root -Id contract-job | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $resume.enabled -ne $true) { throw 'resume contract failed.' }
  $remove = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remove -Root $root -Id contract-job | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'remove contract failed.' }
  $jobs = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath jobs -Root $root | ConvertFrom-Json
  if ($jobs.count -ne 0) { throw 'remove did not delete job.' }

  $rejectArgs = @(
    @('-Id', 'x', '-Name', 'X', '-Zone', 'cloud', '-Cron', '"0 8 * * *"', '-Action', 'a', '-Resource', 'r'),
    @('-Id', 'x', '-Name', 'X', '-Zone', 'regular', '-Cron', 'not-a-cron', '-Action', 'a', '-Resource', 'r'),
    @('-Id', '"bad id"', '-Name', 'X', '-Zone', 'regular', '-Cron', '"0 8 * * *"', '-Action', 'a', '-Resource', 'r'),
    @('-Id', 'y', '-Name', 'Y', '-Zone', 'regular', '-Action', 'local.status', '-Resource', 'self'),
    @('-Id', 'x', '-Name', 'X', '-Zone', 'regular', '-Cron', '"0 8 * * *"', '-Action', 'local.status', '-Resource', 'other')
  )
  foreach ($extra in $rejectArgs) {
    $rejectFile = Join-Path $root 'reject.out'
    $rejectErr = Join-Path $root 'reject.err'
    $reject = Start-Process -FilePath 'powershell.exe' -ArgumentList (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'add', '-Root', ('"' + $root + '"')) + $extra) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $rejectFile -RedirectStandardError $rejectErr
    if ($reject.ExitCode -eq 0) { throw "invalid add accepted: $($extra -join ' ')" }
  }
  $noConnector = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'add', '-Root', ('"' + $root + '"'), '-Id', 'external-test', '-Name', 'X', '-Zone', 'regular', '-Cron', '"0 8 * * *"', '-Action', 'external.send', '-Resource', 'self') -Wait -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'external.err')
  if ($noConnector.ExitCode -eq 0) { throw 'External job must be rejected without reviewed connector.' }
  $jobs = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath jobs -Root $root 2>&1 | ConvertFrom-Json
  if ($jobs.count -ne 0) { throw 'invalid add must not store a job.' }

  # B-05/M-04: backup-verifikasi-restore, lalu tolak backup yang dirusak.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath add -Root $root -Id backup-job -Name 'Backup job' -Zone regular -Cron '0 9 * * *' -Action local.status -Resource self | Out-Null
  $backupDir = Join-Path (Split-Path -Parent $root) ('hyper-hub-backup-' + [Guid]::NewGuid().ToString('N'))
  $backup = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath backup -Root $root -BackupPath $backupDir | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backup.auditChain -cne 'valid' -or $backup.jobs -ne 1) { throw 'backup contract failed.' }
  if (-not (Test-Path -LiteralPath (Join-Path $backupDir 'SHA256SUMS.json'))) { throw 'backup manifest missing.' }
  $restore = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath restore -Root $root -BackupPath $backupDir | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $restore.auditChain -cne 'valid') { throw 'restore contract failed.' }
  $afterRestore = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath jobs -Root $root | ConvertFrom-Json
  if ($afterRestore.count -ne 1 -or $afterRestore.jobs[0].id -cne 'backup-job') { throw 'restore did not recover jobs.' }
  $insideError = Join-Path $root 'backup-inside.err'
  $inside = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'backup', '-Root', ('"' + $root + '"'), '-BackupPath', ('"' + (Join-Path $root 'nested') + '"')) -RedirectStandardError $insideError -Wait -PassThru -WindowStyle Hidden
  if ($inside.ExitCode -eq 0) { throw 'backup inside state root must be rejected.' }
  $beforeTamper = [System.IO.File]::ReadAllText((Join-Path $root 'state.json'))
  [System.IO.File]::AppendAllText((Join-Path $backupDir 'audit.jsonl'), "`n")
  $badError = Join-Path $root 'restore-bad.err'
  $bad = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'restore', '-Root', ('"' + $root + '"'), '-BackupPath', ('"' + $backupDir + '"')) -RedirectStandardError $badError -Wait -PassThru -WindowStyle Hidden
  if ($bad.ExitCode -eq 0) { throw 'tampered backup must be rejected.' }
  if ([System.IO.File]::ReadAllText((Join-Path $root 'state.json')) -cne $beforeTamper) { throw 'rejected restore must not modify state.' }
  Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remove -Root $root -Id backup-job | Out-Null

  # B-03: perintah secret tidak boleh membocorkan nilai dan tidak boleh menerima nama tak sah.
  $secretList = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath secret -Root $root -Sub list 2>&1 | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $secretList.count -ne 0 -or $secretList.valuesExposed -ne $false) { throw 'secret list contract failed.' }

  # Registry connector: gate validated DAN enabled; draft/revoked tetap deny.
  $registered = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath connector -Root $root -Sub list 2>&1 | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $registered.count -ne 0) { throw 'empty connector registry contract failed.' }
  $connectorScript = Join-Path $PSScriptRoot 'Hyper-Hub-Connector.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $connectorScript -Registry (Join-Path $root 'connectors.json') -Id test-conn -Type http -Egress 'https://example.invalid' -SecretRef test.ref | Out-Null
  $draftHealth = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath health -Root $root | ConvertFrom-Json
  if ($draftHealth.connectors.registered -ne 1 -or $draftHealth.connectors.allowed -ne 0 -or $draftHealth.executable -ne $false) { throw 'draft connector must never be allowed.' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath connector -Root $root -Sub validate -Id test-conn -Reviewer 'contract-review' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'connector validate contract failed.' }
  $validHealth = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath health -Root $root | ConvertFrom-Json
  if ($validHealth.connectors.validated -ne 1 -or $validHealth.connectors.allowed -ne 1 -or $validHealth.executable -ne $false) { throw 'validated connector still must not open execution.' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath connector -Root $root -Sub revoke -Id test-conn | Out-Null
  $revokedHealth = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath health -Root $root | ConvertFrom-Json
  if ($revokedHealth.connectors.allowed -ne 0) { throw 'revoked connector must be denied.' }
  $noSub = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'secret', '-Root', ('"' + $root + '"')) -Wait -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'secret-nosub.err')
  if ($noSub.ExitCode -eq 0) { throw 'secret without -Sub must fail.' }
  $badName = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'secret', '-Root', ('"' + $root + '"'), '-Sub', 'set', '-Name', '"bad name!"') -Wait -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'secret-bad.err')
  if ($badName.ExitCode -eq 0) { throw 'secret with invalid name must fail.' }
  $missing = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'secret', '-Root', ('"' + $root + '"'), '-Sub', 'remove', '-Name', 'tidak-ada') -Wait -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'secret-missing.err')
  if ($missing.ExitCode -eq 0) { throw 'removing absent secret must fail.' }

  # B-04: API loopback + bearer. Tanpa token harus 401; payload tidak memuat secret.
  $apiPort = 47800 + (Get-Random -Minimum 1 -Maximum 100)
  $apiOut = Join-Path $root 'api.out'
  $apiErr = Join-Path $root 'api.err'
  $api = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'api', '-Root', ('"' + $root + '"'), '-Sub', 'start', '-Port', "$apiPort", '-Timeout', '25') -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
  try {
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Milliseconds 250
      try { $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; $ready = $true; break } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $ready = $true; break }
      }
    }
    if (-not $ready) { throw 'api start did not become reachable.' }
    $unauthorized = $false
    try { Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop | Out-Null } catch { if ([int]$_.Exception.Response.StatusCode -eq 401) { $unauthorized = $true } }
    if (-not $unauthorized) { throw 'api must reject requests without bearer.' }
    $checked = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath api -Root $root -Sub check -Port "$apiPort" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $checked.httpStatus -ne 200 -or $checked.elapsedMs -ge 1000 -or $checked.valuesExposed -ne $false) { throw 'api check contract failed (status/latency/redaction).' }
    $token = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath api -Root $root -Sub token | ConvertFrom-Json).token
    if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { throw 'api token must be long random.' }
    $body = (Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/status" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 3).Content
    if ($body -match [regex]::Escape($token) -or $body -match 'blob|secret') { throw 'api payload must not expose secrets.' }
    $notFound = $false
    try { Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/nope" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop | Out-Null } catch { if ([int]$_.Exception.Response.StatusCode -eq 404) { $notFound = $true } }
    if (-not $notFound) { throw 'api must 404 unknown paths.' }
  } finally {
    if (-not $api.HasExited) { $api.WaitForExit(30000) | Out-Null; if (-not $api.HasExited) { $api.Kill() } }
  }

  foreach ($command in @('add', 'run')) {
    $errorFile = Join-Path $root "$command.error"
    $attempt = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), $command, '-Root', ('"' + $root + '"')) -RedirectStandardError $errorFile -Wait -PassThru -WindowStyle Hidden
    if ($attempt.ExitCode -eq 0) { throw "$command must be blocked." }
  }
  $auditFile = Join-Path $root 'audit.jsonl'
  [System.IO.File]::WriteAllText($auditFile, "tamper`n")
  $errorFile = Join-Path $root 'status.error'
  $attempt = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'status', '-Root', ('"' + $root + '"')) -RedirectStandardError $errorFile -Wait -PassThru -WindowStyle Hidden
  if ($attempt.ExitCode -eq 0) { throw 'Tampered audit must block status.' }

  $stateFile = Join-Path $root 'state.json'
  $originalState = [System.IO.File]::ReadAllText($stateFile)
  $state = $originalState | ConvertFrom-Json
  # State berubah dulu, baru audit dikosongkan: urutan ini menjaga kombinasi yang masih bisa diuji.
  $state.jobs = @([pscustomobject]@{
    id = 'injected'; name = 'Injected'; zone = 'regular'; cron = '*/1 * * * *'; everyMinutes = 1; enabled = $true
    nextRunUtc = [DateTime]::UtcNow.AddMinutes(-5).ToString('yyyy-MM-ddTHH:mm:ssZ')
    action = 'local.status'; resource = 'local'; policy = 'deny'
    executable = 'powershell.exe'; arguments = @('-Command', 'throw "unexpected execution"')
  })
  $state.lastAuditHash = ('0' * 64)
  [System.IO.File]::WriteAllText($stateFile, ($state | ConvertTo-Json -Depth 10))
  [System.IO.File]::WriteAllText($auditFile, '')
  foreach ($arguments in @(@('tick'), @('tick', '-DryRun'))) {
    $rejectFile = Join-Path $root 'injected.out'
    $rejectErr = Join-Path $root 'injected.err'
    $attempt = Start-Process -FilePath 'powershell.exe' -ArgumentList (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"')) + $arguments + @('-Root', ('"' + $root + '"'))) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $rejectFile -RedirectStandardError $rejectErr
    if ($attempt.ExitCode -eq 0 -or [IO.File]::ReadAllText($rejectErr) -notmatch 'field tidak dikenal: executable') { throw 'Injected executable field must be rejected before tick.' }
  }
  if (@((Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).runs).Count -ne 0) { throw 'Injected job produced a run.' }

  [System.IO.File]::WriteAllText($stateFile, $originalState)
  [System.IO.File]::Delete($auditFile)
  $errorFile = Join-Path $root 'missing-audit.error'
  $attempt = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $scriptPath + '"'), 'init', '-Root', ('"' + $root + '"')) -RedirectStandardError $errorFile -Wait -PassThru -WindowStyle Hidden
  if ($attempt.ExitCode -eq 0 -or (Test-Path -LiteralPath $auditFile)) { throw 'Missing audit must block init without recreating audit.' }
  # remote: kanal bukan rahasia; token tidak boleh pernah jadi argumen perintah.
  # remote adalah katalog kanal: boleh dipanggil tanpa state (init). Karena itu blok ini
  # sengaja dijalankan sebelum bagian yang memakai -Root.
  $channels = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remote -Sub channels 2>&1 | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'remote channels failed.' }
  if (@($channels.channels | Where-Object { $_.id -ceq 'telegram' -and $_.supported -eq $true }).Count -ne 1) { throw 'telegram must be supported.' }
  if (@($channels.channels | Where-Object { $_.id -ceq 'whatsapp' -and $_.supported -eq $true }).Count -ne 0) { throw 'whatsapp must not claim support before it exists.' }
  $ErrorActionPreference = 'Continue'
  $waOut = [string](& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remote -Sub status -Channel whatsapp 2>&1)
  if ($LASTEXITCODE -eq 0 -or $waOut -notmatch 'belum tersedia') { throw 'unsupported channel must fail loudly.' }
  $noChannel = [string](& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remote -Sub status 2>&1)
  if ($LASTEXITCODE -eq 0 -or $noChannel -notmatch 'Channel wajib') { throw 'remote without -Channel must fail.' }
  $ErrorActionPreference = 'Stop'
  $ErrorActionPreference = 'Continue'
  $help = [string](& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath __nope__ 2>&1)
  $ErrorActionPreference = 'Stop'
  if ($help -notmatch 'remote') { throw 'remote missing from command help.' }
  if ($help -match '\btelegram\b') { throw 'legacy telegram command still advertised.' }
  # allowlist wajib: tanpa -OwnerId, dan OwnerId bukan angka, setup harus gagal sebelum menyentuh .env
  $ErrorActionPreference = 'Continue'
  $noOwner = [string](& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remote -Sub setup -Channel telegram -ModelProvider net -ModelId x 2>&1)
  if ($LASTEXITCODE -eq 0 -or $noOwner -notmatch 'OwnerId wajib') { throw 'setup without allowlist must fail.' }
  $badOwner = [string](& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath remote -Sub setup -Channel telegram -OwnerId abc -ModelProvider net -ModelId x 2>&1)
  if ($LASTEXITCODE -eq 0 -or $badOwner -notmatch 'OwnerId tidak sesuai') { throw 'invalid allowlist id must fail.' }
  $ErrorActionPreference = 'Stop'
  $helpText = [IO.File]::ReadAllText($scriptPath)
  if ($helpText -notmatch 'Allowlist wajib') { throw 'Hub must document that allowlist is mandatory.' }
  'Hyper Hub contract checks passed.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
