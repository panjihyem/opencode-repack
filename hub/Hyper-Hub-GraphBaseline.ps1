[CmdletBinding()]
param(
  [string]$Baseline,
  [string]$GraphJson,
  [switch]$SelfCheck
)

# J-01: baseline relasi Hindsight vs graph. Karena server memori tidak tersedia di
# mesin ini, harness menyediakan format pertanyaan + skor presisi/recall yang bisa
# diisi dari hasil recall nyata. Tujuannya mencegah "graph lebih baik" tanpa angka.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-QuestionSet([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { throw "Set pertanyaan tidak ada: $Path" }
  $doc = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path, $utf8))
  if ($null -eq $doc.questions -or $doc.questions -isnot [array]) { throw 'Format salah: questions harus array.' }
  $issues = @()
  $ids = @()
  foreach ($q in $doc.questions) {
    if ([string]::IsNullOrWhiteSpace([string]$q.id)) { $issues += 'pertanyaan tanpa id'; continue }
    if ($ids -contains [string]$q.id) { $issues += "id duplikat: $($q.id)" }
    $ids += [string]$q.id
    if ([string]::IsNullOrWhiteSpace([string]$q.question)) { $issues += "$($q.id): pertanyaan kosong" }
    if ($null -eq $q.expected -or @($q.expected).Count -eq 0) { $issues += "$($q.id): expected wajib" }
  }
  return [pscustomobject]@{ questions = @($doc.questions); issues = @($issues) }
}

function New-Baseline([string]$Path) {
  # 50 pertanyaan relasi lintas regulasi/project; semua data non-sensitif.
  $template = @(
    'Apa syarat pemeriksaan pajak menurut PMK terbaru?'
    'Bagaimana hubungan PMK tentang pemeriksaan dan UU KUP?'
    'Dokumen mana yang mengatur sanksi administrasi bunga?'
    'Apa perbedaan PMK 184/2015 dan PMK terbaru soal pemeriksaan?'
    'Bagaimana alur keberatan dan banding menurut UU KUP?'
    'Regulasi mana yang mengatur bukper?'
    'Apa kaitan NPWP dengan UU HPP?'
    'Dokumen mana yang mengatur pemeriksaan bukper?'
    'Apa syarat WP kriteria tertentu?'
    'Bagaimana prosedur pemeriksaan kantor?'
    'Apa dasar hukum penyitaan?'
    'Regulasi mana tentang penagihan aktif?'
    'Bagaimana hubungan surat teguran dan surat paksa?'
    'Apa itu SP2DK menurut SE terkait?'
    'Dokumen mana yang mengatur SMK?'
    'Apa prosedur pengembalian pendahuluan?'
    'Bagaimana kaitan PPN dan PKP?'
    'Regulasi mana tentang e-Faktur?'
    'Apa dasar penetapan PPh badan?'
    'Bagaimana kaitan transfer pricing dan PMK terkait?'
    'Dokumen mana yang mengatur pemeriksaan ulang?'
    'Apa syarat pengajuan keberatan?'
    'Bagaimana batas waktu penyelesaian keberatan?'
    'Regulasi mana tentang pembukuan?'
    'Apa kaitan kewajiban pembukuan dan pemeriksaan?'
    'Dokumen mana tentang dokumen yang disita?'
    'Bagaimana kaitan audit dan peminjaman dokumen?'
    'Apa dasar penyegelan?'
    'Regulasi mana tentang pejabat fungsional pemeriksa?'
    'Apa hubungan pemeriksaan dan penetapan?'
    'Dokumen mana yang mengatur gugatan?'
    'Apa syarat banding?'
    'Regulasi mana tentang PPh final UMKM?'
    'Bagaimana kaitan PP tarif dan UU HPP?'
    'Dokumen mana yang mengatur pengadilan pajak?'
    'Apa hubungan audit internal dan temuan?'
    'Regulasi mana tentang konfirmasi bank?'
    'Apa dasar permintaan keterangan ahli?'
    'Dokumen mana yang mengatur pemeriksaan pabean?'
    'Bagaimana kaitan kepabeanan dan cukai?'
    'Apa prosedur pemeriksaan di luar kantor?'
    'Regulasi mana tentang hak WP mendampingi?'
    'Apa dasar pengujian bukti?'
    'Dokumen mana yang mengatur skorsing?'
    'Bagaimana alur pengungkapan ketidakbenaran?'
    'Apa hubungan examination dan investigation?'
    'Regulasi mana tentang penyidikan tindak pidana?'
    'Apa dasar penindakan?'
    'Dokumen mana yang mengatur kegiatan pengawasan?'
    'Bagaimana ringkasan 14 hari pilot dikaitkan ke temuan regulasi?'
  )
  $questions = @()
  $i = 0
  foreach ($q in $template) {
    $i++
    $questions += [pscustomobject]@{ id = ('Q{0:D2}' -f $i); question = $q; expected = @('sumber-tajuk)') }
  }
  $doc = [pscustomobject]@{ dataset = 'baseline-relasi'; createdAtUtc = [DateTime]::UtcNow.ToString('o'); questions = $questions }
  [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject $doc -Depth 6), $utf8)
  return $doc
}

function Measure-Set($Dataset, $Labels) {
  # Labels: map id -> @{ hindsight = bool; graph = bool }
  $hitsH = 0; $hitsG = 0; $expectedTotal = 0
  foreach ($q in $Dataset.questions) {
    $label = $Labels.($q.id)
    if ($null -eq $label) { continue }
    $expectedTotal++
    if ($label.hindsight -eq $true) { $hitsH++ }
    if ($label.graph -eq $true) { $hitsG++ }
  }
  if ($expectedTotal -eq 0) { throw 'Tidak ada label; baseline tidak bisa diukur.' }
  return [pscustomobject]@{ labelled = $expectedTotal; hindsight = $hitsH; graph = $hitsG; hindsightPrecision = [Math]::Round($hitsH / $expectedTotal, 4); graphPrecision = [Math]::Round($hitsG / $expectedTotal, 4) }
}

if ($SelfCheck) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('graph-' + [Guid]::NewGuid().ToString('N'))
  $failures = New-Object System.Collections.Generic.List[string]
  try {
    [void][IO.Directory]::CreateDirectory($temp)
    $path = Join-Path $temp 'baseline.json'
    $doc = New-Baseline $path
    if (@($doc.questions).Count -ne 50) { $failures.Add("baseline harus 50 pertanyaan, dapat $(@($doc.questions).Count)") }

    $set = Read-QuestionSet $path
    if ($set.issues.Count -ne 0) { $failures.Add("baseline invalid: $($set.issues -join '; ')") }

    $labels = @{}
    foreach ($q in $doc.questions) { $labels[$q.id] = [pscustomobject]@{ hindsight = $true; graph = $false } }
    $score = Measure-Set $doc $labels
    if ($score.hindsight -ne 50 -or $score.graph -ne 0) { $failures.Add('skor baseline salah') }
    if ($score.hindsightPrecision -ne 1) { $failures.Add('presisi hindsight harus 1') }

    $partial = @{ Q01 = [pscustomobject]@{ hindsight = $true; graph = $true } }
    $score2 = Measure-Set $doc $partial
    if ($score2.labelled -ne 1 -or $score2.graph -ne 1) { $failures.Add('label parsial harus dihitung benar') }

    $threw = $false
    try { Measure-Set $doc @{} | Out-Null } catch { $threw = $true }
    if (-not $threw) { $failures.Add('tanpa label harus gagal, bukan lulus diam-diam') }

    $bad = Join-Path $temp 'bad.json'
    [IO.File]::WriteAllText($bad, '{"questions":[{"id":"Q01"}]}', $utf8)
    if ((Read-QuestionSet $bad).issues.Count -eq 0) { $failures.Add('pertanyaan tanpa isi harus ditolak') }

    if ($failures.Count -gt 0) { $failures | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 1 }
    'Graph baseline self-check passed: 50 pertanyaan, skor jujur, label parsial, tanpa label gagal.'
    exit 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ([string]::IsNullOrWhiteSpace($Baseline)) { [Console]::Error.WriteLine('Pemakaian: -Baseline <baseline.json> [-GraphJson <json>] | -SelfCheck; gunakan -Baseline <path> untuk membuat baseline baru bila belum ada.'); exit 1 }
if (-not [IO.File]::Exists($Baseline)) { New-Baseline $Baseline | Out-Null }
$set = Read-QuestionSet $Baseline
if ($set.issues.Count -gt 0) { $set.issues | ForEach-Object { [Console]::Error.WriteLine($_) }; exit 2 }
[pscustomobject]@{ baseline = $Baseline; questions = @($set.questions).Count; valid = $true } | ConvertTo-Json -Depth 4
exit 0
