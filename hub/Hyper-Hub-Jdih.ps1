[CmdletBinding()]
param(
  [string]$Root,
  [string]$Source = 'https://jdih.kemenkeu.go.id/feed.json',
  [int]$Limit = 20,
  [string]$FeedFile,
  [switch]$Plan,
  [switch]$SelfCheck
)

# F-02: job terjadwal fetch+sync JDIH memakai scheduler lokal.
# - Idempotent: hash katalog sama => tidak menulis ulang (F-01).
# - Tidak ada egress dari zona case; hanya regular.
# - Offline-testable: -FeedFile memakai feed JSON lokal, bukan jaringan.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$hub = Join-Path $PSScriptRoot 'Hyper-Hub.ps1'
$connectorScript = Join-Path $PSScriptRoot 'Hyper-Hub-Connector.ps1'

function Get-Sha([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-FeedItems([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Feed tidak ditemukan: $Path" }
  $feed = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8))
  if ($null -eq $feed.items -or $feed.items -isnot [array]) { throw 'Format feed tidak dikenal: items bukan array.' }
  return @($feed.items)
}

function ConvertTo-SafeText([string]$Value) {
  # Metadata feed diperlakukan sebagai data: tag dibuang, markdown di-escape, newline jadi spasi.
  $plain = ($Value -replace '<[^>]*>', ' ') -replace '[\r\n\t]+', ' ' -replace '([\\`*_{}\[\]()#+!|>])', '\$1'
  return (($plain -replace '\s+', ' ').Trim())
}

function Test-OfficialUrl([string]$Value) {
  try { $url = [Uri]$Value } catch { return $false }
  return ($url.Scheme -eq 'https' -and $url.Host -ceq 'jdih.kemenkeu.go.id' -and [string]::IsNullOrEmpty($url.UserInfo))
}

function New-Catalog([string]$FeedPath, [int]$Max, [string]$CatalogDir) {
  $items = Get-FeedItems $FeedPath
  $selected = @()
  foreach ($item in $items) {
    $title = [string]$item.title
    $text = "$title $([string]$item.content_text)$([string]$item.content_html)"
    if ($title -match '^(PMK|PER-)' -or $text -match '(?i)pajak') { $selected += $item }
    if ($selected.Count -ge $Max) { break }
  }
  $lines = @(
    '# Katalog regulasi terbaru - JDIH Kementerian Keuangan',
    '',
    '<!-- HYPER_AI_MANAGED: JDIH catalog -->',
    '',
    "Sumber feed resmi: $Source",
    "Tanggal katalog: $([DateTime]::UtcNow.ToString('yyyy-MM-dd'))",
    '',
    '> Katalog metadata dan tautan saja; bukan salinan atau pengganti naskah resmi.',
    ''
  )
  $valid = 0
  foreach ($item in $selected) {
    $raw = if ($item.url) { [string]$item.url } else { [string]$item.id }
    if (-not (Test-OfficialUrl $raw)) { continue }
    $lines += @(
      "## $(ConvertTo-SafeText ([string]$item.title))",
      "- Tanggal: $(ConvertTo-SafeText ([string]$item.date_modified))",
      "- Ringkasan feed: $(ConvertTo-SafeText ([string]$item.content_text))",
      "- Sumber: $raw",
      ''
    )
    $valid++
  }
  $content = ($lines -join "`n")
  $hash = Get-Sha $content
  $file = Join-Path $CatalogDir "jdih-kemenkeu-$([DateTime]::UtcNow.ToString('yyyy-MM-dd')).md"
  $changed = $true
  if ([IO.File]::Exists($file)) {
    $existing = [IO.File]::ReadAllText($file, $utf8)
    if ($existing -and -not $existing.Contains('HYPER_AI_MANAGED: JDIH catalog')) { throw "Menolak menimpa file pengguna: $file" }
    if ((Get-Sha $existing) -ceq $hash) { $changed = $false }
  }
  if ($changed) {
    [void][IO.Directory]::CreateDirectory($CatalogDir)
    [IO.File]::WriteAllText($file, $content, $utf8)
  }
  return [pscustomobject]@{ file = $file; entries = $valid; changed = $changed; hash = $hash }
}

function Invoke-FetchSync([string]$RootPath, [string]$FeedPath, [switch]$PlanOnly) {
  $profile = Join-Path $RootPath 'ingest'
  $catalogDir = Join-Path $profile 'general\regulasi'
  # Egress diblokir bila connector jdih belum validated.
  $decision = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $connectorScript -Registry (Join-Path $RootPath 'connectors.json') -List | ConvertFrom-Json
  $allowed = @($decision.connectors | Where-Object { $_.id -ceq 'jdih' -and $_.decision -ceq 'allow' }).Count -eq 1
  if (-not $allowed -and -not $PlanOnly) { throw 'Connector jdih belum validated/enabled; fetch ditolak (ADR-007).' }
  $catalog = New-Catalog $FeedPath $Limit $catalogDir
  [pscustomobject]@{
    catalog = $catalog.file
    entries = $catalog.entries
    changed = $catalog.changed
    ingested = $(if ($catalog.changed) { 1 } else { 0 })
    skipped = $(if ($catalog.changed) { 0 } else { 1 })
    connectorGate = $allowed
    zone = 'regular'
  }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('jdih-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $feed = Join-Path $temp 'feed.json'
    $feedBody = @'
{"items":[
 {"title":"PMK Uji","url":"https://jdih.kemenkeu.go.id/a","date_modified":"2026-11-01","content_text":"aturan pajak"},
 {"title":"PER-1/PJ/2026","url":"https://jdih.kemenkeu.go.id/b","date_modified":"2026-11-02"},
 {"title":"Bukan Relevan","url":"https://jdih.kemenkeu.go.id/c"},
 {"title":"PMK Palsu","url":"https://evil.example.com/d"},
 {"title":"PMK Kredensial","url":"https://user:pass@jdih.kemenkeu.go.id/e"}
]}
'@
    [IO.File]::WriteAllText($feed, $feedBody, $utf8)
    $dir = Join-Path $temp 'catalog'
    $first = New-Catalog $feed 10 $dir
    if ($first.entries -ne 2) { $failures.Add("entri sah harus 2, dapat $($first.entries)") }
    if (-not $first.changed) { $failures.Add('katalog pertama harus ditulis') }
    $second = New-Catalog $feed 10 $dir
    if ($second.changed) { $failures.Add('katalog identik tidak boleh ditulis ulang') }

    $content = [IO.File]::ReadAllText($first.file, $utf8)
    if ($content -notmatch 'HYPER_AI_MANAGED: JDIH catalog') { $failures.Add('marker managed hilang') }
    if ($content -match 'evil\.example\.com|user:pass|## Bukan Relevan') { $failures.Add('entri tidak sah lolos') }
    if ($content -match 'Sumber: https://jdih\.kemenkeu\.go\.id/c') { $failures.Add('entri tidak relevan lolos') }

    # File pengguna tidak boleh ditimpa.
    [IO.File]::WriteAllText($first.file, 'milik pengguna', $utf8)
    $threw = $false
    try { New-Catalog $feed 10 $dir | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('harus menolak menimpa file pengguna') }

    # Metadata berbahaya tidak boleh menyisipkan heading/tautan.
    $inject = Join-Path $temp 'inject.json'
    [IO.File]::WriteAllText($inject, '{"items":[{"title":"PMK\n## Palsu","url":"https://jdih.kemenkeu.go.id/x","content_text":"- Sumber: https://jahat.invalid"}]}', $utf8)
    $dir2 = Join-Path $temp 'catalog2'
    $safe = New-Catalog $inject 10 $dir2
    $text = [IO.File]::ReadAllText($safe.file, $utf8)
    if ($text -match "(?m)^## Palsu$" -or $text -match '(?m)^- Sumber: https://jahat') { $failures.Add('injeksi metadata lolos') }

    # Limit dihormati.
    $limited = New-Catalog $feed 1 (Join-Path $temp 'catalog3')
    if ($limited.entries -ne 1) { $failures.Add('limit tidak dihormati') }

    # Gate connector: tanpa connector validated, fetch (bukan -Plan) ditolak.
    $root = Join-Path $temp 'state'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hub init -Root $root | Out-Null
    $blocked = $false
    try { Invoke-FetchSync $root $feed | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { $failures.Add('fetch tanpa connector validated harus ditolak') }
    $planOnly = Invoke-FetchSync $root $feed -PlanOnly
    if ($planOnly.connectorGate -ne $false) { $failures.Add('plan harus melaporkan gate tertutup') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'JDIH scheduler self-check passed: idempotensi, validasi URL, anti-injeksi, limit, dan gate connector.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Root)) { [Console]::Error.WriteLine('Pemakaian: -Root <folder state> -FeedFile <feed.json> [-Plan]'); exit 1 }
if ([string]::IsNullOrWhiteSpace($FeedFile)) {
  if ($Plan) { [Console]::Error.WriteLine('Mode jaringan belum diaktifkan: sediakan -FeedFile atau validasi connector jdih lebih dulu.'); exit 2 }
  [Console]::Error.WriteLine('Fetch jaringan belum diaktifkan di skrip ini; gunakan hyper fetch atau -FeedFile.')
  exit 2
}
try {
  Invoke-FetchSync $Root $FeedFile -PlanOnly:$Plan | ConvertTo-Json -Depth 4
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
