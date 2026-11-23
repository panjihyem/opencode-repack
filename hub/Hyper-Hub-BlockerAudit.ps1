[CmdletBinding()]
param([switch]$SelfCheck, [string]$OutFile)

# Verifikasi blocker sisa backlog: setiap task open diperiksa keadaannya di mesin ini
# dengan bukti yang dapat diulang. Tidak memasang apa pun, tidak menyentuh kredensial.
# Tujuan: memisahkan "belum dikerjakan" dari "tidak mungkin dikerjakan di sini".

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Test-Command([string]$Name) {
  return ($null -ne (Get-Command $Name -ErrorAction SilentlyContinue))
}

function Get-BlockerFacts {
  $facts = [ordered]@{}
  # Runtime engine: cek binary dan jalankan --version (tanpa HTTP).
  $engineCandidates = @(
    (Join-Path $env:APPDATA 'ai.hyperai.desktop\cli\2.1.10-x64\opencode-cli.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\@opencodedesktop\resources\opencode-cli.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\ai.opencode.desktop\resources\opencode-cli.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ }
  $enginePath = @($engineCandidates)[0]
  $engineVersion = $null
  if ($enginePath) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $output = & $enginePath --version 2>&1
      $match = [regex]::Match([string](($output | Out-String)), '\d+\.\d+\.\d+')
      if ($match.Success) { $engineVersion = $match.Value }
    } catch { } finally { $ErrorActionPreference = $previous }
  }
  $facts['engine'] = [pscustomobject]@{
    onPath = (Test-Command 'opencode-cli.exe')
    binaryFound = ($null -ne $enginePath)
    version = $engineVersion
    desktopAppData = (Test-Path (Join-Path $env:APPDATA 'ai.hyperai.desktop'))
  }
  # Containerisasi: binary wsl.exe ada tapi distro belum tentu terpasang.
  $wslReady = $false
  if (Test-Command 'wsl') {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $list = & wsl --list --quiet 2>&1
      $wslReady = ($LASTEXITCODE -eq 0 -and ([string](($list | Out-String))).Trim().Length -gt 0)
    } catch { } finally { $ErrorActionPreference = $previous }
  }
  $facts['containers'] = [pscustomobject]@{
    docker = (Test-Command 'docker')
    wslInstalled = $wslReady
  }
  # Desktop automation sidecar
  $facts['desktop'] = [pscustomobject]@{
    windowsMcp = (Get-Process -Name 'Windows-MCP' -ErrorAction SilentlyContinue) -ne $null
    mcpConfig = (Test-Path (Join-Path $env:USERPROFILE '.config\opencode\mcp.json'))
  }
  # Remote support
  $facts['remote'] = [pscustomobject]@{
    meshAgentService = ($null -ne (Get-Service -Name 'MeshAgent' -ErrorAction SilentlyContinue))
  }
  # Kanal
  $channelRoot = Join-Path $env:LOCALAPPDATA 'HyperHub'
  $facts['channels'] = [pscustomobject]@{
    telegramDir = (Test-Path (Join-Path $channelRoot 'remote-telegram'))
    telegramBuilt = (Test-Path (Join-Path $channelRoot 'remote-telegram\dist\index.js'))
    whatsappDir = (Test-Path (Join-Path $channelRoot 'remote-whatsapp'))
  }
  # Browser sidecar
  $facts['browser'] = [pscustomobject]@{
    playwrightPackage = (Test-Path (Join-Path $env:USERPROFILE '.cache\ms-playwright'))
  }
  # Graph DB
  $facts['graph'] = [pscustomobject]@{
    neo4jPort = $false
    boltPort = $false
  }
  foreach ($port in 7474, 7687) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      try {
        $async = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        $reachable = $async.AsyncWaitHandle.WaitOne(600)
        if ($reachable) { $client.EndConnect($async) }
      } finally { $client.Close() }
    } catch { $reachable = $false }
    if ($port -eq 7474) { $facts['graph'].neo4jPort = $reachable } else { $facts['graph'].boltPort = $reachable }
  }
  # STT runtime
  $facts['voice'] = [pscustomobject]@{
    whisperCli = (Test-Command 'whisper-cli.exe')
    whisperCpp = (Test-Command 'whisper')
  }
  # State lama
  $facts['legacyState'] = [pscustomobject]@{
    localAppData = (Test-Path (Join-Path $channelRoot 'state'))
    dotHyperHub = (Test-Path (Join-Path $env:USERPROFILE '.hyper-hub'))
  }
  return [pscustomobject]$facts
}

function Get-TaskVerdicts($Facts) {
  # Setiap entri: task -> bisa dikerjakan di mesin ini?
  $rows = @()
  $rows += [pscustomobject]@{ id = 'B-08'; blockedBy = 'reviewer manusia independen'; ready = $false; note = 'DoD mensyaratkan diuji orang lain' }
  $rows += [pscustomobject]@{ id = 'E-06'; blockedBy = 'nomor WhatsApp khusus + keputusan owner'; ready = $false; note = 'E-05 sudah no-go' }
  $rows += [pscustomobject]@{ id = 'F-10'; blockedBy = '14 hari kalender + sign-off'; ready = $false; note = 'harness simulasi sudah ada' }
  $rows += [pscustomobject]@{ id = 'H-02'; blockedBy = 'Windows-MCP + isolasi sesi'; ready = $Facts.desktop.windowsMcp; note = 'HG-DESKTOP-GO masih no-go' }
  $rows += [pscustomobject]@{ id = 'H-04'; blockedBy = 'H-02 + 10 alur GUI'; ready = $false; note = 'bergantung sidecar desktop' }
  $rows += [pscustomobject]@{ id = 'I-02'; blockedBy = 'akun Composio + DPA'; ready = $false; note = 'butuh kredensial vendor dan kontrak' }
  $rows += [pscustomobject]@{ id = 'I-03'; blockedBy = 'Activepieces self-host'; ready = ($Facts.containers.docker -or $Facts.containers.wslInstalled); note = 'butuh container runtime' }
  $rows += [pscustomobject]@{ id = 'J-03'; blockedBy = 'graph DB berjalan'; ready = ($Facts.graph.neo4jPort -or $Facts.graph.boltPort); note = 'kontrak graph sudah ada' }
  $rows += [pscustomobject]@{ id = 'K-02'; blockedBy = 'model STT + dataset berizin'; ready = ($Facts.voice.whisperCli -or $Facts.voice.whisperCpp); note = 'butuh unduhan model dan audio' }
  $rows += [pscustomobject]@{ id = 'K-03'; blockedBy = 'LiveKit/Pipecat + use case'; ready = $false; note = 'HG-VOICE-SCOPE belum disahkan' }
  $rows += [pscustomobject]@{ id = 'L-02'; blockedBy = 'MeshCentral server'; ready = $Facts.remote.meshAgentService; note = 'HG-REMOTE-GO masih no-go' }
  $rows += [pscustomobject]@{ id = 'L-03'; blockedBy = 'L-02'; ready = $false; note = 'bergantung remote support' }
  $rows += [pscustomobject]@{ id = 'M-06'; blockedBy = 'pilot + sign-off'; ready = $false; note = 'bergantung F-10' }
  $rows += [pscustomobject]@{ id = 'M-08'; blockedBy = 'hasil pilot'; ready = $false; note = 'bergantung M-06' }
  return @($rows)
}

if ($SelfCheck) {
  $facts = Get-BlockerFacts
  $issues = @()
  if ($null -eq $facts.engine) { $issues += 'facts.engine hilang' }
  foreach ($field in @('onPath', 'binaryFound', 'version', 'desktopAppData')) {
    if ($null -eq $facts.engine.PSObject.Properties[$field]) { $issues += "engine.$field hilang" }
  }
  $verdicts = Get-TaskVerdicts $facts
  if (@($verdicts).Count -ne 14) { $issues += "harus 14 task sisa, dapat $(@($verdicts).Count)" }
  foreach ($row in $verdicts) {
    if ($row.PSObject.Properties['ready'].Value -isnot [bool]) { $issues += "$($row.id): ready harus boolean" }
    if ([string]::IsNullOrWhiteSpace($row.blockedBy)) { $issues += "$($row.id): blockedBy wajib" }
  }
  $text = ConvertTo-Json -InputObject ([pscustomobject]@{ facts = $facts; tasks = $verdicts }) -Depth 8
  if ($text -match '(?i)(apiKey|sk-|ghp_|password\s*[:=])') { $issues += 'output tidak boleh memuat rahasia' }
  if ($issues.Count -gt 0) { $issues | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
  'Blocker audit self-check passed: 14 task, setiap blocker punya alasan, tanpa rahasia.'
  exit 0
}

$result = [pscustomobject]@{
  checkedAtUtc = [DateTime]::UtcNow.ToString('o')
  facts = (Get-BlockerFacts)
  tasks = (Get-TaskVerdicts (Get-BlockerFacts))
  valuesExposed = $false
}
$json = ConvertTo-Json -InputObject $result -Depth 8
if (-not [string]::IsNullOrWhiteSpace($OutFile)) { [IO.File]::WriteAllText($OutFile, $json, $utf8); "written: $OutFile" } else { $json }
exit 0
