[CmdletBinding()]
param(
  [string]$Spec,
  [switch]$SelfCheck
)

# G-01: validasi sidecar browser (Playwright MCP) sebelum diizinkan berjalan.
# Syarat: versi dipin, profil terisolasi di luar zona case, telemetry mati,
# tanpa akses file kasus, dan origin mengikuti allowlist G-02 (bukan wildcard).

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-BrowserIssues($Config) {
  $issues = @()
  if ($null -eq $Config) { return @('spesifikasi kosong') }
  foreach ($field in @('name', 'version', 'profileDir', 'originPolicy', 'telemetry', 'downloadsDir', 'caseZoneAccess')) {
    if ($null -eq $Config.PSObject.Properties[$field]) { $issues += "field wajib hilang: $field" }
  }
  if ($issues.Count -gt 0) { return @($issues) }

  if ([string]$Config.name -notin @('playwright', 'playwright-mcp')) { $issues += "sidecar harus playwright/playwright-mcp, bukan $($Config.name)" }
  # Versi dipin: x.y.z tanpa ^ ~ * atau latest.
  if ([string]$Config.version -notmatch '^\d+\.\d+\.\d+$') { $issues += "versi harus dipin x.y.z, bukan $($Config.version)" }
  if ($Config.telemetry -ne $false) { $issues += 'telemetry harus false' }
  if ($Config.caseZoneAccess -ne $false) { $issues += 'caseZoneAccess harus false' }
  foreach ($field in @('profileDir', 'downloadsDir')) {
    $value = [string]$Config.$field
    if ([string]::IsNullOrWhiteSpace($value)) { $issues += "$field wajib" ; continue }
    if ($value -match '(?i)(case|kasus)') { $issues += "$field tidak boleh menunjuk zona kasus" }
    if ($value -match '(?i)(onedrive|dropbox|drive)') { $issues += "$field tidak boleh di folder tersinkron cloud" }
  }
  if ([string]$Config.originPolicy -eq '' -or [string]$Config.originPolicy -match '(?i)wildcard|\*') { $issues += 'originPolicy harus merujuk allowlist G-02 tanpa wildcard' }
  if (-not [IO.File]::Exists([string]$Config.originPolicy)) { $issues += "originPolicy tidak ditemukan: $($Config.originPolicy)" }
  if ($null -ne $Config.PSObject.Properties['downloads']) {
    foreach ($entry in @($Config.downloads)) {
      if ([string]$entry.host -notmatch '^([a-z0-9-]+\.)+[a-z]{2,}$') { $issues += "host download tidak sah: $($entry.host)" }
      if ([string]$entry.host -match '^\d{1,3}(\.\d{1,3}){3}$') { $issues += "host download tidak boleh IP literal: $($entry.host)" }
      if ([string]$entry.maxBytes -notmatch '^\d+$' -or [long]$entry.maxBytes -le 0) { $issues += "maxBytes download tidak sah: $($entry.host)" }
    }
  } else { $issues += 'daftar downloads wajib (batas per host)' }
  return @($issues)
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('browser-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $policy = Join-Path $temp 'browser-origin-policy.json'
    [IO.File]::WriteAllText($policy, '{"block":[],"regular":{"allow":[{"origin":"https://jdih.kemenkeu.go.id","alasan":"resmi","pemilik":"owner"}]},"case":{"allow":[]}}', $utf8)
    $good = [pscustomobject]@{
      name = 'playwright-mcp'; version = '1.49.1'; profileDir = (Join-Path $temp 'profile-isolated')
      originPolicy = $policy; telemetry = $false; downloadsDir = (Join-Path $temp 'downloads'); caseZoneAccess = $false
      downloads = @([pscustomobject]@{ host = 'jdih.kemenkeu.go.id'; maxBytes = 26214400 })
    }
    if ((Get-BrowserIssues $good).Count -ne 0) { $failures.Add("konfigurasi sah ditolak: $((Get-BrowserIssues $good) -join '; ')") }

    $bad = $good.PSObject.Copy(); $bad.version = 'latest'
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('versi latest harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.version = '^1.49.1'
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('versi caret harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.telemetry = $true
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('telemetry on harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.caseZoneAccess = $true
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('akses zona kasus harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.profileDir = 'C:\Users\x\Documents\kasus\profile'
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('profil di zona kasus harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.downloadsDir = 'C:\Users\x\OneDrive\downloads'
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('downloads di folder cloud harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.originPolicy = 'https://*'
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('origin wildcard harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.downloads = @([pscustomobject]@{ host = '127.0.0.1'; maxBytes = 1000 })
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('host download IP literal harus ditolak') }
    $bad = $good.PSObject.Copy(); $bad.originPolicy = (Join-Path $temp 'tidak-ada.json')
    if ((Get-BrowserIssues $bad).Count -eq 0) { $failures.Add('origin policy hilang harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Browser sidecar self-check passed: versi dipin, profil terisolasi, telemetry mati, tanpa zona kasus, batas download.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Spec)) { [Console]::Error.WriteLine('Pemakaian: -Spec <browser.json> | -SelfCheck'); exit 1 }
$config = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Spec, $utf8))
$issues = Get-BrowserIssues $config
[pscustomobject]@{ spec = $Spec; valid = (@($issues).Count -eq 0); issues = @($issues); executable = $false } | ConvertTo-Json -Depth 4
if (@($issues).Count -gt 0) { exit 2 }
exit 0
