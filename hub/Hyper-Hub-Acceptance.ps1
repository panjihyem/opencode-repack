[CmdletBinding()]
param(
  [string]$WorkDir,
  [int]$Days = 14,
  [int]$FilesPerDay = 1,
  [switch]$SelfCheck
)

# F-10: harness penerimaan use case (JDIH + watch-folder + rekap).
# Mode default menjalankan simulasi 14 hari dengan file sintetis di folder sementara;
# ini membuktikan pipeline end-to-end bisa dijalankan berulang tanpa duplikat.
# Uji penerimaan NYATA (14 hari kalender, data non-sensitif, sign-off owner) tetap
# harus dijalankan manusia; harness ini tidak menggantikan itu.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$hub = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$attachment = Join-Path $PSScriptRoot 'Hyper-Hub-Attachment.ps1'
$recap = Join-Path $PSScriptRoot 'Hyper-Hub-Recap.ps1'
$jdih = Join-Path $PSScriptRoot 'Hyper-Hub-Jdih.ps1'

function Invoke-Ps([string]$Script, [string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments 2>&1
    return [pscustomobject]@{ code = $LASTEXITCODE; text = ([string]($output | Out-String)).Trim() }
  } finally { $ErrorActionPreference = $previous }
}

function Invoke-Simulation([string]$Base, [int]$DayCount, [int]$PerDay) {
  $ingest = Join-Path $Base 'ingest\general\regulasi'
  [void][IO.Directory]::CreateDirectory($ingest)
  $state = Join-Path $Base 'state'
  (Invoke-Ps $hub @('init', '-Root', $state)) | Out-Null

  $feed = Join-Path $Base 'feed.json'
  $items = @()
  for ($i = 1; $i -le $PerDay * $DayCount; $i++) {
    $items += [pscustomobject]@{ title = "PMK $i/2026"; url = "https://jdih.kemenkeu.go.id/d/$i"; date_modified = '2026-11-01'; content_text = "ringkasan $i" }
  }
  [IO.File]::WriteAllText($feed, (ConvertTo-Json -InputObject @{ items = $items } -Depth 5), $utf8)

  $accepted = 0
  $quarantined = 0
  $deferred = 0
  for ($day = 1; $day -le $DayCount; $day++) {
    for ($n = 1; $n -le $PerDay; $n++) {
      $index = (($day - 1) * $PerDay) + $n
      $name = "catatan-$index.md"
      $path = Join-Path $ingest $name
      # Hari ganjil: berkas sah. Hari genap kelipatan 7: berkas rusak (harus karantina).
      if ($day % 7 -eq 0 -and $n -eq 1) {
        [IO.File]::WriteAllBytes($path, [byte[]](0x4D, 0x5A, 0x90, 0x00))
        $result = Invoke-Ps $attachment @('-Path', $path, '-Root', (Join-Path $Base 'ingest'), '-Quarantine', (Join-Path $Base 'quarantine'), '-Route')
        $json = $result.text | ConvertFrom-Json
        if ($json.decision -ceq 'quarantine') { $quarantined++ }
      } else {
        [IO.File]::WriteAllText($path, "# catatan $index`nisi hari $day", $utf8)
        $result = Invoke-Ps $attachment @('-Path', $path, '-Root', (Join-Path $Base 'ingest'))
        $json = $result.text | ConvertFrom-Json
        if ($json.decision -ceq 'accept') { $accepted++ }
        if ($json.decision -ceq 'quarantine') { $quarantined++ }
      }
    }
  }
  # Jalankan ulang seluruh berkas yang masih ada: harus idempoten (semua accept, tidak menambah berkas).
  $before = @([IO.Directory]::GetFiles($ingest, '*.md', [IO.SearchOption]::AllDirectories)).Count
  $rechecked = 0
  foreach ($file in [IO.Directory]::GetFiles($ingest, '*.md', [IO.SearchOption]::AllDirectories)) {
    $r = Invoke-Ps $attachment @('-Path', $file, '-Root', (Join-Path $Base 'ingest'))
    if (($r.text | ConvertFrom-Json).decision -ceq 'accept') { $rechecked++ }
  }
  $after = @([IO.Directory]::GetFiles($ingest, '*.md', [IO.SearchOption]::AllDirectories)).Count

  $jdihResult = Invoke-Ps $jdih @('-Root', $state, '-FeedFile', $feed, '-Plan')
  $jdihJson = $jdihResult.text | ConvertFrom-Json

  $recapResult = Invoke-Ps $recap @('-Root', $state, '-OutDir', (Join-Path $Base 'rekap'), '-Days', "$DayCount")
  $recapJson = $recapResult.text | ConvertFrom-Json

  return [pscustomobject]@{
    days = $DayCount
    files = $DayCount * $PerDay
    accepted = $accepted
    quarantined = $quarantined
    deferred = $deferred
    rerunAccepted = $rechecked
    filesBefore = $before
    filesAfter = $after
    idempotent = ($before -eq $after)
    jdihEntries = $jdihJson.entries
    jdihChanged = $jdihJson.changed
    recapFile = $recapJson.file
    recapSucceeded = $recapJson.succeeded
  }
}

if ($SelfCheck -or [string]::IsNullOrWhiteSpace($WorkDir)) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('acceptance-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $result = Invoke-Simulation $temp 14 1
    if ($result.files -ne 14) { $failures.Add("harus 14 berkas, dapat $($result.files)") }
    if ($result.accepted -lt 12) { $failures.Add("berkas sah harus >= 12, dapat $($result.accepted)") }
    if ($result.quarantined -lt 1) { $failures.Add('berkas rusak hari ke-7 harus dikarantina') }
    if (-not $result.idempotent) { $failures.Add("jalankan ulang tidak boleh menambah berkas ($($result.filesBefore) -> $($result.filesAfter))") }
    if ($result.rerunAccepted -ne $result.filesBefore) { $failures.Add("semua berkas tersisa harus accept saat rerun, dapat $($result.rerunAccepted)") }
    if ($result.jdihEntries -ne 14) { $failures.Add("katalog JDIH harus 14 entri, dapat $($result.jdihEntries)") }
    if (-not (Test-Path $result.recapFile)) { $failures.Add('rekap harus dibuat') }
    if ((Test-Path $result.recapFile) -and ([IO.File]::ReadAllText($result.recapFile, $utf8) -notmatch 'HYPER_AI_MANAGED: weekly recap')) { $failures.Add('rekap harus bertanda managed') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Acceptance harness self-check passed: 14 hari simulasi, karantina, idempotensi rerun, katalog, rekap.'
    Write-Output 'Catatan: ini simulasi. Uji penerimaan 14 hari kalender dengan sign-off owner tetap terbuka (F-10).'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

$result = Invoke-Simulation $WorkDir $Days $FilesPerDay
$result | ConvertTo-Json -Depth 4
if (-not $result.idempotent) { exit 2 }
exit 0
