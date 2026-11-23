[CmdletBinding()]
param(
  [string]$Config,
  [string]$BackupDir,
  [switch]$Apply,
  [switch]$Rollback,
  [switch]$SelfCheck
)

# D-01: migrasi permission V1 -> policies V2 secara konservatif.
# Hanya entri DENY yang menjadi policy deny eksplisit; allow/ask V1 tidak dinaikkan
# menjadi policy allow (deny-by-default). Permission V1 dipertahankan apa adanya.
# Backup wajib sebelum tulis; rollback memulihkan byte-identik dan diverifikasi.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$script:ToolPolicy = @{
  'bash' = @{ action = 'tool.use'; resource = 'shell:*' }
  'shell' = @{ action = 'tool.use'; resource = 'shell:*' }
  'webfetch' = @{ action = 'tool.use'; resource = 'webfetch:*' }
  'websearch' = @{ action = 'tool.use'; resource = 'websearch:*' }
  'edit' = @{ action = 'tool.use'; resource = 'edit:*' }
  'write' = @{ action = 'tool.use'; resource = 'write:*' }
  'patch' = @{ action = 'tool.use'; resource = 'patch:*' }
}

function New-Hash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Read-ConfigFile([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Config tidak ditemukan: $Path" }
  return (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8)))
}

function Get-PolicyKey($Rule) { return ("{0}|{1}|{2}" -f [string]$Rule.action, [string]$Rule.resource, [string]$Rule.effect) }

function New-MigrationPlan($ConfigDocument) {
  $policies = @()
  if ($null -ne $ConfigDocument.policies) { $policies = @($ConfigDocument.policies) }
  $existing = @{}
  foreach ($rule in $policies) {
    if ($null -eq $rule) { continue }
    if ([string]::IsNullOrWhiteSpace([string]$rule.action) -or [string]::IsNullOrWhiteSpace([string]$rule.resource) -or [string]::IsNullOrWhiteSpace([string]$rule.effect)) {
      throw 'Config berisi policy tidak lengkap; perbaiki manual sebelum migrasi.'
    }
    $existing[(Get-PolicyKey $rule)] = $true
  }

  $added = @()
  $skipped = @()
  $permission = $ConfigDocument.permission
  if ($null -ne $permission) {
    foreach ($property in $permission.PSObject.Properties) {
      $name = $property.Name
      $effect = [string]$property.Value
      if ($name -ceq '*' -and $effect -ceq 'deny') {
        $skipped += [pscustomobject]@{ permission = '*'; effect = $effect; reason = 'wildcard deny butuh keputusan manusia' }
        continue
      }
      if ($effect -cne 'deny') {
        $skipped += [pscustomobject]@{ permission = $name; effect = $effect; reason = 'bukan deny; tidak dinaikkan menjadi policy' }
        continue
      }
      if (-not $script:ToolPolicy.ContainsKey($name)) {
        $skipped += [pscustomobject]@{ permission = $name; effect = $effect; reason = 'tanpa padanan policy V2 terverifikasi' }
        continue
      }
      $mapped = $script:ToolPolicy[$name]
      $rule = [pscustomobject]@{ action = $mapped.action; resource = $mapped.resource; effect = 'deny' }
      if ($existing.ContainsKey((Get-PolicyKey $rule))) {
        $skipped += [pscustomobject]@{ permission = $name; effect = $effect; reason = 'policy deny sudah ada' }
        continue
      }
      $existing[(Get-PolicyKey $rule)] = $true
      $added += $rule
    }
  }

  return [pscustomobject]@{
    added = @($added)
    skipped = @($skipped)
    hadPermission = $null -ne $permission
    hadPolicies = $null -ne $ConfigDocument.policies
    policyCount = $policies.Count
  }
}

function Invoke-Migration([string]$ConfigPath, [string]$BackupFolder, [bool]$Write, [bool]$Restore) {
  $path = [IO.Path]::GetFullPath($ConfigPath)
  $raw = [IO.File]::ReadAllText($path, $utf8)

  if ($Restore) {
    if ([string]::IsNullOrWhiteSpace($BackupFolder)) { throw 'Rollback membutuhkan -BackupDir.' }
    $backupFile = Join-Path $BackupFolder 'opencode.json'
    $manifestFile = Join-Path $BackupFolder 'migration.json'
    if (-not [IO.File]::Exists($backupFile) -or -not [IO.File]::Exists($manifestFile)) { throw 'Backup migrasi tidak lengkap.' }
    $manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($manifestFile, $utf8))
    if ((New-Hash ([IO.File]::ReadAllText($backupFile, $utf8))) -cne [string]$manifest.backupHash) { throw 'Checksum backup tidak cocok; rollback dibatalkan.' }
    [IO.File]::WriteAllText($path, [IO.File]::ReadAllText($backupFile, $utf8), $utf8)
    if ((New-Hash ([IO.File]::ReadAllText($path, $utf8))) -cne [string]$manifest.backupHash) { throw 'Rollback gagal verifikasi.' }
    return [pscustomobject]@{ restored = $path; from = $backupFile; verified = $true; wrote = $true }
  }

  $document = Read-ConfigFile $path
  $plan = New-MigrationPlan $document
  $result = [ordered]@{
    config = $path
    apply = $Write
    added = @($plan.added)
    skipped = @($plan.skipped)
    hadPolicies = $plan.hadPolicies
    policyCount = $plan.policyCount
    wrote = $false
    backup = $null
  }
  if (-not $Write) {
    $result.preview = 'jalankan dengan -Apply untuk menulis; backup dibuat otomatis'
    return [pscustomobject]$result
  }
  if ($plan.added.Count -eq 0) {
    # Tidak ada perubahan: jangan sentuh config dan jangan timpa backup lama.
    $result.rollback = 'tidak ada perubahan; backup tidak dibuat'
    return [pscustomobject]$result
  }

  if ([string]::IsNullOrWhiteSpace($BackupFolder)) {
    $BackupFolder = Join-Path (Split-Path -Parent $path) ("config-backup-" + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
  }
  $backupFile = Join-Path $BackupFolder 'opencode.json'
  $manifestFile = Join-Path $BackupFolder 'migration.json'
  if ([IO.File]::Exists($backupFile) -or [IO.File]::Exists($manifestFile)) {
    throw "Backup tujuan sudah berisi migrasi lain: $BackupFolder (pakai -BackupDir baru agar rollback tetap sah)."
  }
  [void][IO.Directory]::CreateDirectory($BackupFolder)
  [IO.File]::WriteAllText($backupFile, $raw, $utf8)
  $manifest = [ordered]@{
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    config = $path
    backupHash = (New-Hash $raw)
    added = @($plan.added | ForEach-Object { "$($_.action):$($_.resource):$($_.effect)" })
    rollback = "powershell -File Hyper-Hub-Migrate.ps1 -Config `"$path`" -BackupDir `"$BackupFolder`" -Rollback"
  }
  [IO.File]::WriteAllText($manifestFile, (ConvertTo-Json -InputObject $manifest -Depth 5), $utf8)
  $result.backup = $BackupFolder
  $result.backupHash = (New-Hash $raw)
  $result.rollback = $manifest.rollback

  $current = @()
  if ($null -ne $document.policies) { $current = @($document.policies) }
  $document | Add-Member -NotePropertyName policies -NotePropertyValue (@($current) + @($plan.added)) -Force
  $json = ConvertTo-Json -InputObject $document -Depth 20
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, $json, $utf8)
  if ([IO.File]::Exists($path)) { [IO.File]::Delete($path) }
  [IO.File]::Move($tmp, $path)
  $result.wrote = $true
  return [pscustomobject]$result
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('migrate-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $path = Join-Path $temp 'opencode.json'
    $backup = Join-Path $temp 'backup'
    $original = '{ "model": "x", "permission": { "webfetch": "deny", "websearch": "deny", "bash": "ask", "*": "allow" }, "policies": [ { "action": "provider.use", "resource": "cx", "effect": "allow" } ] }'
    [IO.File]::WriteAllText($path, $original, $utf8)

    $preview = Invoke-Migration $path '' $false $false
    if ($preview.wrote -ne $false -or @($preview.added).Count -ne 2) { $failures.Add('preview harus 2 deny baru tanpa menulis') }
    if ([IO.File]::ReadAllText($path, $utf8) -cne $original) { $failures.Add('preview tidak boleh mengubah config') }
    if (@($preview.skipped | Where-Object { $_.permission -ceq 'bash' }).Count -ne 1) { $failures.Add('ask tidak boleh menjadi policy allow') }

    $applied = Invoke-Migration $path $backup $true $false
    if ($applied.wrote -ne $true -or -not [IO.File]::Exists((Join-Path $backup 'opencode.json'))) { $failures.Add('apply harus menulis dan membuat backup') }
    $after = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($path, $utf8))
    if (@($after.policies).Count -ne 3) { $failures.Add('apply harus menambah 2 policy deny') }
    if ($null -eq $after.permission -or $after.permission.webfetch -cne 'deny') { $failures.Add('permission V1 harus dipertahankan') }
    if ($after.model -cne 'x') { $failures.Add('field lain harus utuh') }
    if (@($after.policies | Where-Object { $_.effect -ceq 'allow' }).Count -ne 1) { $failures.Add('allow milik pengguna harus utuh') }

    $again = Invoke-Migration $path (Join-Path $temp 'backup2') $true $false
    if (@($again.added).Count -ne 0 -or $again.wrote -ne $false) { $failures.Add('migrasi kedua harus idempoten') }
    if (Test-Path -LiteralPath (Join-Path $temp 'backup2')) { $failures.Add('idempoten tidak boleh membuat backup baru') }

    $restored = Invoke-Migration $path $backup $false $true
    if ($restored.verified -ne $true -or [IO.File]::ReadAllText($path, $utf8) -cne $original) { $failures.Add('rollback harus byte-identik') }

    [IO.File]::AppendAllText((Join-Path $backup 'opencode.json'), ' ', $utf8)
    $threw = $false
    try { Invoke-Migration $path $backup $false $true | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('rollback dengan backup dirusak harus ditolak') }
    if ([IO.File]::ReadAllText($path, $utf8) -cne $original) { $failures.Add('rollback gagal tidak boleh mengubah config') }

    $badPath = Join-Path $temp 'bad.json'
    [IO.File]::WriteAllText($badPath, '{ "permission": { "webfetch": "deny" }, "policies": [ { "action": "x" } ] }', $utf8)
    $threw = $false
    try { Invoke-Migration $badPath '' $false $false | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('policy tidak lengkap harus ditolak') }
  } catch {
    $failures.Add("exception: $($_.Exception.Message)")
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
  'Migration self-check passed: preview, apply, idempotensi, rollback terverifikasi, dan penolakan backup rusak.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Config)) {
  [Console]::Error.WriteLine('Pemakaian: -Config <opencode.json> [-Apply] [-BackupDir <folder>] [-Rollback] | -SelfCheck')
  exit 1
}
try {
  Invoke-Migration $Config $BackupDir ([bool]$Apply) ([bool]$Rollback) | ConvertTo-Json -Depth 6
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
