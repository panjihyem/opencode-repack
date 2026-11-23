[CmdletBinding()]
param(
  [string]$Artifact,
  [string]$ManifestPath,
  [string]$PublicKey,
  [string]$PrivateKey,
  [switch]$WriteManifest,
  [switch]$Verify,
  [string]$PreviousArtifact,
  [switch]$Rollback,
  [switch]$SelfCheck
)

# M-07: proses rilis: manifest hash, tanda tangan RSA-SHA256, verifikasi, dan rollback.
# Tanda tangan dibuat/diverifikasi di sisi ini agar bisa diuji offline; kunci privat
# tidak pernah ditulis ke repo dan hanya dipakai bila diberikan eksplisit.

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

function New-SignedManifest([string]$Path, [string]$Key) {
  if ([string]::IsNullOrWhiteSpace($Key)) { throw 'Kunci privat wajib untuk menandatangani.' }
  $sha = Get-Sha256 $Path
  $payload = [pscustomobject]@{
    artifact = [IO.Path]::GetFileName($Path)
    sha256 = $sha
    size = ([IO.FileInfo]::new($Path)).Length
    signedAtUtc = [DateTime]::UtcNow.ToString('o')
  }
  $canonical = ConvertTo-Json -InputObject $payload -Compress -Depth 3
  $signature = [Convert]::ToBase64String((Sign-Bytes $utf8.GetBytes($canonical) $Key))
  $payload | Add-Member -NotePropertyName signature -NotePropertyValue $signature
  $payload | Add-Member -NotePropertyName algorithm -NotePropertyValue 'rsa-sha256'
  return $payload
}

function Get-Rsa([string]$Key) {
  # Format kunci: base64 XML RSAParameters, agar bisa disimpan di luar repo.
  $rsa = New-Object Security.Cryptography.RSACryptoServiceProvider 2048
  $rsa.PersistKeyInCsp = $false
  $rsa.FromXmlString($utf8.GetString([Convert]::FromBase64String($Key)))
  return $rsa
}

function Sign-Bytes([byte[]]$Bytes, [string]$Key) {
  $rsa = Get-Rsa $Key
  try { return $rsa.SignData($Bytes, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1) }
  finally { $rsa.Dispose() }
}

function Verify-Bytes([byte[]]$Bytes, [byte[]]$Signature, [string]$Key) {
  $rsa = Get-Rsa $Key
  try { return $rsa.VerifyData($Bytes, $Signature, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1) }
  finally { $rsa.Dispose() }
}

function New-RsaKeyPair {
  $rsa = New-Object Security.Cryptography.RSACryptoServiceProvider 2048
  try {
    $private = [Convert]::ToBase64String($utf8.GetBytes($rsa.ToXmlString($true)))
    $public = [Convert]::ToBase64String($utf8.GetBytes($rsa.ToXmlString($false)))
    return [pscustomobject]@{ private = $private; public = $public }
  } finally { $rsa.Dispose() }
}

function Test-SigningAvailable {
  try { New-Object Security.Cryptography.RSACryptoServiceProvider 2048 | Out-Null; return $true } catch { return $false }
}

function Test-Manifest([string]$Path, $Manifest, [string]$Key) {
  $issues = @()
  if ($null -eq $Manifest) { return @('manifest kosong') }
  foreach ($field in @('artifact', 'sha256', 'size', 'signature')) {
    if ($null -eq $Manifest.PSObject.Properties[$field]) { $issues += "field manifest hilang: $field" }
  }
  if ($issues.Count -gt 0) { return @($issues) }
  if ([string]$Manifest.sha256 -notmatch '^[a-f0-9]{64}$') { $issues += 'format sha256 tidak sah' }
  $actual = Get-Sha256 $Path
  if ($actual -cne [string]$Manifest.sha256) { $issues += 'hash artifact tidak cocok dengan manifest' }
  if (([IO.FileInfo]::new($Path)).Length -ne [long]$Manifest.size) { $issues += 'ukuran artifact tidak cocok' }
  if ([IO.Path]::GetFileName($Path) -cne [string]$Manifest.artifact) { $issues += 'nama artifact tidak cocok' }
  if (-not [string]::IsNullOrWhiteSpace($Key)) {
    $payload = [pscustomobject]@{
      artifact = [string]$Manifest.artifact
      sha256 = [string]$Manifest.sha256
      size = [long]$Manifest.size
      signedAtUtc = [string]$Manifest.signedAtUtc
    }
    $canonical = ConvertTo-Json -InputObject $payload -Compress -Depth 3
    $ok = $false
    try { $ok = Verify-Bytes $utf8.GetBytes($canonical) ([Convert]::FromBase64String([string]$Manifest.signature)) $Key } catch { $issues += "verifikasi kunci gagal: $($_.Exception.Message)" }
    if (-not $ok -and -not ($issues | Where-Object { $_ -match 'verifikasi kunci' })) { $issues += 'tanda tangan tidak valid' }
  } else {
    $issues += 'kunci publik tidak diberikan; integritas hash saja'
  }
  return @($issues)
}

function Test-Ed25519Available {
  try { [Security.Cryptography.Ed25519]::new() | Out-Null; return $true } catch { return $false }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('release-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $artifact = Join-Path $temp 'Hyper-AI-2.1.10.exe'
    [IO.File]::WriteAllBytes($artifact, [byte[]](1..64))
    $other = Join-Path $temp 'Hyper-AI-2.1.9.exe'
    [IO.File]::WriteAllBytes($other, [byte[]](1..32))

    # Hash detection selalu bisa diuji; tanda tangan memakai RSA-SHA256 yang tersedia di PS 5.1.
    if ((Get-Sha256 $artifact) -notmatch '^[a-f0-9]{64}$') { $failures.Add('sha256 harus 64 hex') }
    if ((Get-Sha256 $artifact) -ceq (Get-Sha256 $other)) { $failures.Add('artifact berbeda harus beda hash') }

    $manifest = [pscustomobject]@{ artifact = 'Hyper-AI-2.1.10.exe'; sha256 = (Get-Sha256 $artifact); size = ([IO.FileInfo]::new($artifact)).Length; signedAtUtc = '2026-11-23T00:00:00Z'; signature = ''; algorithm = 'none' }
    $issuesNoKey = @(Test-Manifest $artifact $manifest '')
    if (@($issuesNoKey | Where-Object { $_ -match 'kunci publik' }).Count -ne 1) { $failures.Add('tanpa kunci publik harus dilaporkan') }
    if (@($issuesNoKey | Where-Object { $_ -match '^hash|^ukuran|^nama' }).Count -ne 0) { $failures.Add('hash/ukuran/nama yang benar tidak boleh gagal') }

    $manifest.sha256 = ('0' * 64)
    if (@(@(Test-Manifest $artifact $manifest '') | Where-Object { $_ -match '^hash' }).Count -ne 1) { $failures.Add('hash salah harus terdeteksi') }
    $manifest.sha256 = (Get-Sha256 $artifact)
    $manifest.size = 999
    if (@(@(Test-Manifest $artifact $manifest '') | Where-Object { $_ -match '^ukuran' }).Count -ne 1) { $failures.Add('ukuran salah harus terdeteksi') }
    $manifest.size = ([IO.FileInfo]::new($artifact)).Length
    $manifest.artifact = 'lain.exe'
    if (@(@(Test-Manifest $artifact $manifest '') | Where-Object { $_ -match '^nama' }).Count -ne 1) { $failures.Add('nama salah harus terdeteksi') }
    $manifest.artifact = 'Hyper-AI-2.1.10.exe'

    if (Test-SigningAvailable) {
      $keys = New-RsaKeyPair
      $private = $keys.private
      $public = $keys.public
      $signed = New-SignedManifest $artifact $private
      $signedIssues = @(Test-Manifest $artifact $signed $public)
      if ($signedIssues.Count -ne 0) { $failures.Add("manifest bertanda tangan harus valid: $($signedIssues -join '; ')") }
      $tampered = $signed.PSObject.Copy()
      $tampered.sha256 = ('1' * 64)
      if (@(@(Test-Manifest $artifact $tampered $public) | Where-Object { $_ -match 'hash|tanda tangan' }).Count -eq 0) { $failures.Add('manifest diubah harus ditolak') }
      $foreign = (New-RsaKeyPair).public
      if (@(@(Test-Manifest $artifact $signed $foreign) | Where-Object { $_ -match 'tanda tangan' }).Count -eq 0) { $failures.Add('kunci publik lain harus menolak tanda tangan') }
    } else {
      $failures.Add('RSA tidak tersedia di runtime ini')
    }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Release self-check passed: hash, ukuran, nama, dan tanda tangan/penolakan manifest diubah.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($Rollback) {
  if ([string]::IsNullOrWhiteSpace($Artifact) -or [string]::IsNullOrWhiteSpace($PreviousArtifact)) { [Console]::Error.WriteLine('Rollback butuh -Artifact dan -PreviousArtifact.'); exit 1 }
  $currentHash = Get-Sha256 $Artifact
  $previousHash = Get-Sha256 $PreviousArtifact
  Copy-Item -LiteralPath $PreviousArtifact -Destination $Artifact -Force
  $restored = Get-Sha256 $Artifact
  [pscustomobject]@{ rollback = $true; from = $previousHash; was = $currentHash; now = $restored; verified = ($restored -ceq $previousHash) } | ConvertTo-Json -Depth 3
  if ($restored -cne $previousHash) { exit 2 }
  exit 0
}

if ($WriteManifest) {
  if ([string]::IsNullOrWhiteSpace($Artifact) -or [string]::IsNullOrWhiteSpace($ManifestPath)) { [Console]::Error.WriteLine('Butuh -Artifact dan -ManifestPath.'); exit 1 }
  $manifest = if ([string]::IsNullOrWhiteSpace($PrivateKey)) { [pscustomobject]@{ artifact = [IO.Path]::GetFileName($Artifact); sha256 = (Get-Sha256 $Artifact); size = ([IO.FileInfo]::new($Artifact)).Length; signedAtUtc = [DateTime]::UtcNow.ToString('o'); signature = ''; algorithm = 'none' } } else { New-SignedManifest $Artifact $PrivateKey }
  [IO.File]::WriteAllText($ManifestPath, (ConvertTo-Json -InputObject $manifest -Depth 4), $utf8)
  [pscustomobject]$manifest | ConvertTo-Json -Depth 4
  exit 0
}

if ($Verify) {
  if ([string]::IsNullOrWhiteSpace($Artifact) -or [string]::IsNullOrWhiteSpace($ManifestPath)) { [Console]::Error.WriteLine('Butuh -Artifact dan -ManifestPath.'); exit 1 }
  $manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($ManifestPath, $utf8))
  $issues = Test-Manifest $Artifact $manifest $PublicKey
  [pscustomobject]@{ artifact = $Artifact; valid = (@($issues | Where-Object { $_ -notmatch 'kunci publik' }).Count -eq 0); issues = $issues } | ConvertTo-Json -Depth 4
  if (@($issues | Where-Object { $_ -notmatch 'kunci publik' }).Count -gt 0) { exit 2 }
  exit 0
}

[Console]::Error.WriteLine('Pemakaian: -Artifact <file> -ManifestPath <json> [-WriteManifest [-PrivateKey b64]] | -Verify [-PublicKey b64] | -Rollback -PreviousArtifact <file> | -SelfCheck')
exit 1
