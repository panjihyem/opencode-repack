[CmdletBinding()]
param(
  [string]$Source,
  [string]$Producer,
  [string]$Extraction,
  [switch]$SelfCheck
)

# G-04: provenance naskah resmi (Docling) tanpa memanggil Docling.
# Kontrak: setiap artefak menyimpan URL resmi, tanggal ambil, hash naskah sumber,
# hash hasil ekstraksi, versi alat, dan status "bukan pengganti naskah".

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Sha256([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Berkas tidak ada: $Path" }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose() }
  } finally { $sha.Dispose() }
}

function Test-OfficialSource([string]$Url) {
  try { $uri = [Uri]$Url } catch { return $false }
  return ($uri.Scheme -eq 'https' -and [string]::IsNullOrEmpty($uri.UserInfo) -and $uri.Host -match '(^|\.)go\.id$')
}

function New-Provenance([string]$SourceUrl, [string]$SourcePath, [string]$ExtractedPath, [string]$ToolVersion, [string]$RetrievedAtUtc) {
  $issues = @()
  if (-not (Test-OfficialSource $SourceUrl)) { $issues += 'sumber harus https host *.go.id tanpa kredensial' }
  if (-not [IO.File]::Exists($SourcePath)) { $issues += "naskah sumber tidak ada: $SourcePath" }
  if (-not [IO.File]::Exists($ExtractedPath)) { $issues += "hasil ekstraksi tidak ada: $ExtractedPath" }
  if ([string]::IsNullOrWhiteSpace($ToolVersion)) { $issues += 'versi alat wajib' }
  $date = [DateTime]::MinValue
  if (-not [DateTime]::TryParse($RetrievedAtUtc, [ref]$date)) { $issues += 'tanggal ambil tidak sah' }
  if ($issues.Count -gt 0) { return [pscustomobject]@{ valid = $false; issues = @($issues) } }

  return [pscustomobject]@{
    valid = $true
    issues = @()
    provenance = [pscustomobject]@{
      sumberUrl = $SourceUrl
      sumberSha256 = (Get-Sha256 $SourcePath)
      ekstraksiSha256 = (Get-Sha256 $ExtractedPath)
      alat = 'docling'
      alatVersi = $ToolVersion
      diambilPadaUtc = $date.ToUniversalTime().ToString('o')
      naskahResmi = 'bukan pengganti naskah resmi; verifikasi ke sumber'
    }
  }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('docling-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $pdf = Join-Path $temp 'naskah.pdf'
    [IO.File]::WriteAllBytes($pdf, [byte[]](0x25, 0x50, 0x44, 0x46, 0x2D, 0x31))
    $md = Join-Path $temp 'naskah.md'
    [IO.File]::WriteAllText($md, "# Naskah`nIsi.", $utf8)

    $ok = New-Provenance 'https://jdih.kemenkeu.go.id/dokumen/1' $pdf $md '2.31.0' '2026-11-23T00:00:00Z'
    if (-not $ok.valid) { $failures.Add("provenance sah ditolak: $($ok.issues -join '; ')") }
    if ($ok.provenance.sumberSha256 -notmatch '^[a-f0-9]{64}$') { $failures.Add('hash sumber harus sha256') }
    if ($ok.provenance.ekstraksiSha256 -ceq $ok.provenance.sumberSha256) { $failures.Add('hash sumber dan ekstraksi harus berbeda') }
    if ($ok.provenance.naskahResmi -notmatch 'bukan pengganti') { $failures.Add('harus menyatakan bukan pengganti naskah') }

    $bad = New-Provenance 'http://jdih.kemenkeu.go.id/x' $pdf $md '2.31.0' '2026-11-23T00:00:00Z'
    if ($bad.valid) { $failures.Add('http harus ditolak') }
    $bad = New-Provenance 'https://evil.example.com/x' $pdf $md '2.31.0' '2026-11-23T00:00:00Z'
    if ($bad.valid) { $failures.Add('host non go.id harus ditolak') }
    $bad = New-Provenance 'https://user:pass@jdih.kemenkeu.go.id/x' $pdf $md '2.31.0' '2026-11-23T00:00:00Z'
    if ($bad.valid) { $failures.Add('URL berkredensial harus ditolak') }
    $bad = New-Provenance 'https://jdih.kemenkeu.go.id/x' (Join-Path $temp 'tidak-ada.pdf') $md '2.31.0' '2026-11-23T00:00:00Z'
    if ($bad.valid) { $failures.Add('naskah hilang harus ditolak') }
    $bad = New-Provenance 'https://jdih.kemenkeu.go.id/x' $pdf $md '' '2026-11-23T00:00:00Z'
    if ($bad.valid) { $failures.Add('versi alat kosong harus ditolak') }
    $bad = New-Provenance 'https://jdih.kemenkeu.go.id/x' $pdf $md '2.31.0' 'kemarin'
    if ($bad.valid) { $failures.Add('tanggal tidak sah harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Docling provenance self-check passed: sumber resmi, hash ganda, versi alat, tanggal, disclaimer.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($PSBoundParameters.ContainsKey('Source') -and -not [string]::IsNullOrWhiteSpace($Extraction)) {
  New-Provenance $Source $Source $Extraction $Producer '2026-11-23T00:00:00Z' | ConvertTo-Json -Depth 5
  exit 0
}
[Console]::Error.WriteLine('Pemakaian: -SelfCheck, atau -Source <url> -Extraction <md> -Producer <versi alat>')
exit 1
