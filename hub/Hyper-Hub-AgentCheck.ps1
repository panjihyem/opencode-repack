[CmdletBinding()]
param([switch]$SelfCheck)

# D-02: validasi agent hyper-ops. Izin harus minimal: baca saja, tanpa shell,
# tanpa edit, tanpa jaringan, tanpa subagent. Perubahan di masa depan yang melonggarkan
# izin akan menggagalkan self-check ini.

$ErrorActionPreference = 'Stop'
$agentPath = Join-Path $PSScriptRoot 'agents\hyper-ops.md'

function Get-Frontmatter([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Agent tidak ditemukan: $Path" }
  $text = [IO.File]::ReadAllText($Path)
  $match = [regex]::Match($text, '(?s)\A---\r?\n(.*?)\r?\n---\r?\n')
  if (-not $match.Success) { throw 'Frontmatter agent tidak ditemukan.' }
  return $match.Groups[1].Value
}

function Get-AgentIssues([string]$Path) {
  $issues = @()
  try { $front = Get-Frontmatter $Path } catch { return @($_.Exception.Message) }
  $requiredDeny = @('edit', 'write', 'patch', 'webfetch', 'websearch', 'bash', 'task')
  foreach ($tool in $requiredDeny) {
    if ($front -notmatch "(?m)^\s*$tool\s*:\s*deny\s*$") { $issues += "permission.$tool harus deny" }
  }
  foreach ($tool in @('read', 'grep', 'glob')) {
    if ($front -notmatch "(?m)^\s*$tool\s*:\s*true\s*$") { $issues += "tools.$tool harus true" }
  }
  if ($front -match '(?m)^\s*(edit|write|patch|bash|webfetch|websearch|task)\s*:\s*(allow|true)\s*$') { $issues += 'ada izin berbahaya yang aktif' }
  if ($front -notmatch '(?m)^mode:\s*subagent\s*$') { $issues += 'mode harus subagent agar tidak menjadi agent utama' }
  return $issues
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('agent-check-' + [Guid]::NewGuid().ToString('N') + '.md')
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    $issues = Get-AgentIssues $agentPath
    if ($issues.Count -gt 0) { $failures.Add("agent asli tidak valid: $($issues -join '; ')") }

    $body = [IO.File]::ReadAllText($agentPath)
    [IO.File]::WriteAllText($temp, $body.Replace('bash: deny', 'bash: allow'))
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('bash allow harus ditolak') }

    [IO.File]::WriteAllText($temp, $body.Replace('edit: deny', 'edit: allow'))
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('edit allow harus ditolak') }

    [IO.File]::WriteAllText($temp, $body.Replace('webfetch: deny', 'webfetch: allow'))
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('webfetch allow harus ditolak') }

    [IO.File]::WriteAllText($temp, $body.Replace('task: deny', 'task: allow'))
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('subagent allow harus ditolak') }

    [IO.File]::WriteAllText($temp, $body.Replace('mode: subagent', 'mode: primary'))
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('mode primary harus ditolak') }

    [IO.File]::WriteAllText($temp, $body.Replace('read: true', 'read: false'))
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('tanpa read harus ditolak') }

    [IO.File]::WriteAllText($temp, '# tanpa frontmatter')
    if ((Get-AgentIssues $temp).Count -eq 0) { $failures.Add('tanpa frontmatter harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Agent self-check passed: hyper-ops baca-saja, tanpa shell/edit/jaringan/subagent.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}

$issues = Get-AgentIssues $agentPath
if ($issues.Count -gt 0) {
  $issues | ForEach-Object { [Console]::Error.WriteLine($_) }
  exit 2
}
[pscustomobject]@{ agent = 'hyper-ops'; path = $agentPath; permission = 'read-only'; valid = $true } | ConvertTo-Json -Depth 3
exit 0
