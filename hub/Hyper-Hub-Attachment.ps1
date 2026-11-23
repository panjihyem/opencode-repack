[CmdletBinding()]
param(
  [string]$Path,
  [string]$Root,
  [string]$Quarantine,
  [int]$MaxBytes = 26214400,
  [switch]$Route,
  [switch]$SelfCheck
)

# Gate lampiran/ingest: whitelist ekstensi, batas ukuran, kesesuaian magic bytes, tolak
# symlink/keluar root sebelum file dibaca. Keputusan: accept | quarantine | reject.
# ponytail: deteksi tipe dari magic bytes, bukan parser penuh; antivirus (F-06) belum ada,
# jadi 'accept' berarti lobos gate ini saja, bukan file terbukti bersih.

$ErrorActionPreference = 'Stop'

$script:ExtensionKinds = @{
  '.md' = 'text'; '.txt' = 'text'; '.csv' = 'text'; '.json' = 'text'; '.html' = 'text'
  '.pdf' = 'pdf'
  '.docx' = 'zip'; '.xlsx' = 'zip'; '.pptx' = 'zip'
  '.png' = 'png'; '.jpg' = 'jpg'; '.jpeg' = 'jpg'; '.gif' = 'gif'; '.webp' = 'webp'
}

function Get-DetectedKind([byte[]]$Head) {
  if ($Head.Length -ge 4 -and $Head[0] -eq 0x25 -and $Head[1] -eq 0x50 -and $Head[2] -eq 0x44 -and $Head[3] -eq 0x46) { return 'pdf' }
  if ($Head.Length -ge 4 -and $Head[0] -eq 0x50 -and $Head[1] -eq 0x4B -and ($Head[2] -eq 3 -or $Head[2] -eq 5) -and ($Head[3] -eq 4 -or $Head[3] -eq 6)) { return 'zip' }
  if ($Head.Length -ge 8 -and $Head[0] -eq 0x89 -and $Head[1] -eq 0x50 -and $Head[2] -eq 0x4E -and $Head[3] -eq 0x47) { return 'png' }
  if ($Head.Length -ge 3 -and $Head[0] -eq 0xFF -and $Head[1] -eq 0xD8 -and $Head[2] -eq 0xFF) { return 'jpg' }
  if ($Head.Length -ge 6 -and $Head[0] -eq 0x47 -and $Head[1] -eq 0x49 -and $Head[2] -eq 0x46) { return 'gif' }
  if ($Head.Length -ge 12 -and $Head[0] -eq 0x52 -and $Head[1] -eq 0x49 -and $Head[2] -eq 0x46 -and $Head[3] -eq 0x46 -and $Head[8] -eq 0x57 -and $Head[9] -eq 0x45 -and $Head[10] -eq 0x42 -and $Head[11] -eq 0x50) { return 'webp' }
  if ($Head.Length -gt 0) {
    foreach ($byte in $Head) { if ($byte -eq 0) { return 'binary' } }
    $text = [Text.Encoding]::UTF8.GetString($Head)
    if ($text.IndexOf([char]0xFFFD) -lt 0) { return 'text' }
    $bytes = [Text.UTF8Encoding]::new($false, $true)
    for ($drop = 1; $drop -le 3 -and $drop -lt $Head.Length; $drop++) {
      try { $bytes.GetString($Head, 0, $Head.Length - $drop) | Out-Null; return 'text' } catch { }
    }
  }
  return 'binary'
}

function Get-HeaderBytes([string]$FilePath, [int]$Count) {
  $stream = [IO.File]::Open($FilePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $buffer = New-Object byte[] $Count
    $read = $stream.Read($buffer, 0, $Count)
    if ($read -eq $Count) { return $buffer }
    $trimmed = New-Object byte[] $read
    [Array]::Copy($buffer, $trimmed, $read)
    return $trimmed
  } finally { $stream.Dispose() }
}

function Test-UnderRoot([string]$FullPath, [string]$FullRoot) {
  $separator = [IO.Path]::DirectorySeparatorChar
  $prefix = $FullRoot.TrimEnd($separator) + $separator
  return $FullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Get-AttachmentVerdict {
  param([Parameter(Mandatory)][string]$FilePath, [Parameter(Mandatory)][string]$RootPath, [int]$Limit = 26214400)

  $fullRoot = [IO.Path]::GetFullPath($RootPath).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not [IO.Directory]::Exists($fullRoot)) { throw "Root tidak ada: $fullRoot" }
  $full = [IO.Path]::GetFullPath($FilePath)
  if (-not (Test-UnderRoot $full $fullRoot)) { return [pscustomobject]@{ path = $full; decision = 'reject'; reason = 'di luar root' } }
  if (-not [IO.File]::Exists($full)) { return [pscustomobject]@{ path = $full; decision = 'reject'; reason = 'berkas tidak ada' } }

  $cursor = $full
  while ($cursor.Length -gt $fullRoot.Length) {
    $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { return [pscustomobject]@{ path = $full; decision = 'reject'; reason = "reparse point: $cursor" } }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }

  $extension = [IO.Path]::GetExtension($full).ToLowerInvariant()
  if (-not $script:ExtensionKinds.ContainsKey($extension)) { return [pscustomobject]@{ path = $full; decision = 'quarantine'; reason = "ekstensi tidak diizinkan: $extension" } }

  $info = [IO.FileInfo]::new($full)
  if ($info.Length -eq 0) { return [pscustomobject]@{ path = $full; decision = 'quarantine'; reason = 'berkas kosong' } }
  if ($info.Length -gt $Limit) { return [pscustomobject]@{ path = $full; decision = 'quarantine'; reason = "melebihi batas $Limit byte" } }

  $expected = $script:ExtensionKinds[$extension]
  $detected = Get-DetectedKind (Get-HeaderBytes $full 8192)
  $ok = if ($expected -eq 'text') { $detected -eq 'text' } else { $detected -eq $expected }
  if (-not $ok) { return [pscustomobject]@{ path = $full; decision = 'quarantine'; reason = "isi $detected tidak cocok dengan $extension" } }

  return [pscustomobject]@{ path = $full; decision = 'accept'; reason = 'lolos gate dasar (belum antivirus)' }
}

function Move-ToQuarantine([string]$FilePath, [string]$RootPath, [string]$QuarantinePath, [string]$Reason) {
  $fullRoot = [IO.Path]::GetFullPath($RootPath)
  $full = [IO.Path]::GetFullPath($FilePath)
  if (-not (Test-UnderRoot $full $fullRoot)) { throw 'Tolak karantina berkas di luar root.' }
  [void][IO.Directory]::CreateDirectory($QuarantinePath)
  $target = Join-Path $QuarantinePath ("{0}-{1}" -f [Guid]::NewGuid().ToString('N'), [IO.Path]::GetFileName($full))
  [IO.File]::Move($full, $target)
  $record = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    original = $full
    quarantined = $target
    reason = $Reason
    size = ([IO.FileInfo]::new($target)).Length
  }
  [IO.File]::AppendAllText((Join-Path $QuarantinePath 'quarantine.jsonl'), ((ConvertTo-Json -InputObject $record -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
  return $target
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ("hyper-attach-" + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    $root = Join-Path $temp 'root'
    [void][IO.Directory]::CreateDirectory($root)
    $write = { param($name, [byte[]]$bytes) $p = Join-Path $root $name; [IO.File]::WriteAllBytes($p, $bytes); $p }
    $utf8 = [Text.UTF8Encoding]::new($false)
    $utf16 = [Text.Encoding]::Unicode

    $md = & $write 'catatan.md' ($utf8.GetBytes("# judul`nisi"))
    $pdf = & $write 'surat.pdf' ([byte[]](0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37, 0x0A))
    $png = & $write 'gambar.png' ([byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00))
    $zip = & $write 'dokumen.docx' ([byte[]](0x50, 0x4B, 0x03, 0x04, 0x14, 0x00))
    $exe = & $write 'jahat.exe' ([byte[]](0x4D, 0x5A, 0x90, 0x00))
    $fakePdf = & $write 'palsu.pdf' ($utf8.GetBytes("bukan pdf sama sekali"))
    $binaryMd = & $write 'biner.md' ([byte[]](0x01, 0x02, 0x00, 0x03))
    $utf16md = & $write 'lebar.md' ($utf16.GetBytes('teks lebar'))
    $empty = & $write 'kosong.txt' ([byte[]]@())
    $big = & $write 'besar.txt' ($utf8.GetBytes('x' * 4096))

    $cases = @(
      @{ path = $md; expect = 'accept' },
      @{ path = $pdf; expect = 'accept' },
      @{ path = $png; expect = 'accept' },
      @{ path = $zip; expect = 'accept' },
      @{ path = $exe; expect = 'quarantine' },
      @{ path = $fakePdf; expect = 'quarantine' },
      @{ path = $binaryMd; expect = 'quarantine' },
      @{ path = $utf16md; expect = 'quarantine' },
      @{ path = $empty; expect = 'quarantine' },
      @{ path = $big; expect = 'quarantine' },
      @{ path = (Join-Path $root 'tidak-ada.txt'); expect = 'reject' },
      @{ path = (Join-Path $temp 'luar.txt'); expect = 'reject' }
    )
    foreach ($case in $cases) {
      $verdict = Get-AttachmentVerdict -FilePath $case.path -RootPath $root -Limit 2048
      if ($verdict.decision -cne $case.expect) { $failures.Add("$($case.path): $($verdict.decision), harus $($case.expect) ($($verdict.reason))") }
    }

    $traversal = Get-AttachmentVerdict -FilePath (Join-Path $root '..\luar.txt') -RootPath $root
    if ($traversal.decision -cne 'reject') { $failures.Add('path traversal harus ditolak') }

    $junction = Join-Path $root 'tautan'
    $junctionMade = $false
    try {
      New-Item -ItemType Junction -Path $junction -Target $temp -ErrorAction Stop | Out-Null
      $junctionMade = $true
    } catch { }
    if ($junctionMade) {
      $linked = Get-AttachmentVerdict -FilePath (Join-Path $junction 'root\catatan.md') -RootPath $root
      if ($linked.decision -cne 'reject') { $failures.Add('reparse point harus ditolak') }
    }

    $quarantineDir = Join-Path $temp 'karantina'
    $moved = Move-ToQuarantine -FilePath $exe -RootPath $root -QuarantinePath $quarantineDir -Reason 'ekstensi tidak diizinkan'
    if ([IO.File]::Exists($exe) -or -not [IO.File]::Exists($moved)) { $failures.Add('berkas karantina tidak dipindah') }
    $ledger = Join-Path $quarantineDir 'quarantine.jsonl'
    if (-not [IO.File]::Exists($ledger)) { $failures.Add('ledger karantina tidak dibuat') }
    else {
      $record = [IO.File]::ReadAllText($ledger) | ConvertFrom-Json
      if ($record.original -cne $exe -or $record.reason -cne 'ekstensi tidak diizinkan') { $failures.Add('isi ledger karantina tidak sesuai') }
    }
    $outside = Join-Path $temp 'luar2.txt'
    [IO.File]::WriteAllText($outside, 'x')
    $blocked = $false
    try { Move-ToQuarantine -FilePath $outside -RootPath $root -QuarantinePath $quarantineDir -Reason 'uji' | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { $failures.Add('karantina berkas di luar root harus gagal') }
    if (-not [IO.File]::Exists($outside)) { $failures.Add('berkas luar root tidak boleh tersentuh') }

    if ($failures.Count -gt 0) {
      $failures | ForEach-Object { [Console]::Error.WriteLine($_) }
      exit 1
    }
    "Attachment gate self-check passed: $($cases.Count) keputusan, traversal, reparse point, karantina, dan ledger."
    exit 0
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ([string]::IsNullOrWhiteSpace($Path) -or [string]::IsNullOrWhiteSpace($Root)) {
  [Console]::Error.WriteLine('Pemakaian: -Path <berkas> -Root <folder> [-Quarantine <folder> -Route] [-MaxBytes <n>] atau -SelfCheck')
  exit 1
}

$verdict = Get-AttachmentVerdict -FilePath $Path -RootPath $Root -Limit $MaxBytes
$result = [ordered]@{ path = $verdict.path; decision = $verdict.decision; reason = $verdict.reason; routed = $false }
if ($Route -and $verdict.decision -ceq 'quarantine') {
  if ([string]::IsNullOrWhiteSpace($Quarantine)) { [Console]::Error.WriteLine('Butuh -Quarantine untuk -Route.'); exit 1 }
  $result.routed = $true
  $result.quarantined = Move-ToQuarantine -FilePath $verdict.path -RootPath $Root -QuarantinePath $Quarantine -Reason $verdict.reason
}
[pscustomobject]$result | ConvertTo-Json -Depth 4
if ($verdict.decision -ceq 'reject') { exit 2 }
exit 0
