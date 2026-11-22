[CmdletBinding()]
param([switch]$SelfCheck)

# Redaksi pola PII sebelum teks keluar dari zona case (D-09).
# ponytail: hanya pola deterministik (NIK, NPWP, telepon, email, rekening, alamat jalan, secret).
# Nama orang butuh NER; jangan klaim D-09 penuh sampai model lokal terbukti. Over-redaksi
# disengaja: salah menandai lebih aman daripada meloloskan data kasus.

$ErrorActionPreference = 'Stop'

$script:PiiRules = @(
  @{ name = 'secret'; pattern = '(?i)\b(?:gh[pousr]_[A-Za-z0-9]{10,}|xox[abps]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{12,}|sk-[A-Za-z0-9_-]{10,})\b' }
  @{ name = 'secret'; pattern = '(?i)\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*\S+' }
  @{ name = 'secret'; pattern = '(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}' }
  @{ name = 'secret'; pattern = '(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----' }
  @{ name = 'email'; pattern = '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+' }
  @{ name = 'npwp'; pattern = '(?<!\d)\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}(?!\d)' }
  @{ name = 'nik'; pattern = '(?<!\d)\d{16}(?!\d)' }
  @{ name = 'phone'; pattern = '(?<!\d)(?:\+62|62|0)[\s-]?8[\d\s-]{6,12}\d(?!\d)' }
  @{ name = 'account'; pattern = '(?<!\d)\d{3,4}(?:[\s-]\d{3,4}){2,4}(?!\d)' }
  @{ name = 'address'; pattern = '(?i)\b(?:Jl\.?|Jalan|Gg\.?|Gang|Kel\.?|Kec\.?)\s+[A-Za-z0-9][^\r\n,;]{2,58}' }
)

function Protect-Text {
  param([AllowEmptyString()][string]$Text)

  $map = New-Object System.Collections.Specialized.OrderedDictionary
  $counts = [ordered]@{}
  $total = 0
  foreach ($rule in $script:PiiRules) {
    $matches = [regex]::Matches($Text, $rule.pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($matches.Count -eq 0) { continue }
    $builder = New-Object System.Text.StringBuilder
    $position = 0
    $index = 0
    foreach ($match in $matches) {
      [void]$builder.Append($Text, $position, $match.Index - $position)
      $index++
      $token = "[[REDACTED:$($rule.name):$index]]"
      $map[$token] = $match.Value
      [void]$builder.Append($token)
      $position = $match.Index + $match.Length
    }
    [void]$builder.Append($Text, $position, $Text.Length - $position)
    $Text = $builder.ToString()
    $counts[$rule.name] = [int]$counts[$rule.name] + $matches.Count
    $total += $matches.Count
  }

  return [pscustomobject]@{
    text = $Text
    count = $total
    counts = [pscustomobject]$counts
    level = if ($total -gt 0) { 'pattern' } else { 'none' }
    map = $map
  }
}

if ($SelfCheck) {
  $failures = @()
  $cases = @(
    @{ name = 'NIK'; input = 'NIK 3201234567890001 terlampir'; expect = @('nik'); absent = @('3201234567890001') }
    @{ name = 'NIK di tengah kalimat'; input = 'pemilik 3201234567890001 dan 3201234567890002'; expect = @('nik'); absent = @('320123456789000') }
    @{ name = 'NPWP lama'; input = 'NPWP 09.123.456.7-012.000 wajib'; expect = @('npwp'); absent = @('09.123.456.7-012.000') }
    @{ name = 'telepon 08'; input = 'hubungi 081234567890 besok'; expect = @('phone'); absent = @('081234567890') }
    @{ name = 'telepon +62 berspasi'; input = 'wa +62 812-3456-7890 ya'; expect = @('phone'); absent = @('812-3456-7890') }
    @{ name = 'telepon 628'; input = 'nomor 6281234567890 aktif'; expect = @('phone'); absent = @('6281234567890') }
    @{ name = 'email'; input = 'kirim ke budi.santoso@contoh.co.id segera'; expect = @('email'); absent = @('budi.santoso@contoh.co.id') }
    @{ name = 'api key'; input = 'api_key = rahasia123'; expect = @('secret'); absent = @('rahasia123') }
    @{ name = 'bearer'; input = 'Authorization: bearer abcdef123456'; expect = @('secret'); absent = @('abcdef123456') }
    @{ name = 'GitHub token'; input = 'token ghp_abcdefghijklmnop1234 bocor'; expect = @('secret'); absent = @('ghp_abcdefghijklmnop1234') }
    @{ name = 'AWS key'; input = 'AKIAIOSFODNN7EXAMPLE dipakai'; expect = @('secret'); absent = @('AKIAIOSFODNN7EXAMPLE') }
    @{ name = 'rekening berspasi'; input = 'rek 123 456 789 012 bank'; expect = @('account'); absent = @('123 456 789 012') }
    @{ name = 'rekening berdash'; input = 'rek 1234-5678-9012 bank'; expect = @('account'); absent = @('1234-5678-9012') }
    @{ name = 'alamat jalan'; input = 'tinggal di Jl. Merdeka No. 10 Jakarta'; expect = @('address'); absent = @('Jl. Merdeka No. 10 Jakarta') }
    @{ name = 'password'; input = 'password: hunter2xyz'; expect = @('secret'); absent = @('hunter2xyz') }
    @{ name = 'private key'; input = "-----BEGIN RSA PRIVATE KEY-----`nMIIEow`n-----END RSA PRIVATE KEY-----"; expect = @('secret'); absent = @('MIIEow') }
    @{ name = 'tahun tidak diredaksi'; input = 'tahun 2026 anggaran'; expect = @(); absent = @('[[REDACTED') }
    @{ name = 'tanggal tidak diredaksi'; input = 'tanggal 2026-11-22 rapat'; expect = @(); absent = @('[[REDACTED') }
    @{ name = 'nominal tidak diredaksi'; input = 'nilai Rp 1.500.000 lunas'; expect = @(); absent = @('[[REDACTED') }
    @{ name = 'teks bersih'; input = 'laporan pemeriksaan selesai'; expect = @(); absent = @('[[REDACTED') }
  )

  foreach ($case in $cases) {
    $result = Protect-Text $case.input
    $seen = @($result.counts.PSObject.Properties | ForEach-Object { $_.Name })
    foreach ($kind in $case.expect) {
      if ($seen -notcontains $kind) { $failures += "$($case.name): pola $kind tidak terdeteksi" }
    }
    foreach ($secret in $case.absent) {
      if ($result.text.Contains($secret)) { $failures += "$($case.name): '$secret' lolos ke teks" }
    }
    if ($case.expect.Count -eq 0 -and $result.count -ne 0) { $failures += "$($case.name): redaksi palsu ($($result.count))" }
    if ($result.map.Count -ne $result.count) { $failures += "$($case.name): jumlah token map tidak konsisten" }
    foreach ($key in $result.map.Keys) { if ($result.text.Contains($result.map[$key]) -and $result.map[$key].Length -gt 5) { $failures += "$($case.name): token map bocor ke teks" } }
    $twice = Protect-Text $result.text
    if ($twice.text -cne $result.text) { $failures += "$($case.name): redaksi tidak idempoten" }
  }

  if ($failures.Count -gt 0) {
    $failures | ForEach-Object { [Console]::Error.WriteLine($_) }
    exit 1
  }
  "Redaction self-check passed: $($cases.Count) kasus, pola deterministik; nama orang belum dicakup (butuh NER)."
  exit 0
}

if ($MyInvocation.InvocationName -ne '.') {
  [Console]::Error.WriteLine('Pemakaian: -SelfCheck, atau dot-source lalu panggil Protect-Text <teks>')
  exit 1
}
