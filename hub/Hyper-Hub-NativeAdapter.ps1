[CmdletBinding()]
param(
  [string]$BaseUrl,
  [string]$ApiUrl,
  [switch]$Plan,
  [switch]$SelfCheck
)

# C-08: adapter scheduler native (OpenCode >= 2.2.x) sebagai kontrak, bukan ketergantungan.
# Adapter hanya dipakai bila capability terbukti (endpoint schedule merespons) dan
# opt-in eksplisit (-Enable). Tanpa itu, Hyper Hub tetap memakai LocalSchedulerDriver.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-NativeSchedulePlan([string]$Endpoint) {
  # Payload mengikuti Schedule.CreatePayload 2.2.5 yang tercatat di riset.
  return [pscustomobject]@{
    adapter = 'native'
    requires = 'opencode >= 2.2.5 + experimental.schedules'
    endpoint = if ($Endpoint) { $Endpoint } else { 'POST /api/experimental/schedule' }
    payload = [pscustomobject]@{
      sessionID = 'ses_<id>'
      name = 'jdih-daily'
      when = [pscustomobject]@{ type = 'cron'; expr = '0 6 * * *'; tz = 'Asia/Jakarta' }
      prompt = 'Jalankan job jdih-daily'
      if = [pscustomobject]@{ type = 'shell'; command = 'exit 0' }
      until = [pscustomobject]@{ type = 'shell'; command = 'exit 1' }
    }
    fallback = 'local'
    executable = $false
  }
}

function Get-CapabilityVerdict([string]$Url) {
  # Tanpa jaringan tersedia/otomatis: capability dianggap tidak terbukti.
  if ([string]::IsNullOrWhiteSpace($Url)) { return [pscustomobject]@{ proven = $false; reason = 'tidak ada endpoint; native tidak aktif' } }
  $uri = $null
  if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) { return [pscustomobject]@{ proven = $false; reason = 'endpoint tidak sah' } }
  # SSRF: hanya loopback yang boleh diuji; selain itu ditolak.
  if ($uri.Host -notin @('127.0.0.1', '::1', 'localhost')) { return [pscustomobject]@{ proven = $false; reason = 'endpoint non-loopback ditolak' } }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    return [pscustomobject]@{ proven = ($response.StatusCode -eq 200); reason = "HTTP $($response.StatusCode)"; httpRequests = 1 }
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    return [pscustomobject]@{ proven = $false; reason = $(if ($status) { "HTTP $status (endpoint tidak tersedia)" } else { 'tidak dapat dihubungi' }); httpRequests = 1 }
  } finally { $ErrorActionPreference = $previous }
}

if ($SelfCheck) {
  $failures = New-Object System.Collections.Generic.List[string]
  $schedulePlan = Get-NativeSchedulePlan ''
  if ($schedulePlan.adapter -cne 'native' -or $schedulePlan.executable -ne $false) { $failures.Add('plan harus native dan tidak executable') }
  if ($schedulePlan.payload.when.tz -cne 'Asia/Jakarta') { $failures.Add('payload harus memakai Asia/Jakarta') }
  if ($schedulePlan.fallback -cne 'local') { $failures.Add('fallback harus local') }

  $noEndpoint = Get-CapabilityVerdict ''
  if ($noEndpoint.proven) { $failures.Add('tanpa endpoint native tidak boleh terbukti') }

  $bad = Get-CapabilityVerdict 'http://169.254.169.254/api/experimental/schedule'
  if ($bad.proven -or $bad.reason -notmatch 'non-loopback') { $failures.Add('endpoint non-loopback harus ditolak') }

  # Endpoint loopback yang pasti tertutup: capability harus tetap false, bukan error.
  $closed = Get-CapabilityVerdict 'http://127.0.0.1:9/api/experimental/schedule'
  if ($closed.proven) { $failures.Add('endpoint tertutup tidak boleh dianggap terbukti') }

  $invalid = Get-CapabilityVerdict 'bukan-url'
  if ($invalid.proven) { $failures.Add('URL tidak sah harus ditolak') }

  if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
  'Native adapter self-check passed: plan 2.2.5, fallback lokal, dan capability fail-closed.'
  exit 0
}

$schedulePlan = Get-NativeSchedulePlan $ApiUrl
$verdict = Get-CapabilityVerdict $BaseUrl
[pscustomobject]@{ plan = $schedulePlan; capability = $verdict; activeAdapter = $(if ($verdict.proven -and $Plan.IsPresent) { 'native' } else { 'local' }); executable = $false } | ConvertTo-Json -Depth 6
exit 0
