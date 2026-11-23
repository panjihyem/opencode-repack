[CmdletBinding()]
param(
  [string]$Registry,
  [string]$Id,
  [string]$Type,
  [string]$Egress,
  [string]$SecretRef,
  [int]$TimeoutSeconds = 30,
  [int]$MaxAttempts = 1,
  [string]$Reviewer,
  [switch]$Revoke,
  [switch]$Validate,
  [switch]$List,
  [switch]$SelfCheck
)

# Registry connector ADR-007. Gate keras: hanya entri status 'validated' yang boleh
# dipakai untuk eksekusi. Entri draft/spike/unknown/revoked ditolak.
# ponytail: penyimpanan JSON; migrasi ke SQLite saat B-01 selesai.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$idPattern = '^[a-z0-9][a-z0-9._-]{1,31}$'
$secretRefPattern = '^[A-Za-z][A-Za-z0-9._-]{1,63}$'

function Read-Registry([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return [pscustomobject]@{ version = 1; connectors = [pscustomobject]@{ __none = $true }; updatedAtUtc = $null } }
  $raw = [IO.File]::ReadAllText($Path, $utf8)
  $registry = ConvertFrom-Json -InputObject $raw
  if ($registry.version -ne 1 -or $null -eq $registry.connectors -or $registry.connectors -isnot [pscustomobject]) { throw 'Registry tidak sah; tolak membaca.' }
  return $registry
}

function ConvertTo-ConnectorLookup($Registry) {
  # pscustomobject tidak menerima Add-Member saat kosong; pakai hashtable internal.
  $lookup = @{}
  if ($null -ne $Registry.connectors) {
    foreach ($property in $Registry.connectors.PSObject.Properties) {
      if ($property.Name -ceq '__none') { continue }
      $lookup[$property.Name] = $property.Value
    }
  }
  return $lookup
}

function Save-Registry([string]$Path, [hashtable]$Lookup) {
  $dir = Split-Path -Parent $Path
  if (-not [IO.Directory]::Exists($dir)) { [void][IO.Directory]::CreateDirectory($dir) }
  $pairs = @{}
  foreach ($key in $Lookup.Keys) { $pairs[$key] = $Lookup[$key] }
  $document = [ordered]@{ version = 1; updatedAtUtc = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'); connectors = $pairs }
  $tmp = "$Path.tmp"
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $document -Depth 8), $utf8)
  if ([IO.File]::Exists($Path)) { [IO.File]::Delete($Path) }
  [IO.File]::Move($tmp, $Path)
}

function Get-EgressHost([string]$Item) {
  if ($Item -match '^[a-z][a-z0-9+.-]*://') {
    # Uri menolak '*', jadi ambil host lewat regex agar wildcard subdomain tetap sah.
    $match = [regex]::Match($Item, '^[a-z][a-z0-9+.-]*://(\*\.)?([^/:]+)')
    if (-not $match.Success) { return $null }
    return $match.Groups[2].Value
  }
  return ($Item -split ':')[0]
}

function Test-EgressPattern([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  foreach ($entry in ($Value -split ',')) {
    $item = $entry.Trim()
    # Wildcard seluruh host ditolak; wildcard subdomain eksplisit (*.host) diizinkan.
    if ($item -match '://\*(?=[^.]|$)' -or $item -match '://\*/' -or $item -match '^(\*|\*/)(:|$)') { return $false }
    if ($item -match '^[a-z][a-z0-9+.-]*://(\*\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?$') {
      $hostName = Get-EgressHost $item
      # SSRF/T11: IP literal (loopback, link-local, privat, publik) ditolak; pakai hostname.
      if ($null -eq $hostName -or $hostName -match '^\d{1,3}(\.\d{1,3}){3}$' -or $hostName -match ':') { return $false }
      continue
    }
    if ($item -match '^(\*\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*:\d{1,5}$') {
      $hostName = ($item -split ':')[0]
      if ($hostName -match '^\d{1,3}(\.\d{1,3}){3}$') { return $false }
      continue
    }
    if ($item -match '^(\*\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$') { continue }
    return $false
  }
  return $true
}

function Test-ConnectorEntry($Entry) {
  $issues = @()
  foreach ($field in @('id', 'type', 'zona_diizinkan', 'enabled', 'status', 'egress', 'secret_ref', 'timeout', 'retry', 'audit_hook', 'review')) {
    if ($null -eq $Entry.PSObject.Properties[$field]) { $issues += "field wajib hilang: $field" }
  }
  if ($issues.Count -gt 0) { return $issues }
  if ([string]$Entry.id -notmatch $idPattern) { $issues += 'id tidak sah' }
  if ([string]$Entry.type -notin @('http', 'browser', 'memory', 'channel', 'local')) { $issues += 'type tidak dikenal' }
  if ([string]$Entry.zona_diizinkan -cne 'regular') { $issues += 'zona_diizinkan harus regular untuk MVP' }
  if ($Entry.enabled -isnot [bool]) { $issues += 'enabled harus boolean' }
  if ([string]$Entry.status -notin @('draft', 'spike', 'validated', 'revoked', 'unknown')) { $issues += 'status tidak dikenal' }
  if (-not (Test-EgressPattern ([string]$Entry.egress))) { $issues += 'egress bukan allowlist host/port/protokol yang sah' }
  if ([string]$Entry.secret_ref -notmatch $secretRefPattern) { $issues += 'secret_ref tidak sah (harus referensi, bukan nilai)' }
  if ($Entry.timeout -isnot [int] -or $Entry.timeout -lt 1 -or $Entry.timeout -gt 900) { $issues += 'timeout 1-900 detik' }
  if ($null -eq $Entry.retry -or $Entry.retry.maxAttempts -isnot [int] -or $Entry.retry.maxAttempts -lt 1 -or $Entry.retry.maxAttempts -gt 5) { $issues += 'retry.maxAttempts 1-5' }
  if ($Entry.audit_hook -ne $true) { $issues += 'audit_hook wajib terpasang' }
  if ([string]$Entry.review.reviewer -notmatch '\S' -and [string]$Entry.status -ceq 'validated') { $issues += 'review.reviewer wajib saat validated' }
  if ([string]$Entry.review.date -notmatch '^(|\d{4}-\d{2}-\d{2})$') { $issues += 'review.date wajib YYYY-MM-DD' }
  if ([string]$Entry.review.result -notmatch '^(pass|fail)$') { $issues += 'review.result wajib pass/fail' }
  if ([string]$Entry.status -ceq 'validated' -and [string]$Entry.review.result -cne 'pass') { $issues += 'validated membutuhkan review.result=pass' }
  if ([string]$Entry.secret_ref -match '(?i)^(gh[pousr]_|sk-|AKIA)') { $issues += 'secret_ref tampak berisi nilai secret, bukan referensi' }
  return $issues
}

function Get-ConnectorDecision([hashtable]$Lookup, [string]$ConnectorId) {
  $entry = if ($Lookup.ContainsKey($ConnectorId)) { $Lookup[$ConnectorId] } else { $null }
  if ($null -eq $entry) { return [pscustomobject]@{ connector = $ConnectorId; decision = 'deny'; reason = 'connector tidak terdaftar'; executable = $false } }
  $issues = Test-ConnectorEntry $entry
  if ($issues.Count -gt 0) { return [pscustomobject]@{ connector = $ConnectorId; decision = 'deny'; reason = "entri tidak valid: $($issues -join '; ')"; executable = $false } }
  if (-not $entry.enabled) { return [pscustomobject]@{ connector = $ConnectorId; decision = 'deny'; reason = 'connector disabled'; executable = $false } }
  if ([string]$entry.status -cne 'validated') { return [pscustomobject]@{ connector = $ConnectorId; decision = 'deny'; reason = "status $($entry.status) bukan validated"; executable = $false } }
  return [pscustomobject]@{ connector = $ConnectorId; decision = 'allow'; reason = 'validated'; executable = $false }
}

function Invoke-Register([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Id)) { throw 'Parameter -Id wajib.' }
  if ($Id -notmatch $idPattern) { throw "Id connector tidak sah: $Id" }
  $lookup = ConvertTo-ConnectorLookup (Read-Registry $Path)
  if ($lookup.ContainsKey($Id) -and -not $Revoke -and -not $Validate) { throw "Connector sudah ada: $Id (pakai -Validate atau -Revoke)." }
  if ($Revoke) {
    if (-not $lookup.ContainsKey($Id)) { throw "Connector tidak ada: $Id" }
    $lookup[$Id].status = 'revoked'
    $lookup[$Id].enabled = $false
    Save-Registry $Path $lookup
    return ([pscustomobject]@{ connector = $Id; status = 'revoked'; decision = 'deny'; executable = $false } | ConvertTo-Json -Depth 4)
  }
  if ($Validate) {
    if (-not $lookup.ContainsKey($Id)) { throw "Connector tidak ada: $Id" }
    if ([string]::IsNullOrWhiteSpace($Reviewer)) { throw 'Parameter -Reviewer wajib untuk -Validate.' }
    $entry = $lookup[$Id]
    $entry.review = [pscustomobject]@{ reviewer = $Reviewer; date = [DateTime]::UtcNow.ToString('yyyy-MM-dd'); result = 'pass' }
    $entry.status = 'validated'
    $entry.enabled = $true
    $issues = Test-ConnectorEntry $entry
    if ($issues.Count -gt 0) { throw "Entri belum layak divalidasi: $($issues -join '; ')" }
    Save-Registry $Path $lookup
    return ([pscustomobject]@{ connector = $Id; status = 'validated'; reviewer = $Reviewer; executable = $false } | ConvertTo-Json -Depth 4)
  }
  if ([string]::IsNullOrWhiteSpace($Type)) { throw 'Parameter -Type wajib.' }
  if ([string]::IsNullOrWhiteSpace($Egress)) { throw 'Parameter -Egress wajib (allowlist).' }
  if ([string]::IsNullOrWhiteSpace($SecretRef)) { throw 'Parameter -SecretRef wajib (referensi, bukan nilai).' }
  $entry = [pscustomobject]@{
    id = $Id; type = $Type; zona_diizinkan = 'regular'; enabled = $false; status = 'draft'
    egress = $Egress; secret_ref = $SecretRef; timeout = $TimeoutSeconds
    retry = [pscustomobject]@{ maxAttempts = $MaxAttempts; retryDelaySeconds = 0 }
    circuitBreaker = [pscustomobject]@{ failures = 5; windowSeconds = 60 }
    rateLimit = [pscustomobject]@{ perMinute = 60 }
    audit_hook = $true
    review = [pscustomobject]@{ reviewer = ''; date = ''; result = 'fail' }
    createdAtUtc = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  }
  $issues = Test-ConnectorEntry $entry
  if ($issues.Count -gt 0) { throw "Connector tidak sah: $($issues -join '; ')" }
  $lookup[$Id] = $entry
  Save-Registry $Path $lookup
  return ([pscustomobject]@{ connector = $Id; status = 'draft'; enabled = $false; executable = $false } | ConvertTo-Json -Depth 4)
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('connector-registry-' + [Guid]::NewGuid().ToString('N') + '.json')
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    $registry = Read-Registry $temp
    $lookup = ConvertTo-ConnectorLookup $registry
    $lookup['jdih'] = [pscustomobject]@{
      id = 'jdih'; type = 'http'; zona_diizinkan = 'regular'; enabled = $true; status = 'draft'
      egress = 'https://jdih.kemenkeu.go.id'; secret_ref = 'hub.jdih.token'; timeout = 30
      retry = [pscustomobject]@{ maxAttempts = 2; retryDelaySeconds = 0 }
      audit_hook = $true; review = [pscustomobject]@{ reviewer = ''; date = ''; result = 'fail' }
    }
    $entry = $lookup['jdih']
    $missing = Get-ConnectorDecision $lookup 'telegram'
    if ($missing.decision -cne 'deny') { $failures.Add('connector tak terdaftar harus deny') }

    if ((Test-ConnectorEntry $entry).Count -ne 0) { $failures.Add("entri draft sah ditolak: $((Test-ConnectorEntry $entry) -join '; ')") }
    $draft = Get-ConnectorDecision $lookup 'jdih'
    if ($draft.decision -cne 'deny' -or $draft.reason -notmatch 'draft') { $failures.Add('entri draft harus deny dengan alasan status') }

    $entry.status = 'validated'; $entry.review = [pscustomobject]@{ reviewer = 'owner'; date = '2026-11-23'; result = 'pass' }
    if ((Get-ConnectorDecision $lookup 'jdih').decision -cne 'allow') { $failures.Add('entri validated harus allow') }

    $entry.enabled = $false
    if ((Get-ConnectorDecision $lookup 'jdih').decision -cne 'deny') { $failures.Add('entri disabled harus deny') }
    $entry.enabled = $true

    $bad = $entry.PSObject.Copy()
    $bad.egress = 'http://*'
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('egress wildcard harus ditolak') }
    $bad = $entry.PSObject.Copy(); $bad.egress = 'https://*.go.id:443'
    if ((Test-ConnectorEntry $bad).Count -gt 0) { $failures.Add('egress subdomain eksplisit harus diterima') }
    $bad = $entry.PSObject.Copy(); $bad.egress = 'https://evil.example.com/path?x=1'
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('egress dengan path harus ditolak') }
    foreach ($ssrf in @('http://127.0.0.1', 'http://localhost:8080', 'http://169.254.169.254', 'http://10.0.0.5', '127.0.0.1:443', 'http://[::1]')) {
      $bad = $entry.PSObject.Copy(); $bad.egress = $ssrf
      if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add("egress IP literal harus ditolak: $ssrf") }
    }
    $bad = $entry.PSObject.Copy(); $bad.egress = 'https://jdih.kemenkeu.go.id, *.go.id:443'
    if ((Test-ConnectorEntry $bad).Count -gt 0) { $failures.Add('daftar egress sah harus diterima') }
    $bad = $entry.PSObject.Copy(); $bad.secret_ref = 'ghp_abcdefghijklmnop'
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('secret_ref berisi token harus ditolak') }
    $bad = $entry.PSObject.Copy(); $bad.zona_diizinkan = 'case'
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('zona case harus ditolak untuk MVP') }
    $bad = $entry.PSObject.Copy(); $bad.audit_hook = $false
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('audit_hook false harus ditolak') }
    $bad = $entry.PSObject.Copy(); $bad.timeout = 0
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('timeout 0 harus ditolak') }
    $bad = $entry.PSObject.Copy(); $bad.review = [pscustomobject]@{ reviewer = 'x'; date = '23-11-2026'; result = 'pass' }
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('tanggal review salah format harus ditolak') }
    $bad = $entry.PSObject.Copy(); $bad.retry = [pscustomobject]@{ maxAttempts = 99; retryDelaySeconds = 0 }
    if ((Test-ConnectorEntry $bad).Count -eq 0) { $failures.Add('retry berlebih harus ditolak') }

    $entry.status = 'revoked'; $entry.enabled = $false
    if ((Get-ConnectorDecision $lookup 'jdih').decision -cne 'deny') { $failures.Add('entri revoked harus deny') }

    # Persistensi: simpan lalu muat ulang harus mempertahankan keputusan.
    $lookup['jdih'].status = 'validated'; $lookup['jdih'].enabled = $true
    $lookup['jdih'].review = [pscustomobject]@{ reviewer = 'owner'; date = '2026-11-23'; result = 'pass' }
    Save-Registry $temp $lookup
    $reloaded = ConvertTo-ConnectorLookup (Read-Registry $temp)
    if (-not $reloaded.ContainsKey('jdih')) { $failures.Add('registry tidak mempertahankan entri') }
    if ((Get-ConnectorDecision $reloaded 'jdih').decision -cne 'allow') { $failures.Add('entri validated harus bertahan setelah simpan/muat') }
    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Connector registry self-check passed: gate validated, draft, disabled, revoked, dan penolakan entri berbahaya.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Registry)) { $Registry = Join-Path $PSScriptRoot '.hyper-hub\connectors.json' }

if ($List) {
  $lookup = ConvertTo-ConnectorLookup (Read-Registry $Registry)
  $rows = @($lookup.Keys | Sort-Object | ForEach-Object {
      $decision = Get-ConnectorDecision $lookup $_
      [pscustomobject]@{ id = $_; type = [string]$lookup[$_].type; status = [string]$lookup[$_].status; enabled = [bool]$lookup[$_].enabled; decision = $decision.decision; reason = $decision.reason }
    })
  [pscustomobject]@{ registry = $Registry; count = $rows.Count; connectors = $rows; executable = $false } | ConvertTo-Json -Depth 5
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Id)) {
  [Console]::Error.WriteLine('Pemakaian: -Id <id> -Type <t> -Egress <allowlist> -SecretRef <nama> [-Validate -Reviewer <nama>] [-Revoke] [-List] [-SelfCheck]')
  exit 1
}

try {
  Invoke-Register $Registry
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  [Console]::Error.WriteLine($_.ScriptStackTrace)
  exit 1
}
