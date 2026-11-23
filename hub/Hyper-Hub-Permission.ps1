[CmdletBinding()]
param(
  [string]$Config,
  [string]$BackupDir,
  [switch]$Apply,
  [switch]$Rollback,
  [switch]$SelfCheck
)

# N-05 (ADR-003): turunkan `permission { "*": "allow" }` menjadi deny-by-default.
# Perubahan hanya menyentuh wildcard allow; entri eksplisit milik pengguna dipertahankan.
# Backup wajib, idempoten, rollback byte-identik. Tidak ada nilai rahasia yang dibaca.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$script:KnownTools = @('bash', 'edit', 'write', 'patch', 'webfetch', 'websearch', 'task', 'read', 'grep', 'glob', 'list')

function New-Hash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Read-PermissionConfig([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Config tidak ditemukan: $Path" }
  return (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8)))
}

function Get-HardeningPlan($Document) {
  $issues = @()
  $changes = @()
  $permission = $Document.permission
  if ($null -eq $permission) {
    return [pscustomobject]@{ needed = $false; changes = @(); issues = @(); reason = 'tidak ada blok permission' }
  }
  $wildcard = $permission.PSObject.Properties['*']
  if ($null -eq $wildcard) {
    return [pscustomobject]@{ needed = $false; changes = @(); issues = @(); reason = 'tidak ada wildcard *' }
  }
  if ([string]$wildcard.Value -ne 'allow') {
    return [pscustomobject]@{ needed = $false; changes = @(); issues = @(); reason = "wildcard bernilai $($wildcard.Value), bukan allow" }
  }
  # Turunkan: hapus wildcard allow, lalu tulis deny eksplisit untuk tool berisiko yang
  # belum punya entri eksplisit. Tool baca dibiarkan ke default engine (deny-by-default).
  $changes += '*'
  foreach ($tool in $script:KnownTools) {
    $existing = $permission.PSObject.Properties[$tool]
    if ($null -eq $existing) { $changes += $tool }
  }
  return [pscustomobject]@{ needed = $true; changes = @($changes); issues = @($issues); reason = 'wildcard allow ditemukan' }
}

function Invoke-Hardening([string]$ConfigPath, [string]$BackupFolder, [bool]$Write, [bool]$Restore) {
  $path = [IO.Path]::GetFullPath($ConfigPath)
  $raw = [IO.File]::ReadAllText($path, $utf8)

  if ($Restore) {
    if ([string]::IsNullOrWhiteSpace($BackupFolder)) { throw 'Rollback membutuhkan -BackupDir.' }
    $backupFile = Join-Path $BackupFolder 'opencode.json'
    $manifestFile = Join-Path $BackupFolder 'permission-hardening.json'
    if (-not [IO.File]::Exists($backupFile) -or -not [IO.File]::Exists($manifestFile)) { throw 'Backup hardening tidak lengkap.' }
    $manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($manifestFile, $utf8))
    if ((New-Hash ([IO.File]::ReadAllText($backupFile, $utf8))) -ne [string]$manifest.backupHash) { throw 'Checksum backup tidak cocok; rollback dibatalkan.' }
    [IO.File]::WriteAllText($path, [IO.File]::ReadAllText($backupFile, $utf8), $utf8)
    return [pscustomobject]@{ restored = $path; verified = ((New-Hash ([IO.File]::ReadAllText($path, $utf8))) -eq [string]$manifest.backupHash); wrote = $true }
  }

  $document = Read-PermissionConfig $path
  $plan = Get-HardeningPlan $document
  $result = [ordered]@{
    config = $path
    apply = $Write
    needed = $plan.needed
    reason = $plan.reason
    changes = @($plan.changes)
    wrote = $false
    backup = $null
  }
  if (-not $plan.needed) {
    $result.preview = 'tidak ada perubahan diperlukan'
    return [pscustomobject]$result
  }
  if (-not $Write) {
    $result.preview = 'jalankan dengan -Apply untuk menulis; backup dibuat otomatis'
    return [pscustomobject]$result
  }
  if ([string]::IsNullOrWhiteSpace($BackupFolder)) {
    $BackupFolder = Join-Path (Split-Path -Parent $path) ("permission-backup-" + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
  }
  $backupFile = Join-Path $BackupFolder 'opencode.json'
  if ([IO.File]::Exists($backupFile)) { throw "Backup tujuan sudah ada: $BackupFolder" }
  [void][IO.Directory]::CreateDirectory($BackupFolder)
  [IO.File]::WriteAllText($backupFile, $raw, $utf8)
  $manifest = [ordered]@{
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    config = $path
    backupHash = (New-Hash $raw)
    removed = '*'
    added = @($plan.changes | Where-Object { $_ -ne '*' })
    rollback = "powershell -File Hyper-Hub-Permission.ps1 -Config `"$path`" -BackupDir `"$BackupFolder`" -Rollback"
  }
  [IO.File]::WriteAllText((Join-Path $BackupFolder 'permission-hardening.json'), (ConvertTo-Json -InputObject $manifest -Depth 5), $utf8)
  $result.backup = $BackupFolder
  $result.rollback = $manifest.rollback

  $permission = $document.permission
  $permission.PSObject.Properties.Remove('*')
  # Hanya tool yang belum punya entri eksplisit yang diberi deny. Entri pengguna utuh.
  foreach ($tool in @($plan.changes | Where-Object { $_ -ne '*' })) {
    $permission | Add-Member -NotePropertyName $tool -NotePropertyValue 'deny'
  }
  $json = ConvertTo-Json -InputObject $document -Depth 20
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, $json, $utf8)
  if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
  [IO.File]::Move($tmp, $path)
  $result.wrote = $true
  return [pscustomobject]$result
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('permission-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $path = Join-Path $temp 'opencode.json'
    $original = '{"model":"x","permission":{"*":"allow","webfetch":"deny","bash":"ask"},"policies":[{"action":"provider.use","resource":"cx","effect":"allow"}]}'
    [IO.File]::WriteAllText($path, $original, $utf8)

    $preview = Invoke-Hardening $path '' $false $false
    if (-not $preview.needed -or $preview.wrote) { $failures.Add('preview harus needed tanpa menulis') }
    if ([IO.File]::ReadAllText($path, $utf8) -cne $original) { $failures.Add('preview tidak boleh mengubah config') }

    $backup = Join-Path $temp 'backup'
    $applied = Invoke-Hardening $path $backup $true $false
    if (-not $applied.wrote) { $failures.Add('apply harus menulis') }
    $after = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($path, $utf8))
    if ($null -ne $after.permission.PSObject.Properties['*']) { $failures.Add('wildcard * harus hilang') }
    if ([string]$after.permission.webfetch -cne 'deny') { $failures.Add('entri pengguna webfetch harus utuh') }
    if ([string]$after.permission.bash -cne 'ask') { $failures.Add('entri pengguna bash harus utuh') }
    if ([string]$after.permission.edit -cne 'deny') { $failures.Add('tool berisiko tanpa entri harus jadi deny') }
    if ($after.model -cne 'x') { $failures.Add('field lain harus utuh') }
    if (@($after.policies).Count -ne 1) { $failures.Add('policies harus utuh') }

    $again = Invoke-Hardening $path (Join-Path $temp 'backup2') $true $false
    if ($again.needed -or $again.wrote) { $failures.Add('apply kedua harus idempoten') }

    $restored = Invoke-Hardening $path $backup $false $true
    if (-not $restored.verified -or [IO.File]::ReadAllText($path, $utf8) -cne $original) { $failures.Add('rollback harus byte-identik') }

    [IO.File]::AppendAllText((Join-Path $backup 'opencode.json'), ' ', $utf8)
    $threw = $false
    try { Invoke-Hardening $path $backup $false $true | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('rollback dengan backup rusak harus ditolak') }
    if ([IO.File]::ReadAllText($path, $utf8) -cne $original) { $failures.Add('rollback gagal tidak boleh mengubah config') }

    $noWildcard = Join-Path $temp 'clean.json'
    [IO.File]::WriteAllText($noWildcard, '{"permission":{"webfetch":"deny"}}', $utf8)
    if ((Invoke-Hardening $noWildcard '' $false $false).needed) { $failures.Add('tanpa wildcard tidak perlu perubahan') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Permission hardening self-check passed: wildcard diturunkan, entri pengguna utuh, idempoten, rollback terverifikasi.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Config)) { [Console]::Error.WriteLine('Pemakaian: -Config <opencode.json> [-Apply] [-BackupDir <folder>] [-Rollback] | -SelfCheck'); exit 1 }
try {
  Invoke-Hardening $Config $BackupDir ([bool]$Apply) ([bool]$Rollback) | ConvertTo-Json -Depth 5
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
