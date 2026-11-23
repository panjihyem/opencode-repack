[CmdletBinding()]
param(
  [string]$Root = '.',
  [string]$OutDir = 'hub/sbom',
  [switch]$SelfCheck
)

# M-05: SBOM + skrining lisensi dari workspace (package.json) tanpa jaringan.
# Kebijakan: lisensi AGPL/SSPL/GPL-3.0 yang di-link harus disetujui eksplisit;
# dependency tanpa lisensi dicatat sebagai risiko. Output deterministik agar bisa
# dibandingkan antar commit.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Daftar izin: lisensi permisif umum. Bukan nasihat hukum.
$script:Allowed = @('MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'Python-2.0', 'BlueOak-1.0.0', 'MPL-2.0', 'Zlib', 'CC-BY-4.0')
$script:Review = @('LGPL-2.1', 'LGPL-3.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'SSPL-1.0', 'CPAL-1.0', 'EPL-2.0', 'EUPL-1.2', 'BSL-1.0', 'OFL-1.1')

function Get-LicenseClass([string]$Expression) {
  if ([string]::IsNullOrWhiteSpace($Expression)) { return 'unknown' }
  $normalized = ($Expression -replace '[()]', ' ' -replace '\s+(AND|OR|WITH)\s+', ' ').Trim()
  $parts = @($normalized -split '\s+' | Where-Object { $_ })
  if ($parts.Count -eq 0) { return 'unknown' }
  $classes = @()
  foreach ($part in $parts) {
    if ($script:Allowed -contains $part) { $classes += 'allowed'; continue }
    if ($script:Review -contains $part) { $classes += 'review'; continue }
    if ($part -match '^(MIT|ISC|Apache|BSD|CC0|Unlicense|MPL|Zlib)') { $classes += 'allowed'; continue }
    if ($part -match '(A?GPL|SSPL|EPL|EUPL|CPAL|OFL)') { $classes += 'review'; continue }
    $classes += 'unknown'
  }
  if ($classes -contains 'review') { return 'review' }
  if ($classes -contains 'unknown') { return 'unknown' }
  return 'allowed'
}

function Get-PackageClass($Package) {
  # Paket privat milik repo ini (@opencode/* atau private:true) bukan dependency pihak
  # ketiga; tidak punya field license bukan temuan lisensi.
  $license = [string]$Package.license
  if ([string]::IsNullOrWhiteSpace($license) -and ([string]$Package.name -match '^@opencode/' -or [string]$Package.kind -ceq 'True')) { return 'internal' }
  return (Get-LicenseClass $license)
}

function Get-RelativePath([string]$Base, [string]$Full) {
  $baseFull = [IO.Path]::GetFullPath($Base).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $fullPath = [IO.Path]::GetFullPath($Full)
  if ($fullPath.StartsWith($baseFull, [StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath.Substring($baseFull.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
  }
  return $fullPath
}

function Get-WorkspacePackages([string]$RootPath) {
  $packages = @()
  $rootJson = Join-Path $RootPath 'package.json'
  if ([IO.File]::Exists($rootJson)) {
    $doc = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($rootJson, $utf8))
    $packages += [pscustomobject]@{ name = [string]$doc.name; version = [string]$doc.version; license = [string]$doc.license; kind = 'workspace-root'; path = 'package.json' }
  }
  foreach ($dir in @('packages', 'services', 'github', 'rebrand', 'hub')) {
    $base = Join-Path $RootPath $dir
    if (-not [IO.Directory]::Exists($base)) { continue }
    foreach ($file in @([IO.Directory]::GetFiles($base, 'package.json', [IO.SearchOption]::AllDirectories))) {
      if ($file -match '[\\/]node_modules[\\/]') { continue }
      try { $doc = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($file, $utf8)) } catch { continue }
      if ([string]::IsNullOrWhiteSpace([string]$doc.name)) { continue }
      $relative = (Get-RelativePath $RootPath $file) -replace '\\', '/'
      $packages += [pscustomobject]@{ name = [string]$doc.name; version = [string]$doc.version; license = [string]$doc.license; kind = [string]$doc.private; path = $relative }
    }
  }
  return @($packages | Sort-Object path)
}

function Invoke-Sbom([string]$RootPath, [string]$OutputDir) {
  $rootFull = [IO.Path]::GetFullPath($RootPath)
  $packages = Get-WorkspacePackages $rootFull
  $rows = @($packages | ForEach-Object {
      [pscustomobject]@{ name = $_.name; version = $_.version; license = $(if ($_.license) { $_.license } else { '' }); class = (Get-PackageClass $_); path = $_.path }
    })
  $summary = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    root = $rootFull
    packageCount = $rows.Count
    allowed = @($rows | Where-Object { $_.class -ceq 'allowed' }).Count
    internal = @($rows | Where-Object { $_.class -ceq 'internal' }).Count
    review = @($rows | Where-Object { $_.class -ceq 'review' }).Count
    unknown = @($rows | Where-Object { $_.class -ceq 'unknown' }).Count
    policy = 'allowed: MIT/ISC/Apache-2.0/BSD/MPL-2.0; internal: paket privat repo; review: (A)GPL/SSPL/EPL/EUPL; unknown: dependency tanpa lisensi'
  }
  return [pscustomobject]@{ summary = $summary; packages = $rows }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('sbom-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory((Join-Path $temp 'packages/a'))
    [void][IO.Directory]::CreateDirectory((Join-Path $temp 'packages/b'))
    [void][IO.Directory]::CreateDirectory((Join-Path $temp 'packages/c'))
    [IO.File]::WriteAllText((Join-Path $temp 'package.json'), '{"name":"root","version":"1.0.0","license":"MIT"}', $utf8)
    [IO.File]::WriteAllText((Join-Path $temp 'packages/a/package.json'), '{"name":"a","version":"1.0.0","license":"Apache-2.0"}', $utf8)
    [IO.File]::WriteAllText((Join-Path $temp 'packages/b/package.json'), '{"name":"b","version":"1.0.0","license":"AGPL-3.0-only"}', $utf8)
    [IO.File]::WriteAllText((Join-Path $temp 'packages/c/package.json'), '{"name":"c","version":"1.0.0"}', $utf8)
    [void][IO.Directory]::CreateDirectory((Join-Path $temp 'packages/d/node_modules/x'))
    [IO.File]::WriteAllText((Join-Path $temp 'packages/d/node_modules/x/package.json'), '{"name":"x","license":"AGPL-3.0"}', $utf8)

    if ((Get-LicenseClass 'MIT') -cne 'allowed') { $failures.Add('MIT harus allowed') }
    if ((Get-LicenseClass '(MIT OR Apache-2.0)') -cne 'allowed') { $failures.Add('OR permisif harus allowed') }
    if ((Get-LicenseClass 'MIT AND AGPL-3.0') -cne 'review') { $failures.Add('campuran AGPL harus review') }
    if ((Get-LicenseClass 'AGPL-3.0-only') -cne 'review') { $failures.Add('AGPL harus review') }
    if ((Get-LicenseClass 'SSPL-1.0') -cne 'review') { $failures.Add('SSPL harus review') }
    if ((Get-LicenseClass '') -cne 'unknown') { $failures.Add('lisensi kosong harus unknown') }
    if ((Get-LicenseClass 'WTFPL-9000') -cne 'unknown') { $failures.Add('lisensi tak dikenal harus unknown') }

    $sbom = Invoke-Sbom $temp (Join-Path $temp 'out')
    if ($sbom.summary.packageCount -ne 4) { $failures.Add("packageCount harus 4 (node_modules diabaikan), dapat $($sbom.summary.packageCount)") }
    if ($sbom.summary.review -ne 1) { $failures.Add('harus ada 1 review') }
    if ($sbom.summary.unknown -ne 1) { $failures.Add('harus ada 1 unknown') }
    if (@($sbom.packages | Where-Object { $_.name -ceq 'x' }).Count -ne 0) { $failures.Add('node_modules harus diabaikan') }

    [IO.File]::WriteAllText((Join-Path $temp 'packages/c/package.json'), '{"name":"@opencode/c","version":"1.0.0","private":true}', $utf8)
    $internal = Invoke-Sbom $temp (Join-Path $temp 'out')
    if (@($internal.packages | Where-Object { $_.name -ceq '@opencode/c' -and $_.class -ceq 'internal' }).Count -ne 1) { $failures.Add('paket privat @opencode tanpa license harus internal, bukan unknown') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'SBOM self-check passed: klasifikasi lisensi, OR/AND, unknown, dan node_modules diabaikan.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

$sbom = Invoke-Sbom $Root $OutDir
$outFull = [IO.Path]::GetFullPath((Join-Path $Root $OutDir))
[void][IO.Directory]::CreateDirectory($outFull)
[IO.File]::WriteAllText((Join-Path $outFull 'sbom.json'), (ConvertTo-Json -InputObject $sbom -Depth 6), $utf8)
[IO.File]::WriteAllText((Join-Path $outFull 'sbom.csv'), ((@('name,version,license,class,path') + @($sbom.packages | ForEach-Object { '"' + $_.name + '","' + $_.version + '","' + $_.license + '","' + $_.class + '","' + $_.path + '"' })) -join "`n") + "`n", $utf8)
[pscustomobject]$sbom.summary | ConvertTo-Json -Depth 4
if ($sbom.summary.review -gt 0) { exit 2 }
exit 0
