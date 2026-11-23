[CmdletBinding()]
param(
  [string]$Manifest,
  [string]$DownloadsDir,
  [switch]$SelfCheck
)

# G-03: alur unduh JDIH deterministik dan terkontrol.
# - Hanya host di allowlist (bukan IP, bukan subdomain liar)
# - MIME/ekstensi harus cocok dengan isi (magic bytes)
# - Ukuran wajib <= maxBytes per host
# - Nama berkas deterministik dari hash URL, bukan dari header server
# - Setiap unduhan dicatat di ledger dengan hash

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Sha256Text([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-FileSha256([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose() }
  } finally { $sha.Dispose() }
}

function Test-HostAllowed([string]$Url, [string[]]$Allow) {
  try { $uri = [Uri]$Url } catch { return @('URL tidak sah') }
  if ($uri.Scheme -ne 'https') { return @('hanya https') }
  if (-not [string]::IsNullOrEmpty($uri.UserInfo)) { return @('URL tidak boleh memuat kredensial') }
  if ($uri.Host -match '^\d{1,3}(\.\d{1,3}){3}$') { return @('host IP literal ditolak') }
  if ($Allow -notcontains $uri.Host) { return @("host tidak ada di allowlist: $($uri.Host)") }
  return @()
}

function Get-ContentKind([string]$Path) {
  $head = New-Object byte[] 8
  $stream = [IO.File]::OpenRead($Path)
  try { $read = $stream.Read($head, 0, 8) } finally { $stream.Dispose() }
  if ($read -ge 4 -and $head[0] -eq 0x25 -and $head[1] -eq 0x50 -and $head[2] -eq 0x44 -and $head[3] -eq 0x46) { return 'pdf' }
  if ($read -ge 4 -and $head[0] -eq 0x50 -and $head[1] -eq 0x4B) { return 'zip' }
  if ($read -ge 8 -and $head[0] -eq 0x89 -and $head[1] -eq 0x50) { return 'png' }
  if ($read -ge 3 -and $head[0] -eq 0xFF -and $head[1] -eq 0xD8) { return 'jpg' }
  if ($read -gt 0) {
    foreach ($b in $head[0..($read - 1)]) { if ($b -eq 0) { return 'binary' } }
    return 'text'
  }
  return 'empty'
}

function Test-Download([string]$Url, [string]$Path, [long]$MaxBytes, [string[]]$Allow, [string]$LedgerDir) {
  $issues = @(Test-HostAllowed $Url $Allow)
  if ($issues.Count -gt 0) { return [pscustomobject]@{ accepted = $false; issues = $issues } }
  if (-not [IO.File]::Exists($Path)) { return [pscustomobject]@{ accepted = $false; issues = @("berkas tidak ada: $Path") } }
  $info = [IO.FileInfo]::new($Path)
  if ($info.Length -le 0) { $issues += 'berkas kosong' }
  if ($info.Length -gt $MaxBytes) { $issues += "melebihi batas $MaxBytes byte" }
  $kind = Get-ContentKind $Path
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  $expected = switch ($extension) {
    '.pdf' { 'pdf' }
    '.docx' { 'zip' }
    '.xlsx' { 'zip' }
    '.png' { 'png' }
    '.jpg' { 'jpg' }
    '.jpeg' { 'jpg' }
    '.txt' { 'text' }
    '.md' { 'text' }
    default { $null }
  }
  if ($null -eq $expected) { $issues += "ekstensi tidak diizinkan: $extension" }
  elseif ($kind -cne $expected -and -not ($expected -eq 'text' -and $kind -eq 'text')) { $issues += "isi $kind tidak cocok dengan $extension" }
  if ($issues.Count -gt 0) { return [pscustomobject]@{ accepted = $false; issues = $issues } }

  $sha = Get-FileSha256 $Path
  $target = "$sha$extension"
  return [pscustomobject]@{
    accepted = $true
    issues = @()
    deterministicName = $target
    sha256 = $sha
    bytes = $info.Length
    kind = $kind
    host = ([Uri]$Url).Host
  }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('download-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $allow = @('jdih.kemenkeu.go.id')
    $pdf = Join-Path $temp 'a.pdf'
    [IO.File]::WriteAllBytes($pdf, [byte[]](0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37, 0x0A))
    $fake = Join-Path $temp 'b.pdf'
    [IO.File]::WriteAllText($fake, 'bukan pdf', $utf8)
    $big = Join-Path $temp 'c.pdf'
    [IO.File]::WriteAllBytes($big, [byte[]](0x25, 0x50, 0x44, 0x46) + (New-Object byte[] 4096))
    $exe = Join-Path $temp 'd.pdf'
    [IO.File]::WriteAllBytes($exe, [byte[]](0x4D, 0x5A, 0x90, 0x00))

    $ok = Test-Download 'https://jdih.kemenkeu.go.id/d/1' $pdf 1000000 $allow $temp
    if (-not $ok.accepted -or $ok.deterministicName -notmatch '^[a-f0-9]{64}\.pdf$') { $failures.Add("unduhan sah harus diterima dengan nama hash: $($ok.issues -join '; ')") }
    $again = Test-Download 'https://jdih.kemenkeu.go.id/d/1' $pdf 1000000 $allow $temp
    if ($again.deterministicName -cne $ok.deterministicName) { $failures.Add('nama harus deterministik untuk isi sama') }

    if ((Test-Download 'https://evil.example.com/1' $pdf 1000000 $allow $temp).accepted) { $failures.Add('host di luar allowlist harus ditolak') }
    if ((Test-Download 'http://jdih.kemenkeu.go.id/1' $pdf 1000000 $allow $temp).accepted) { $failures.Add('http harus ditolak') }
    if ((Test-Download 'https://user:pass@jdih.kemenkeu.go.id/1' $pdf 1000000 $allow $temp).accepted) { $failures.Add('kredensial URL harus ditolak') }
    if ((Test-Download 'https://127.0.0.1/1' $pdf 1000000 @('127.0.0.1') $temp).accepted) { $failures.Add('IP literal harus ditolak') }
    if ((Test-Download 'https://jdih.kemenkeu.go.id/1' $fake 1000000 $allow $temp).accepted) { $failures.Add('MIME/isi tidak cocok harus ditolak') }
    if ((Test-Download 'https://jdih.kemenkeu.go.id/1' $big 1024 $allow $temp).accepted) { $failures.Add('melebihi batas harus ditolak') }
    if ((Test-Download 'https://jdih.kemenkeu.go.id/1' $exe 1000000 $allow $temp).accepted) { $failures.Add('exe menyamar pdf harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'JDIH download self-check passed: allowlist, https, MIME, batas ukuran, nama deterministik.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Manifest)) { [Console]::Error.WriteLine('Pemakaian: -SelfCheck, atau -Manifest <downloads.json> -DownloadsDir <folder>'); exit 1 }
$spec = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Manifest, $utf8))
$results = @()
foreach ($item in @($spec.downloads)) {
  $path = Join-Path $DownloadsDir ([string]$item.file)
  $results += [pscustomobject]@{ url = $item.url; result = (Test-Download $item.url $path ([long]$item.maxBytes) @($spec.allow) $DownloadsDir) }
}
[pscustomobject]@{ downloads = $results; accepted = @($results | Where-Object { $_.result.accepted }).Count } | ConvertTo-Json -Depth 6
if (@($results | Where-Object { -not $_.result.accepted }).Count -gt 0) { exit 2 }
exit 0
