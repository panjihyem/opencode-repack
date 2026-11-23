[CmdletBinding()]
param(
  [string]$MatrixPath,
  [string]$Zone,
  [string]$Operation,
  [string]$Resource,
  [string]$Connector,
  [switch]$List,
  [switch]$SelfCheck
)

# Policy engine deterministik: aksi x resource x zona -> allow | ask | deny.
# Default deny; tidak ada wildcard diam-diam; aturan lebih ketat menang.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$script:Actions = @('local.status', 'external.send', 'model.cloud', 'job.run', 'browser.navigate', 'connector.call')
$script:Zones = @('case', 'regular')
$script:Effects = @('allow', 'ask', 'deny')

function Read-PolicyMatrix([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return $null }
  $matrix = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8))
  if ($matrix.version -ne 1 -or $null -eq $matrix.rules -or $matrix.rules -isnot [array]) { throw 'Matriks policy tidak sah; tolak membaca.' }
  foreach ($rule in $matrix.rules) {
    foreach ($field in @('zone', 'action', 'resource', 'effect')) {
      if ($null -eq $rule.PSObject.Properties[$field]) { throw "Aturan policy kehilangan field $field." }
    }
    if ([string]$rule.zone -cnotin $script:Zones) { throw "Zona tidak dikenal: $($rule.zone)" }
    if ([string]$rule.action -cnotin $script:Actions) { throw "Aksi tidak dikenal: $($rule.action)" }
    if ([string]$rule.effect -cnotin $script:Effects) { throw "Efek tidak dikenal: $($rule.effect)" }
  }
  return $matrix
}

function Get-PolicyDecision {
  param($PolicyMatrix, [string]$Zone, [string]$Action, [string]$ResourceId, [string]$ConnectorId)

  $result = [ordered]@{ zone = $Zone; action = $Action; resource = $ResourceId; connector = $ConnectorId; effect = 'deny'; reason = 'unclassified: default deny'; rule = $null }

  # Batas keras yang tidak bisa dilonggarkan matriks:
  # 1) zona case hanya aksi lokal; 2) connector hanya zona regular; 3) connector wajib disebut.
  if ($Zone -cnotin $script:Zones) { return [pscustomobject]$result }
  if ($Action -cnotin $script:Actions) { return [pscustomobject]$result }
  if ($Zone -ceq 'case' -and $Action -cne 'local.status') {
    $result.reason = 'case zone blocks non-local actions'
    return [pscustomobject]$result
  }
  # Lantai keras: case local.status selalu boleh (baca-saja, tanpa egress). Matriks
  # tidak dapat mencabutnya; ia hanya dapat menambah batasan pada aksi lain.
  if ($Zone -ceq 'case' -and $Action -ceq 'local.status') {
    $result.effect = 'allow'
    $result.reason = 'case local status only'
    return [pscustomobject]$result
  }
  if ($Action -ceq 'connector.call') {
    if ([string]::IsNullOrWhiteSpace($ConnectorId)) {
      $result.reason = 'connector.call tanpa connector id'
      return [pscustomobject]$result
    }
    if ($Zone -ceq 'case') { $result.reason = 'case zone blocks connectors'; return [pscustomobject]$result }
  }
  if ($Action -ceq 'external.send' -and $Zone -ceq 'case') { $result.reason = 'case zone blocks external send'; return [pscustomobject]$result }

  $matches = @()
  if ($null -ne $PolicyMatrix) {
    $matches = @($PolicyMatrix.rules | Where-Object {
        [string]$_.zone -ceq $Zone -and [string]$_.action -ceq $Action -and
        ([string]$_.resource -eq '*' -or [string]$_.resource -ceq $ResourceId)
      })
  }
  if ($matches.Count -eq 0) { return [pscustomobject]$result }

  # Efek paling ketat menang: deny > ask > allow.
  $rank = @{ deny = 0; ask = 1; allow = 2 }
  $strictest = $matches | Sort-Object { $rank[[string]$_.effect] } | Select-Object -First 1
  $result.effect = [string]$strictest.effect
  $result.reason = $(if ($strictest.PSObject.Properties['alasan']) { [string]$strictest.alasan } else { 'matrix rule' })
  $result.rule = $strictest
  return [pscustomobject]$result
}

function Write-PolicyResult($Decision) {
  [pscustomobject]@{
    zone = $Decision.zone; action = $Decision.action; resource = $Decision.resource; connector = $Decision.connector
    decision = $Decision.effect; effect = $Decision.effect; reason = $Decision.reason; executable = $false
  } | ConvertTo-Json -Depth 5
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('policy-matrix-' + [Guid]::NewGuid().ToString('N') + '.json')
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    # Tanpa matriks: semua deny, termasuk local.status (fail-closed).
    $none = Read-PolicyMatrix $temp
    if ((Get-PolicyDecision $none 'regular' 'local.status' 'self' $null).effect -cne 'deny') { $failures.Add('tanpa matriks harus deny') }

    $json = @'
{
  "version": 1,
  "rules": [
    { "zone": "regular", "action": "local.status", "resource": "self", "effect": "allow", "alasan": "status baca-saja" },
    { "zone": "regular", "action": "external.send", "resource": "*", "effect": "ask", "alasan": "butuh approval" },
    { "zone": "regular", "action": "connector.call", "resource": "*", "effect": "allow", "alasan": "connector tervalidasi" },
    { "zone": "regular", "action": "job.run", "resource": "self", "effect": "deny", "alasan": "runner tertutup" },
    { "zone": "regular", "action": "model.cloud", "resource": "*", "effect": "ask", "alasan": "biaya/egress" }
  ]
}
'@
    [IO.File]::WriteAllText($temp, $json, $utf8)
    $matrix = Read-PolicyMatrix $temp
    if (@($matrix.rules).Count -ne 5) { $failures.Add("matriks self-check tidak termuat: type=$($matrix.GetType().Name) len=$($json.Length) head=$($json.Substring(0,[Math]::Min(12,$json.Length)))") }

    $checks = @(
      @{ zone = 'regular'; action = 'local.status'; resource = 'self'; expect = 'allow' },
      @{ zone = 'regular'; action = 'external.send'; resource = 'self'; expect = 'ask' },
      @{ zone = 'regular'; action = 'connector.call'; resource = 'jdih'; expect = 'allow' },
      @{ zone = 'regular'; action = 'job.run'; resource = 'self'; expect = 'deny' },
      @{ zone = 'regular'; action = 'model.cloud'; resource = 'gpt'; expect = 'ask' },
      @{ zone = 'regular'; action = 'browser.navigate'; resource = 'x'; expect = 'deny' },
      @{ zone = 'regular'; action = 'local.status'; resource = 'other'; expect = 'deny' },
      @{ zone = 'regular'; action = 'unknown.action'; resource = 'self'; expect = 'deny' },
      @{ zone = 'case'; action = 'local.status'; resource = 'self'; expect = 'allow' },
      @{ zone = 'case'; action = 'external.send'; resource = 'self'; expect = 'deny' },
      @{ zone = 'case'; action = 'connector.call'; resource = 'jdih'; expect = 'deny' },
      @{ zone = 'case'; action = 'model.cloud'; resource = 'gpt'; expect = 'deny' },
      @{ zone = 'unknown'; action = 'local.status'; resource = 'self'; expect = 'deny' }
    )
    foreach ($check in $checks) {
      $decision = Get-PolicyDecision $matrix $check.zone $check.action $check.resource $(if ($check.action -ceq 'connector.call') { 'jdih' } else { $null })
      if ($decision.effect -cne $check.expect) { $failures.Add("$($check.zone)/$($check.action)/$($check.resource): $($decision.effect), harus $($check.expect)") }
    }

    $noConnector = Get-PolicyDecision $matrix 'regular' 'connector.call' 'jdih' $null
    if ($noConnector.effect -cne 'deny') { $failures.Add('connector.call tanpa id harus deny') }

    # Konflik aturan: deny menang atas allow/ask.
    [IO.File]::WriteAllText($temp, '{ "version": 1, "rules": [ { "zone": "regular", "action": "external.send", "resource": "*", "effect": "allow" }, { "zone": "regular", "action": "external.send", "resource": "self", "effect": "deny" } ] }', $utf8)
    if ((Get-PolicyDecision (Read-PolicyMatrix $temp) 'regular' 'external.send' 'self' $null).effect -cne 'deny') { $failures.Add('deny harus menang atas allow') }
    [IO.File]::WriteAllText($temp, '{ "version": 1, "rules": [ { "zone": "regular", "action": "external.send", "resource": "*", "effect": "allow" }, { "zone": "regular", "action": "external.send", "resource": "self", "effect": "ask" } ] }', $utf8)
    if ((Get-PolicyDecision (Read-PolicyMatrix $temp) 'regular' 'external.send' 'self' $null).effect -cne 'ask') { $failures.Add('ask harus menang atas allow') }

    # Matriks rusak harus ditolak, bukan diabaikan.
    [IO.File]::WriteAllText($temp, '{ "version": 1, "rules": [ { "zone": "cloud", "action": "local.status", "resource": "self", "effect": "allow" } ] }', $utf8)
    $threw = $false
    try { Read-PolicyMatrix $temp | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('zona tak dikenal harus ditolak') }
    [IO.File]::WriteAllText($temp, '{ "version": 99, "rules": [] }', $utf8)
    $threw = $false
    try { Read-PolicyMatrix $temp | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('versi matriks tak dikenal harus ditolak') }
    [IO.File]::WriteAllText($temp, '{ rusak', $utf8)
    $threw = $false
    try { Read-PolicyMatrix $temp | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('JSON rusak harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Policy engine self-check passed: default deny, batas case-zone, precedence deny>ask>allow, dan penolakan matriks rusak.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}

if ($List) {
  $matrix = Read-PolicyMatrix $MatrixPath
  if ($null -eq $matrix) { [pscustomobject]@{ matrix = $MatrixPath; rules = @(); note = 'matriks tidak ada: semua deny' } | ConvertTo-Json -Depth 5; exit 0 }
  [pscustomobject]@{ matrix = $MatrixPath; count = @($matrix.rules).Count; rules = @($matrix.rules); executable = $false } | ConvertTo-Json -Depth 6
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Zone) -or [string]::IsNullOrWhiteSpace($Operation)) {
  [Console]::Error.WriteLine('Pemakaian: -Zone <case|regular> -Operation <aksi> [-Resource <id>] [-Connector <id>] [-Matrix <berkas>] | -List | -SelfCheck')
  exit 1
}

try {
  Write-PolicyResult (Get-PolicyDecision (Read-PolicyMatrix $MatrixPath) $Zone $Operation $Resource $Connector)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
