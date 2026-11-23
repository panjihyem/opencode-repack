[CmdletBinding()]
param(
  [string]$ConfigPath,
  [int]$TimeoutSeconds = 5,
  [switch]$Probe,
  [switch]$SelfCheck
)

# N-02/N-03/N-04: cek kesehatan provider lokal dan klaim tool_calling, tanpa membocorkan
# kredensial. Default hanya memeriksa port loopback (tanpa HTTP). -Probe mencoba
# /v1/models pada provider loopback yang terdaftar di config.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Providers([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Config tidak ditemukan: $Path" }
  $config = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8))
  $rows = @()
  if ($null -eq $config.provider) { return @() }
  foreach ($entry in $config.provider.PSObject.Properties) {
    $base = [string]$entry.Value.options.baseURL
    $uri = $null
    $isLoopback = $false
    if (-not [string]::IsNullOrWhiteSpace($base) -and [Uri]::TryCreate($base, [UriKind]::Absolute, [ref]$uri)) {
      $isLoopback = $uri.IsLoopback
    }
    $tools = @()
    if ($null -ne $entry.Value.models) {
      foreach ($model in $entry.Value.models.PSObject.Properties) {
        $tools += [pscustomobject]@{ id = [string]$model.Name; tools = ($model.Value.tool_call -eq $true) }
      }
    }
    $rows += [pscustomobject]@{
      id = $entry.Name
      baseURL = $(if ($base) { $base } else { $null })
      host = $(if ($null -ne $uri) { $uri.Host } else { $null })
      port = $(if ($null -ne $uri) { $uri.Port } else { $null })
      loopback = $isLoopback
      hasCredentials = (-not [string]::IsNullOrWhiteSpace([string]$entry.Value.options.apiKey))
      models = @($tools)
      toolsClaimed = @($tools | Where-Object { $_.tools }).Count
    }
  }
  return @($rows | Sort-Object id)
}

function Test-Port([string]$HostName, [int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $async = $client.BeginConnect($HostName, $Port, $null, $null)
      if (-not $async.AsyncWaitHandle.WaitOne(1500)) { return $false }
      $client.EndConnect($async)
      return $true
    } finally { $client.Close() }
  } catch { return $false }
}

function Invoke-HealthProbe([string]$BaseUrl, [int]$Timeout) {
  # Hanya loopback. Tidak mengirim kredensial: cukup /v1/models.
  $uri = $null
  if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref]$uri)) { return [pscustomobject]@{ ok = $false; reason = 'URL tidak sah' } }
  if (-not $uri.IsLoopback) { return [pscustomobject]@{ ok = $false; reason = 'probe hanya untuk loopback' } }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $response = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + '/models') -UseBasicParsing -TimeoutSec $Timeout -ErrorAction Stop
    $body = $null
    try { $body = ConvertFrom-Json -InputObject $response.Content } catch { }
    $count = if ($null -ne $body -and $null -ne $body.data) { @($body.data).Count } else { $null }
    return [pscustomobject]@{ ok = ($response.StatusCode -eq 200); httpStatus = [int]$response.StatusCode; modelCount = $count }
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    return [pscustomobject]@{ ok = $false; httpStatus = $status; reason = 'tidak dapat dihubungi' }
  } finally { $ErrorActionPreference = $previous }
}

function Get-ProviderReport([string]$Path, [bool]$DoProbe, [int]$Timeout) {
  $providers = Get-Providers $Path
  $rows = @()
  foreach ($p in $providers) {
    $reachable = $null
    $probeResult = $null
    if ($p.loopback -and $null -ne $p.port) {
      $reachable = Test-Port $p.host $p.port
      if ($DoProbe -and $reachable) { $probeResult = Invoke-HealthProbe $p.baseURL $Timeout }
    }
    $rows += [pscustomobject]@{
      id = $p.id
      scope = $(if ($p.loopback) { 'loopback' } else { 'remote' })
      credentials = $p.hasCredentials
      models = @($p.models).Count
      toolsClaimed = $p.toolsClaimed
      reachable = $reachable
      probeOk = $(if ($null -ne $probeResult) { $probeResult.ok } else { $null })
      probeDetail = $(if ($null -ne $probeResult) { $probeResult.reason } else { $null })
    }
  }
  return [pscustomobject]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    providers = @($rows)
    loopbackReachable = @($rows | Where-Object { $_.scope -eq 'loopback' -and $_.reachable -eq $true }).Count
    loopbackDown = @($rows | Where-Object { $_.scope -eq 'loopback' -and $_.reachable -eq $false }).Count
    valuesExposed = $false
  }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('provider-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $config = Join-Path $temp 'opencode.json'
    $body = '{"provider":{"local":{"options":{"baseURL":"http://127.0.0.1:1234/v1","apiKey":"secret-should-not-leak"},"models":{"m1":{"tool_call":true},"m2":{"tool_call":false}}},"cloud":{"options":{"baseURL":"https://api.example.com/v1","apiKey":"also-secret"},"models":{"c1":{"tool_call":true}}}}}'
    [IO.File]::WriteAllText($config, $body, $utf8)

    $providers = Get-Providers $config
    if (@($providers).Count -ne 2) { $failures.Add('harus 2 provider') }
    $local = @($providers | Where-Object { $_.id -eq 'local' })[0]
    if (-not $local.loopback -or $local.port -ne 1234) { $failures.Add('provider lokal harus loopback port 1234') }
    if ($local.toolsClaimed -ne 1) { $failures.Add('toolsClaimed harus 1') }
    $cloud = @($providers | Where-Object { $_.id -eq 'cloud' })[0]
    if ($cloud.loopback) { $failures.Add('provider cloud bukan loopback') }

    $report = Get-ProviderReport $config $false 2
    $reportText = ConvertTo-Json -InputObject $report -Depth 6
    if ($reportText -match 'secret-should-not-leak|also-secret') { $failures.Add('laporan tidak boleh memuat apiKey') }
    if ($report.valuesExposed -ne $false) { $failures.Add('valuesExposed harus false') }
    if (@($report.providers | Where-Object { $_.scope -eq 'remote' -and $_.reachable -ne $null }).Count -ne 0) { $failures.Add('provider remote tidak boleh diprobe port') }

    # Probe non-loopback harus ditolak tanpa melakukan request.
    $probeOut = Invoke-HealthProbe 'https://api.example.com/v1' 2
    if ($probeOut.ok -or $probeOut.reason -notmatch 'loopback') { $failures.Add('probe non-loopback harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Provider health self-check passed: klasifikasi loopback/remote, hitung tools, tanpa kebocoran apiKey.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath = Join-Path $env:USERPROFILE '.config\opencode\opencode.json' }
$report = Get-ProviderReport $ConfigPath ([bool]$Probe) $TimeoutSeconds
$report | ConvertTo-Json -Depth 6
exit 0
