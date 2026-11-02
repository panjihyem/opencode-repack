$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("hyper-hub-test-" + [Guid]::NewGuid().ToString('N'))
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath self-check -Root $root
  if ($LASTEXITCODE -ne 0) { throw "Self-check exited $LASTEXITCODE" }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath init -Root $root | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Init exited $LASTEXITCODE" }
  $state = Get-Content -LiteralPath (Join-Path $root 'state.json') -Raw | ConvertFrom-Json
  if ($state.version -ne 1 -or @($state.jobs).Count -ne 0) { throw 'Fresh state invariant failed.' }

  # Origin policy: gagal-tertutup dan allowlist (G-02)
  $policy = Join-Path $root 'browser-origin-policy.json'
  $probe = {
    param($Zone, $Origin)
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath policy-check -Root $root -Zone $Zone -Operation browser.navigate -Origin $Origin 2>$null | Out-String
    if ($LASTEXITCODE -ne 0) { throw "policy-check exited $LASTEXITCODE untuk $Origin" }
    ($out | ConvertFrom-Json).decision
  }
  $cases = @(
    [pscustomobject]@{ Zone = 'regular'; Origin = 'https://jdih.go.id'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'regular'; Origin = 'http://localhost:8080'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'regular'; Origin = 'http://192.168.1.1'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'regular'; Origin = 'https://u:p@jdih.go.id'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'regular'; Origin = 'file:///C:/Windows/System32/drivers/etc/hosts'; Expect = 'deny' }
  )
  foreach ($item in $cases) {
    $got = & $probe $item.Zone $item.Origin
    if ($got -cne $item.Expect) { throw "origin policy: $($item.Origin) = $got, harus $($item.Expect) tanpa policy" }
  }

  [System.IO.File]::WriteAllText($policy, '{"block":["https://evil.example.com"],"regular":{"allow":[{"origin":"https://jdih.go.id","alasan":"a","pemilik":"b"}]},"case":{"allow":[{"origin":"https://*.go.id","alasan":"a","pemilik":"b"}]}}')
  $allowed = @(
    [pscustomobject]@{ Zone = 'regular'; Origin = 'https://jdih.go.id'; Expect = 'allow' }
    [pscustomobject]@{ Zone = 'regular'; Origin = 'https://jdih.go.id:443'; Expect = 'allow' }
    [pscustomobject]@{ Zone = 'regular'; Origin = 'HTTPS://JDIH.GO.ID/x?y=1'; Expect = 'allow' }
    [pscustomobject]@{ Zone = 'case'; Origin = 'https://jdih.go.id'; Expect = 'allow' }
    [pscustomobject]@{ Zone = 'case'; Origin = 'https://jdih.kemenkum.go.id'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'case'; Origin = 'https://go.id'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'case'; Origin = 'https://evil.example.com'; Expect = 'deny' }
    [pscustomobject]@{ Zone = 'case'; Origin = 'https://jdih.go.id:8443'; Expect = 'deny' }
  )
  foreach ($item in $allowed) {
    $got = & $probe $item.Zone $item.Origin
    if ($got -cne $item.Expect) { throw "origin policy: $($item.Zone) $($item.Origin) = $got, harus $($item.Expect)" }
  }

  [System.IO.File]::WriteAllText($policy, '{"block":[],"regular":{"allow":[{"origin":"https://jdih.go.id","alasan":"a"}]},"case":{"allow":[]}}')
  if ((& $probe 'regular' 'https://jdih.go.id') -cne 'deny') { throw 'origin policy: allowlist tanpa pemilik harus deny' }
  [System.IO.File]::WriteAllText($policy, '{ rusak')
  if ((& $probe 'regular' 'https://jdih.go.id') -cne 'deny') { throw 'origin policy: JSON rusak harus deny' }

  # Health: ringkasan baca-saja dan hitungan job.
  $addOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath add -Root $root -Id h1 -Name 'H1' -Zone regular -EveryMinutes 15 -Action a -Resource r 2>$null
  if ($LASTEXITCODE -ne 0) { throw "add untuk health exited $LASTEXITCODE" }
  $healthOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath health -Root $root 2>$null | Out-String
  if ($LASTEXITCODE -ne 0) { throw "health exited $LASTEXITCODE" }
  $health = $healthOut | ConvertFrom-Json
  if ($health.auditChain -cne 'valid') { throw 'health: rantai audit harus valid' }
  if ($health.lockFree -ne $true) { throw 'health: lock harus bebas saat tidak ada runner' }
  if ($health.jobs.total -ne 1 -or $health.jobs.enabled -ne 1) { throw "health: hitungan job salah ($($health.jobs.total)/$($health.jobs.enabled))" }
  if ($health.jobs.invalidSchedule -ne 0) { throw 'health: tidak boleh ada jadwal tak valid' }
  if ($health.executable -ne $false) { throw 'health: executable harus selalu false' }
  if ($health.queue.pending -ne 0 -or $health.approvals.pending -ne 0) { throw 'health: antrean dan approval harus 0' }

  # Lock: dua penulis bersamaan, hanya satu yang boleh menyimpan.
  $lockRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("hyper-hub-lock-" + [Guid]::NewGuid().ToString('N'))
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath init -Root $lockRoot 2>$null | Out-Null
    $o1 = Join-Path $lockRoot 'o1.txt'; $e1 = Join-Path $lockRoot 'e1.txt'
    $o2 = Join-Path $lockRoot 'o2.txt'; $e2 = Join-Path $lockRoot 'e2.txt'
    $common = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$scriptPath`"", 'add', '-Root', "`"$lockRoot`"", '-Name', 'L', '-Zone', 'regular', '-EveryMinutes', '15', '-Action', 'a', '-Resource', 'r')
    $p1 = Start-Process powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $o1 -RedirectStandardError $e1 -ArgumentList (@($common) + @('-Id', 'lock-a'))
    $p2 = Start-Process powershell.exe -PassThru -WindowStyle Hidden -RedirectStandardOutput $o2 -RedirectStandardError $e2 -ArgumentList (@($common) + @('-Id', 'lock-b'))
    if (-not $p1.WaitForExit(120000) -or -not $p2.WaitForExit(120000)) { throw 'lock: proses tidak selesai dalam batas waktu' }
    $saved = @((Get-Content (Join-Path $lockRoot 'state.json') -Raw | ConvertFrom-Json).jobs)
    if ($saved.Count -ne 1) { throw "lock: harus tepat satu job tersimpan, dapat $($saved.Count)" }
    $lockErr = ((Get-Content $e1 -Raw -ErrorAction SilentlyContinue), (Get-Content $e2 -Raw -ErrorAction SilentlyContinue)) -join ' '
    if ($lockErr -notmatch 'Another runner holds lock') { throw 'lock: penulis kedua harus ditolak dengan pesan lock' }
  } finally {
    Remove-Item -LiteralPath $lockRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  'Hyper Hub self-check passed.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
