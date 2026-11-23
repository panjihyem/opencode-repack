[CmdletBinding()]
param(
  [string]$Graph,
  [string]$Sources,
  [switch]$SelfCheck
)

# J-02: kontrak graph memory (Graphiti + Neo4j/FalkorDB) tanpa memasang database.
# Yang diuji di sini: setiap node/edge wajib punya provenance ke sumber yang ada,
# tanggal valid, dan tidak ada data zona kasus. Endpoint database tidak disentuh.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Test-Date([string]$Value) {
  $date = [DateTime]::MinValue
  if (-not [DateTime]::TryParse($Value, [ref]$date)) { return $null }
  return $date.ToUniversalTime()
}

function Get-GraphIssues($Document, [string[]]$KnownSources) {
  $issues = @()
  if ($null -eq $Document) { return @('graph kosong') }
  if ($null -eq $Document.nodes -or $Document.nodes -isnot [array]) { return @('nodes harus array') }
  if ($null -eq $Document.edges -or $Document.edges -isnot [array]) { return @('edges harus array') }
  if (@($Document.nodes).Count -eq 0) { $issues += 'graph tanpa node' }

  $ids = @{}
  foreach ($node in @($Document.nodes)) {
    $nodeId = [string]$node.id
    if ([string]::IsNullOrWhiteSpace($nodeId)) { $issues += 'node tanpa id'; continue }
    if ($ids.ContainsKey($nodeId)) { $issues += "node id duplikat: $nodeId" }
    $ids[$nodeId] = $true
    if ([string]::IsNullOrWhiteSpace([string]$node.label)) { $issues += "${nodeId}: label wajib" }
    if ([string]::IsNullOrWhiteSpace([string]$node.source)) { $issues += "${nodeId}: source wajib (provenance)" ; continue }
    if ($KnownSources.Count -gt 0 -and $KnownSources -notcontains [string]$node.source) { $issues += "${nodeId}: source tidak ada di daftar sumber: $($node.source)" }
    if ($null -eq (Test-Date ([string]$node.validFrom))) { $issues += "${nodeId}: validFrom tidak sah" }
    if ([string]$node.zone -and [string]$node.zone -cne 'regular') { $issues += "${nodeId}: zona selain regular tidak boleh masuk graph" }
  }
  foreach ($edge in @($Document.edges)) {
    $from = [string]$edge.from
    $to = [string]$edge.to
    if (-not $ids.ContainsKey($from)) { $issues += "edge from tidak ada: $from" }
    if (-not $ids.ContainsKey($to)) { $issues += "edge to tidak ada: $to" }
    if ([string]::IsNullOrWhiteSpace([string]$edge.relation)) { $issues += "edge ${from}->${to}: relation wajib" }
    if ([string]::IsNullOrWhiteSpace([string]$edge.source)) { $issues += "edge ${from}->${to}: source wajib (provenance)" }
    elseif ($KnownSources.Count -gt 0 -and $KnownSources -notcontains [string]$edge.source) { $issues += "edge ${from}->${to}: source tidak terdaftar" }
    if ($null -eq (Test-Date ([string]$edge.validFrom))) { $issues += "edge ${from}->${to}: validFrom tidak sah" }
  }
  return @($issues)
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('graphdb-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $knownList = @('general/regulasi/pmk-1.md', 'general/regulasi/uu-kup.md')
    $graphDoc = [pscustomobject]@{
      nodes = @(
        [pscustomobject]@{ id = 'n1'; label = 'PMK 1/2026'; source = 'general/regulasi/pmk-1.md'; validFrom = '2026-01-01'; zone = 'regular' }
        [pscustomobject]@{ id = 'n2'; label = 'UU KUP'; source = 'general/regulasi/uu-kup.md'; validFrom = '2021-10-29'; zone = 'regular' }
      )
      edges = @([pscustomobject]@{ from = 'n1'; to = 'n2'; relation = 'mengubah'; source = 'general/regulasi/pmk-1.md'; validFrom = '2026-01-01' })
    }
    if ((Get-GraphIssues $graphDoc $knownList).Count -ne 0) { $failures.Add("graph sah ditolak: $((Get-GraphIssues $graphDoc $knownList) -join '; ')") }

    $bad = $graphDoc.PSObject.Copy()
    $bad.nodes = @($graphDoc.nodes[0], [pscustomobject]@{ id = 'n3'; label = 'Tanpa Sumber'; validFrom = '2026-01-01' })
    if ((Get-GraphIssues $bad $knownList).Count -eq 0) { $failures.Add('node tanpa source harus ditolak') }

    $bad = $graphDoc.PSObject.Copy()
    $bad.nodes = @($graphDoc.nodes[0], [pscustomobject]@{ id = 'n2'; label = 'X'; source = 'general/regulasi/uu-kup.md'; validFrom = 'kemarin' })
    if ((Get-GraphIssues $bad $knownList).Count -eq 0) { $failures.Add('tanggal tidak sah harus ditolak') }

    $bad = $graphDoc.PSObject.Copy()
    $bad.nodes = @([pscustomobject]@{ id = 'n1'; label = 'Kasus A'; source = 'general/regulasi/pmk-1.md'; validFrom = '2026-01-01'; zone = 'case' })
    $bad.edges = @()
    if ((Get-GraphIssues $bad $knownList).Count -eq 0) { $failures.Add('zona case tidak boleh masuk graph') }

    $bad = $graphDoc.PSObject.Copy()
    $bad.edges = @([pscustomobject]@{ from = 'n1'; to = 'hilang'; relation = 'x'; source = 'general/regulasi/pmk-1.md'; validFrom = '2026-01-01' })
    if ((Get-GraphIssues $bad $knownList).Count -eq 0) { $failures.Add('edge ke node tak ada harus ditolak') }

    $bad = $graphDoc.PSObject.Copy()
    $bad.nodes = @([pscustomobject]@{ id = 'n1'; label = 'A'; source = 'luar.md'; validFrom = '2026-01-01' })
    $bad.edges = @()
    if ((Get-GraphIssues $bad $knownList).Count -eq 0) { $failures.Add('source tak terdaftar harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Graph contract self-check passed: provenance wajib, tanggal valid, tanpa zona kasus, edge konsisten.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Graph)) { [Console]::Error.WriteLine('Pemakaian: -Graph <graph.json> [-Sources <sources.json>] | -SelfCheck'); exit 1 }
$document = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Graph, $utf8))
$known = @()
if (-not [string]::IsNullOrWhiteSpace($Sources) -and [IO.File]::Exists($Sources)) {
  $sourceDoc = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Sources, $utf8))
  $known = @($sourceDoc.sources)
}
$issues = Get-GraphIssues $document $known
[pscustomobject]@{ graph = $Graph; nodes = @($document.nodes).Count; edges = @($document.edges).Count; valid = (@($issues).Count -eq 0); issues = @($issues) } | ConvertTo-Json -Depth 4
if (@($issues).Count -gt 0) { exit 2 }
exit 0
