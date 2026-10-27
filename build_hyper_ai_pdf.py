from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether, HRFlowable, NextPageTemplate, Image)
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from xml.sax.saxutils import escape
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = r"C:\Users\User\Documents\Hyper-AI-OTA\Hyper-AI-Features.pdf"
ASSET_DIR = r"C:\Users\User\AppData\Local\Temp\hyper-ai-features-assets"
os.makedirs(ASSET_DIR, exist_ok=True)
FONT = r"C:\Windows\Fonts\arial.ttf"
BOLD = r"C:\Windows\Fonts\arialbd.ttf"
ITALIC = r"C:\Windows\Fonts\ariali.ttf"
pdfmetrics.registerFont(TTFont("Arial", FONT))
pdfmetrics.registerFont(TTFont("Arial-Bold", BOLD))
pdfmetrics.registerFont(TTFont("Arial-Italic", ITALIC))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic", boldItalic="Arial-Bold")

NAVY = colors.HexColor("#142640")
BLUE = colors.HexColor("#2463A6")
CYAN = colors.HexColor("#18A6A6")
PALE = colors.HexColor("#EEF4FA")
INK = colors.HexColor("#243247")
MUTED = colors.HexColor("#58677A")
GOLD = colors.HexColor("#D9A441")
RED = colors.HexColor("#9B3434")
GREEN = colors.HexColor("#24724B")
PAGE_W, PAGE_H = A4

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", fontName="Arial-Bold", fontSize=30, leading=37, textColor=colors.white, alignment=TA_LEFT, spaceAfter=10))
styles.add(ParagraphStyle(name="CoverSub", fontName="Arial", fontSize=14, leading=22, textColor=colors.HexColor("#D9E7F5"), spaceAfter=12))
styles.add(ParagraphStyle(name="H1x", fontName="Arial-Bold", fontSize=20, leading=25, textColor=NAVY, spaceBefore=8, spaceAfter=10, keepWithNext=True))
styles.add(ParagraphStyle(name="H2x", fontName="Arial-Bold", fontSize=13, leading=17, textColor=BLUE, spaceBefore=9, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name="Bodyx", fontName="Arial", fontSize=9.2, leading=14, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName="Arial", fontSize=7.5, leading=10, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="Bulletx", fontName="Arial", fontSize=9, leading=13.3, leftIndent=13, firstLineIndent=-8, bulletIndent=0, textColor=INK, spaceAfter=3))
styles.add(ParagraphStyle(name="TableHeadx", fontName="Arial-Bold", fontSize=7.6, leading=10, textColor=colors.white))
styles.add(ParagraphStyle(name="Tablex", fontName="Arial", fontSize=7.3, leading=10, textColor=INK))
styles.add(ParagraphStyle(name="Calloutx", fontName="Arial-Bold", fontSize=9, leading=13, textColor=NAVY, backColor=PALE, borderColor=BLUE, borderWidth=.7, borderPadding=8, spaceBefore=4, spaceAfter=9))
styles.add(ParagraphStyle(name="TOCx", fontName="Arial", fontSize=10.5, leading=17, textColor=INK, leftIndent=7, spaceAfter=2))

def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])

def bullet(text):
    return Paragraph("• " + text, styles["Bulletx"])

def table(headers, rows, widths, repeatRows=1):
    data = [[P(escape(str(x)), "TableHeadx") for x in headers]]
    for row in rows:
        data.append([P(str(x), "Tablex") for x in row])
    t = Table(data, colWidths=widths, repeatRows=repeatRows, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, PALE]),
        ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#CCD7E2")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    return t

def section(title, lead=None):
    out = [P(title, "H1x"), HRFlowable(width="100%", thickness=1.3, color=CYAN, spaceAfter=8)]
    if lead:
        out.append(P(lead))
    return out

def save_illustrations():
    plt.rcParams.update({"font.family": "Arial", "font.size": 9, "axes.titlesize": 12, "axes.labelsize": 9,
                         "axes.edgecolor": "#C8D3DF", "axes.labelcolor": "#243247", "text.color": "#243247",
                         "xtick.color": "#58677A", "ytick.color": "#58677A", "figure.facecolor": "white",
                         "axes.facecolor": "white"})
    # Product architecture infographic: deliberately illustrative, no external data.
    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 5); ax.axis("off")
    boxes=[(0.25,3.1,2.0,1.1,"PENGGUNA\nSesi • Proyek • File","#142640"),
           (2.8,3.1,2.0,1.1,"AGEN HYPER AI\nRencana • Tool • Delegasi","#2463A6"),
           (5.35,3.1,2.0,1.1,"PILIHAN MODEL\nCloud • Router • Lokal","#18A6A6"),
           (7.85,3.1,1.9,1.1,"HASIL\nJawaban • Draf • Aksi","#24724B"),
           (1.0,.55,2.25,1.15,"KNOWLEDGE TREE\nRegulasi • Project • Template","#4A698B"),
           (3.85,.55,2.25,1.15,"MEMORY LAYER\nIngest • Recall • Bank","#7556A5"),
           (6.7,.55,2.25,1.15,"ALAT LOKAL\nDocling • Office • Kasus","#B87922")]
    from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
    for x,y,w,h,label,color in boxes:
        ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle="round,pad=0.06,rounding_size=0.12",facecolor=color,edgecolor="none"))
        ax.text(x+w/2,y+h/2,label,ha="center",va="center",color="white",fontsize=8.5,fontweight="bold")
    for a,b in [((2.25,3.65),(2.8,3.65)),((4.8,3.65),(5.35,3.65)),((7.35,3.65),(7.85,3.65)),((3.9,3.1),(2.45,1.7)),((4.2,3.1),(4.95,1.7)),((5.8,3.1),(7.75,1.7))]:
        ax.add_patch(FancyArrowPatch(a,b,arrowstyle="-|>",mutation_scale=12,color="#8092A8",lw=1.3,connectionstyle="arc3,rad=0.02"))
    ax.text(5,4.65,"ARSITEKTUR KERJA HYPER AI",ha="center",fontsize=14,fontweight="bold",color="#142640")
    ax.text(5,.05,"Ilustrasi konseptual • koneksi model dan data mengikuti konfigurasi serta persetujuan pengguna",ha="center",fontsize=7,color="#58677A")
    arch=os.path.join(ASSET_DIR,"arsitektur.png"); fig.savefig(arch,dpi=190,bbox_inches="tight"); plt.close(fig)

    # Synthetic monthly chart.
    months=["Jan","Feb","Mar","Apr","Mei","Jun"]
    series={"Ekstraksi dokumen":[32,38,35,49,55,63],"Pembuatan laporan":[18,22,28,27,36,43],"Analisis data":[14,16,21,25,31,34]}
    fig,ax=plt.subplots(figsize=(8.6,4.3))
    palette=["#2463A6","#18A6A6","#D9A441"]
    for (name,vals),color in zip(series.items(),palette): ax.plot(months,vals,marker="o",lw=2.5,ms=5,label=name,color=color)
    ax.set_title("Contoh chart garis • beban kerja bulanan (data sintetis)",loc="left",fontweight="bold",color="#142640",pad=12)
    ax.set_ylabel("Jumlah pekerjaan (ilustratif)"); ax.grid(axis="y",color="#E5EBF1",lw=.8); ax.spines[["top","right"]].set_visible(False)
    ax.legend(frameon=False,ncol=3,loc="upper left"); ax.text(0,-.22,"Sumber: angka sintetis untuk demonstrasi; bukan statistik pengguna atau kinerja produk.",transform=ax.transAxes,fontsize=7,color="#58677A")
    line=os.path.join(ASSET_DIR,"contoh-tren.png"); fig.savefig(line,dpi=190,bbox_inches="tight"); plt.close(fig)

    # Synthetic comparison bar chart.
    labels=["Validasi formula","Ekstraksi OCR","Draf laporan","Review manusia"]
    vals=[92,84,76,100]
    fig,ax=plt.subplots(figsize=(8.6,4.2))
    bars=ax.barh(labels,vals,color=["#2463A6","#18A6A6","#D9A441","#24724B"],height=.58)
    ax.invert_yaxis(); ax.set_xlim(0,110); ax.set_xlabel("Skor contoh (0–100; ilustratif)")
    ax.set_title("Contoh chart batang • matriks pemeriksaan sintetis",loc="left",fontweight="bold",color="#142640",pad=12)
    ax.grid(axis="x",color="#E5EBF1",lw=.8); ax.set_axisbelow(True); ax.spines[["top","right","left"]].set_visible(False)
    for bar,val in zip(bars,vals): ax.text(val+1,bar.get_y()+bar.get_height()/2,str(val),va="center",fontweight="bold",color="#243247")
    ax.text(0,-.17,"Bukan benchmark Hyper AI; sekadar contoh anotasi nilai dan skala chart.",transform=ax.transAxes,fontsize=7,color="#58677A")
    barfile=os.path.join(ASSET_DIR,"contoh-batang.png"); fig.savefig(barfile,dpi=190,bbox_inches="tight"); plt.close(fig)

    # Synthetic donut, simple composition.
    labels=["Analisis lokal","Model/provider","Review & validasi","Dokumen/visual"]
    vals=[35,30,20,15]
    fig,ax=plt.subplots(figsize=(7.4,4.1))
    wedges,_=ax.pie(vals,startangle=90,counterclock=False,colors=["#2463A6","#18A6A6","#D9A441","#7556A5"],wedgeprops={"width":.42,"edgecolor":"white","linewidth":2})
    ax.text(0,.06,"100%",ha="center",va="center",fontsize=19,fontweight="bold",color="#142640")
    ax.text(0,-.16,"contoh",ha="center",va="center",fontsize=8,color="#58677A")
    ax.legend(wedges,[f"{n} • {v}%" for n,v in zip(labels,vals)],loc="center left",bbox_to_anchor=(.98,.5),frameon=False,fontsize=8)
    ax.set_title("Contoh chart komposisi • ilustrasi pembagian aktivitas",loc="left",fontweight="bold",color="#142640",pad=12)
    ax.text(-1.1,-1.25,"Proporsi sintetis, bukan telemetri atau ukuran performa produk.",fontsize=7,color="#58677A")
    donut=os.path.join(ASSET_DIR,"contoh-komposisi.png"); fig.savefig(donut,dpi=190,bbox_inches="tight"); plt.close(fig)
    return arch,line,barfile,donut

ARCH_IMG, LINE_IMG, BAR_IMG, DONUT_IMG = save_illustrations()

def pic(file, width, caption):
    image=Image(file, width=width, height=width*.49, kind="proportional")
    return KeepTogether([image, Spacer(1,2), P(caption,"Smallx")])

def draw_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(BLUE)
    canvas.circle(PAGE_W-2*mm, PAGE_H-5*mm, 76*mm, stroke=0, fill=1)
    canvas.setFillColor(CYAN)
    canvas.circle(PAGE_W+8*mm, PAGE_H+3*mm, 52*mm, stroke=0, fill=1)
    canvas.setFillColor(colors.Color(1,1,1,alpha=.08))
    canvas.roundRect(18*mm, 22*mm, PAGE_W-36*mm, 38*mm, 5*mm, stroke=0, fill=1)
    canvas.setStrokeColor(colors.Color(1,1,1,alpha=.3))
    canvas.setLineWidth(1)
    for i in range(5):
        x=24*mm+i*15*mm
        canvas.line(x, 69*mm, x+9*mm, 69*mm)
        canvas.circle(x,69*mm,1.5*mm,stroke=1,fill=0)
    canvas.restoreState()

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9E2EC"))
    canvas.setLineWidth(.5)
    canvas.line(17*mm, 15*mm, PAGE_W-17*mm, 15*mm)
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(17*mm, 10*mm, "HYPER AI  |  Panduan fitur dan kapabilitas")
    canvas.drawRightString(PAGE_W-17*mm, 10*mm, f"{doc.page}")
    canvas.restoreState()

class MyDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, rightMargin=17*mm, leftMargin=17*mm, topMargin=18*mm, bottomMargin=21*mm,
           title="Hyper AI Features", author="Hyper AI")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        cover_frame = Frame(21*mm, 30*mm, PAGE_W-42*mm, PAGE_H-60*mm, id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="Cover", frames=cover_frame, onPage=draw_cover), PageTemplate(id="Body", frames=frame, onPage=header_footer)])

story=[]
# Cover
story += [Spacer(1, 34*mm), P("PAPARAN PRODUK", "CoverSub"), P("Hyper AI<br/>Features", "CoverTitle"),
          P("Asisten kerja berbasis AI untuk analisis, dokumen, pengetahuan, memori, dan alur kasus — dengan kendali lokal serta pilihan model yang fleksibel.", "CoverSub"),
          Spacer(1, 18*mm), P("PANDUAN PRODUK • KAPABILITAS • KEAMANAN • ALUR KERJA", "CoverSub"),
          Spacer(1, 55*mm), P("Edisi 1.0  |  25 Oktober 2026<br/>Panduan untuk pimpinan, analis, tim operasional, dan pengguna teknis", "CoverSub"),
          NextPageTemplate("Body"), PageBreak()]

story += section("Ringkasan eksekutif", "Hyper AI menyatukan antarmuka agen AI, koneksi model, alat produktivitas lokal, ekstraksi dokumen, basis pengetahuan, memori lintas sesi, visualisasi, serta alur kasus sensitif dalam satu lingkungan kerja desktop.")
story += [P("Nilai utamanya bukan klaim bahwa semua data selalu lokal atau otomatis aman. Nilainya ada pada pemisahan yang jelas: model cloud memberi kemampuan analisis; komponen lokal menangani banyak pekerjaan file dan data; knowledge/memory membantu kesinambungan; dan Hyper Case Secure memberi alur redaksi eksplisit sebelum bahan kasus dipakai. Pengguna tetap memilih data yang dikirim, model yang digunakan, dan hasil yang disahkan."),
          P("Panduan ini menginventarisasi fitur yang dibangun atau didukung paket Hyper AI. Ketersediaan sejumlah fitur bergantung pada komponen opsional yang dipilih saat setup, konektivitas, provider, izin sistem, dan konfigurasi organisasi.", "Calloutx"),
          P("Isi dokumen", "H2x")]
toc=["1. Gambaran produk dan arsitektur", "2. Model, provider, dan fleksibilitas", "3. Memory layer dan knowledge tree", "4. Dokumen dan produktivitas Office", "5. Excel dan formula secara mendalam", "6. Pembuatan dokumen dan template", "7. Chart studio: metode dan contoh", "8. Skills dan modul kerja", "9. Hyper Case Secure dan templating kasus", "10. Orkestrasi agen dan multi-agent", "11. Keamanan, privasi, dan tata kelola", "12. Contoh alur kerja lintas modul", "13. Matriks fitur dan kesiapan", "14. Batas, risiko, dan praktik implementasi", "15. Glosarium dan referensi produk"]
story += [P(escape(x), "TOCx") for x in toc]

story += [PageBreak()] + section("1. Gambaran produk dan arsitektur", "Hyper AI menyediakan satu ruang kerja yang menghubungkan antarmuka percakapan/agen dengan model, tool, dokumen, sumber pengetahuan, dan proses lokal.")
story += [P("Peta lapisan", "H2x"), table(["Lapisan", "Fungsi", "Contoh komponen"], [
    ("Antarmuka kerja", "Desktop lintas sistem operasi; sesi, proyek, titlebar, wizard setup, pengaturan model dan komponen.", "Aplikasi desktop, launcher CLI, deep link hyper-ai://"),
    ("Orkestrasi agen", "Menerjemahkan tujuan menjadi langkah, menggunakan tool, memanggil spesialis/subagent, memeriksa keluaran.", "Agent, tool registry, MCP, task/subagent, background job"),
    ("Model dan konektivitas", "Mengirim permintaan ke provider yang dipilih; router dapat menyediakan model utama dan failover.", "Provider cloud, router organisasi, LM Studio lokal opsional"),
    ("Memori dan pengetahuan", "Menyimpan knowledge bank dan memori sesi lintas pekerjaan; recall dapat menjadi konteks agen.", "Hindsight, bank general/sessions/project, Hyper-Knowledge"),
    ("Eksekusi lokal", "Mengolah file dan data di perangkat melalui Python dan tool produktivitas.", "Docling, Office toolkit, forensic.py, hyper-case, hyper viz"),
], [34*mm, 76*mm, 63*mm]), Spacer(1,6), P("Arsitektur konseptual", "H2x")]
arch=table(["Pengguna & proyek", "Agen Hyper AI", "Layanan/alat"], [
    ("Instruksi • sesi • file • knowledge", "Rencana → pilih model → tool → validasi → hasil", "Router/provider cloud • Hindsight lokal • MCP • Python lokal"),
], [49*mm,61*mm,63*mm])
story += [arch, Spacer(1,5), pic(ARCH_IMG, 158*mm, "Infografis 1. Arsitektur konseptual. Arah panah menggambarkan alur kerja umum, bukan jaminan lokasi pemrosesan semua data."), P("Alur tidak menghapus batas trust: permintaan model dapat keluar menuju router/provider; file yang dibuka tool dapat menghasilkan kutipan/konten yang masuk ke prompt; tool shell dapat mengakses jaringan. Untuk pekerjaan sensitif, klasifikasi, minimisasi, persetujuan, dan review tetap perlu dirancang di level proses.", "Calloutx"),
          P("Operasional desktop", "H2x"), bullet("Installer tersedia untuk Windows, macOS, dan Linux; arsitektur x64 dan arm64 sesuai target rilis."), bullet("Komponen besar ditawarkan secara opsional, diunduh dari penerbitnya dan dipasang dalam lingkungan Python terpisah."), bullet("Setup menampilkan Terms, Privacy, lisensi pihak ketiga, dan meminta persetujuan sebelum setup komponen dimulai."), bullet("Mode unattended/aksi tanpa dialog persetujuan bukan default yang direkomendasikan untuk proses sensitif; persetujuan penggunaan produk terpisah dari izin aksi agen."),
          PageBreak()]

story += section("2. Model, provider, dan fleksibilitas", "Pilih kualitas, biaya, latensi, privasi, dan ketersediaan secara sadar. Model cloud adalah jalur utama pada konfigurasi yang dijelaskan paket; model lokal adalah pilihan alternatif dengan batas kapabilitas sendiri.")
story += [table(["Pola", "Cara kerja", "Cocok untuk", "Perhatian"], [
    ("Cloud melalui provider/router", "Agen mengirim prompt dan konteks terpilih ke endpoint provider yang aktif.", "Analisis kompleks, model cepat/kuat, tugas umum.", "Isi prompt, lampiran, kutipan tool dapat diproses pihak luar."),
    ("Router dengan failover", "Endpoint yang dikonfigurasi dapat memilih model utama dan model pengganti.", "Ketahanan saat model utama tidak tersedia.", "Failover bukan jaminan privasi; semua target tetap harus disetujui."),
    ("LM Studio lokal", "Server model lokal dapat dijalankan di perangkat; model lokal dapat dipilih untuk skenario offline tertentu.", "Kebutuhan konektivitas rendah atau data yang disepakati tetap lokal.", "Bergantung RAM/CPU/GPU; mutu dan kecepatan tidak setara semua model cloud."),
], [35*mm,52*mm,47*mm,39*mm]),
          P("Komponen model lokal yang dicantumkan manifest", "H2x"), bullet("LM Studio dipasang dari penerbit resmi; unduhan komponen tidak didistribusikan ke dalam installer produk."), bullet("Model ringan Spark X2.5 4B quantized disediakan sebagai opsi. Model unduhan besar; pilih setelah menilai ruang disk dan kemampuan perangkat."), bullet("Wizard menyesuaikan rekomendasi model dengan RAM yang terdeteksi; pengguna dapat memilih alternatif yang tersedia."), bullet("Model lokal untuk agen bukan otomatis mode offline keseluruhan: pembaruan, MCP, pencarian, dan memori dapat memiliki ketergantungan jaringan terpisah."),
          P("Fleksibilitas konfigurasi", "H2x"), bullet("Provider, daftar model, dan kredensial dapat diperbarui melalui paket konfigurasi bertanda tangan; perubahan invalid ditolak sebagai satu kesatuan."), bullet("Paket konfigurasi managed dibatasi allowlist dan tidak boleh menyuntikkan plugin, skill, instruksi, command, MCP, atau paket provider sembarang."), bullet("Pengaturan pengguna tetap menjadi konteks kerja; komponen Hyper AI menandai konfigurasi terkelola agar tidak menganggap seluruh konfigurasi sebagai miliknya."),
          P("Istilah penting: 'lokal' dapat berarti file tersimpan/alat berjalan di komputer. Itu tidak selalu berarti inferensi, konsolidasi memori, sinkronisasi, atau seluruh permintaan tetap offline.", "Calloutx"), PageBreak()]

story += section("3. Memory layer dan knowledge tree", "Memory layer memberi kesinambungan antarsesi; knowledge tree mengorganisasi sumber yang dapat dirujuk. Keduanya berbeda: knowledge adalah bahan sumber, memory adalah ekstraksi/recall yang disimpan sebagai konteks.")
story += [P("Memory layer (Hindsight)", "H2x"), bullet("Layanan memori berjalan pada loopback lokal 127.0.0.1:8888; aplikasi mendaftarkan layanan sebagai integrasi memori."), bullet("Plugin memori terkelola dapat menyimpan ringkasan percakapan, memanggil recall dan menyisipkan fakta relevan ke konteks sesi berikutnya."), bullet("Sistem dapat memakai bank sessions untuk pekerjaan lintas sesi dan bank general untuk pengetahuan umum; setiap proyek dapat memiliki bank project:<nama>."), bullet("Ingest dilakukan secara asinkron dari Hyper-Knowledge: file baru/berubah dibandingkan manifest; file tidak berubah dilewati."), bullet("Ekstraksi dan konsolidasi fakta dapat memakai model remote melalui router meskipun basis data memori berada lokal. Perlakukan teks yang diproses sebagai kemungkinan data keluar."),
          P("Knowledge tree", "H2x"), table(["Lokasi", "Tujuan", "Contoh isi"], [
    ("Hyper-Knowledge/general/regulasi", "Sumber aturan lintas proyek.", "UU, PP, PMK, PER, SE, katalog JDIH."),
    ("Hyper-Knowledge/general/putusan", "Preseden dan yurisprudensi.", "Putusan dan catatan referensi."),
    ("Hyper-Knowledge/general/template", "Template reusable.", "BAP, LHP, surat, form."),
    ("Hyper-Knowledge/general/umum", "Referensi umum.", "Panduan, bahan kerja, dokumentasi."),
    ("Hyper-Knowledge/projects/<nama>", "Berkas dan ringkasan per proyek.", "Catatan, sumber, keputusan, hasil kerja."),
], [49*mm,57*mm,67*mm]),
          P("CLI Hyper", "H2x"), bullet("hyper sync memindai knowledge tree lalu meng-ingest file baru/berubah ke memory server. Server memori perlu aktif."), bullet("hyper recall <kueri> mencari fakta lintas bank; opsi bank/limit membantu mempersempit cakupan."), bullet("hyper banks menampilkan bank yang dikenal layanan memori."), bullet("hyper fetch --source kemenkeu mengambil feed JSON JDIH Kementerian Keuangan dan menyimpan katalog Markdown bertaut sumber."), bullet("Katalog JDIH adalah metadata/tautan, bukan salinan resmi regulasi. Buka sumber untuk memeriksa dan mengunduh naskah resmi."), bullet("hyper viz <job.json> merender visualisasi menggunakan Chromium aplikasi lokal, menghasilkan SVG/PNG."),
          P("Governance knowledge", "H2x"), bullet("Folder general dibagikan lintas sesi; materi per proyek sebaiknya ditempatkan pada folder proyek agar pemisahan konteks jelas."), bullet("Ringkasan proyek dapat dibangun ulang dari inventory file; ringkasan otomatis diberi penanda sebagai draf recall, bukan temuan terverifikasi."), bullet("Materi tak terverifikasi tidak boleh disajikan seolah fakta. Cantumkan berkas, halaman, kutipan, versi, dan tanggal pemeriksaan."), PageBreak()]

story += section("4. Dokumen dan produktivitas Office", "Paket Office menyediakan Python terkelola untuk membaca dan membuat berkas. Docling berfokus pada ekstraksi; library Office berfokus pada analisis, transformasi, grafik, dan pembuatan dokumen.")
story += [table(["Format/kapabilitas", "Kemampuan", "Teknologi paket"], [
    ("Excel", "Baca workbook, sheet, nilai dan formula; buat/modifikasi workbook baru; audit formula dan skenario.", "openpyxl, pandas, formulas"),
    ("Word", "Buat/edit DOCX, struktur heading-paragraf-tabel, template dan dokumen terstruktur.", "python-docx, docxtpl"),
    ("PowerPoint", "Buat/edit PPTX dari template dan isi placeholder.", "python-pptx"),
    ("PDF", "Buat PDF data-driven; gabung, pisah, dan isi form AcroForm yang sesuai.", "ReportLab, pypdf"),
    ("Grafik", "Batang, garis, pie, scatter, histogram; ekspor PNG/SVG untuk laporan.", "matplotlib, plotly, Kaleido"),
    ("Tabel/data", "Pembersihan, agregasi dan statistik tabular.", "pandas, DuckDB"),
    ("PDF/scan/gambar", "Konversi ke Markdown terstruktur, mempertahankan tabel/layout dan melakukan OCR.", "Docling, RapidOCR"),
], [33*mm,86*mm,54*mm]),
          P("Ekstraksi dokumen (Docling)", "H2x"), bullet("PDF digital, scan, dan gambar dapat diubah menjadi Markdown terstruktur. OCR berjalan lokal setelah model OCR diunduh/cache pada penggunaan awal."), bullet("Tabel dan urutan tata letak dipertahankan semampu pipeline; hasil OCR tetap perlu pemeriksaan terhadap sumber, khususnya angka, tanda baca, catatan kaki, dan kolom tabel."), bullet("Gunakan ekstraksi batch untuk banyak halaman/berkas; ringkas hasil dan simpan rujukan halaman agar konteks analisis tidak membengkak."), bullet("Ekstraksi lokal mengurangi pengiriman file mentah pada tahap konversi, tetapi teks hasil ekstraksi dapat tetap dikirim jika dimasukkan ke permintaan model cloud."),
          P("Pembuatan keluaran", "H2x"), bullet("DOCX/PPTX/PDF disusun dari outline, tabel dan visual; laporan panjang perlu struktur dan sumber yang dapat diaudit."), bullet("Pembuatan Excel mempertahankan formula; hasil perhitungan formula dapat memerlukan aplikasi spreadsheet saat workbook dibuka."), bullet("Formulir PDF dapat diisi bila form mendukung AcroForm; layout PDF arbitrer tidak dijamin identik."), bullet("Praktik aman: jangan menimpa berkas sumber; simpan hasil turunan terpisah, beri versi, dan lakukan pemeriksaan manusia sebelum tanda tangan/penyampaian."),
          P("Ukuran model, OCR cache, Office stack, dan memori lokal dapat menggunakan ruang disk besar. Setup opsional; organisasi sebaiknya merencanakan disk, RAM, izin instalasi, pembaruan, dan retensi.", "Calloutx"), PageBreak()]

story += section("5. Excel dan formula secara mendalam", "Modul Excel mendukung inspeksi data/formula, pemeriksaan cached value, evaluasi ketergantungan dan penulisan workbook baru. Contoh formula di bawah bersifat ilustratif; sesuaikan kolom dan aturan bisnis.")
story += [P("A. Membaca workbook dengan aman", "H2x"), table(["Tugas", "Pendekatan", "Pemeriksaan"], [
    ("Inventaris workbook", "Daftar sheet, hidden state, dimensi, merged cells, named ranges dan tabel.", "Catat sumber file, tanggal ekstraksi, versi workbook dan sheet yang dikecualikan."),
    ("Nilai dan formula", "Baca `data_only=False` untuk formula; baca salinan `data_only=True` untuk cached result.", "Formula tanpa cached result/hasil berbeda perlu dibuka ulang di spreadsheet engine untuk kalkulasi."),
    ("Audit formula", "Kelompokkan formula per kolom, pola formula, error, referensi eksternal dan formula menyimpang.", "Periksa range, absolute/relative reference, circular reference dan formula yang ditimpa nilai."),
    ("Analisis tabel", "Pandas untuk transformasi/rekap; DuckDB untuk query/agregasi besar.", "Bandingkan jumlah baris dan total kontrol sebelum/sesudah transformasi."),
], [34*mm,77*mm,62*mm]),
          P("B. Rantai formula dan evaluasi", "H2x"), bullet("Formula Excel disimpan menggunakan nama fungsi standar seperti SUM, IF, XLOOKUP/VLOOKUP; locale aplikasi mengatur tampilan pemisah dan bahasa fungsi."), bullet("Library `formulas` dapat membangun model kalkulasi dan menghitung graf formula yang didukung. Dukungan fungsi kompleks/macros/dynamic arrays tidak identik dengan Excel desktop; tandai fungsi tidak didukung."), bullet("Bandingkan formula dengan cached result untuk menemukan sel tanpa nilai cache atau workbook yang belum dihitung ulang."), bullet("Petakan dependensi masuk/keluar untuk menemukan sumber nilai, sheet terkait, dan rantai yang memengaruhi hasil akhir."),
          P("C. Contoh pola kerja formula", "H2x"), table(["Kebutuhan", "Formula ilustratif", "Kontrol"], [
    ("Subtotal transaksi", "`=SUM(E2:E500)`", "Simpan jumlah baris dan total pembanding; cek format angka/mata uang."),
    ("Penanda kelengkapan", '`=IF(OR(A2="",B2=""),"PERIKSA","OK")`', "Definisikan field wajib; kosong, spasi dan nilai null perlu diperlakukan konsisten."),
    ("Pencarian referensi", "`=XLOOKUP(A2,Ref!A:A,Ref!C:C,\"TIDAK DITEMUKAN\")`", "Pastikan kunci unik; catat unmatched/duplicate."),
    ("Agregasi bersyarat", '`=SUMIFS(E:E,B:B,B2,C:C,">=2026-01-01")`', "Validasi tanggal sebagai tanggal numerik, bukan teks; uji boundary."),
    ("Rasio", "`=IFERROR(E2/F2,0)`", "Jangan menyamarkan denominator nol sebagai hasil sah; tambahkan status kontrol."),
], [38*mm,74*mm,61*mm]),
          P("Contoh formula di sel workbook: `SUM` untuk total; `SUMIFS` untuk agregasi multi-kriteria; `IF`/`IFS` untuk klasifikasi; `XLOOKUP`/`VLOOKUP` untuk referensi; `COUNTIFS` untuk kontrol jumlah; `IFERROR` untuk penanganan error; `ROUND` untuk pembulatan eksplisit. Formula di dokumen adalah teks ilustratif dan harus ditinjau pada Excel engine yang digunakan.", "Calloutx"),
          P("D. Menulis workbook analitis", "H2x"), bullet("Gunakan `openpyxl` untuk membuat sheet, formula, validasi data, style, filter dan grafik sederhana; `pandas` untuk tabel besar dan ekspor."), bullet("Pola workbook audit: Ringkasan, Sumber, Data Bersih, Perhitungan, Pemeriksaan, dan Catatan. Simpan mapping kolom serta aturan transformasi."), bullet("Tuliskan formula ke sel, bukan hanya angka hasil, bila pengguna perlu menelusuri logika. Set kalkulasi saat dibuka sesuai kompatibilitas Excel."), bullet("Simpan sebagai file baru. Jangan menimpa sumber; pertahankan salinan input, checksum, jumlah record dan total kontrol."),
          P("E. Pemeriksaan mutu spreadsheet", "H2x"), bullet("Cek row count, duplicate key, blank mandatory, tipe data, nilai ekstrem, formula hilang dan error #REF!/#VALUE!/#N/A."), bullet("Pilih sampel formula lintas awal/tengah/akhir range; bandingkan hasil dengan kalkulasi independen atau hitung manual."), bullet("Jangan menganggap hasil formula AI benar. Pemilik proses harus menandatangani aturan bisnis, asumsi dan rekonsiliasi."),
          P("Formula dapat dibaca dan dianalisis; hasil cached bukan selalu hasil hitung terbaru. Untuk workbook yang berdampak finansial/hukum, lakukan recalculation di engine yang disetujui lalu cocokkan totals.", "Calloutx"), PageBreak()]

story += section("6. Pembuatan dokumen dan template", "Pembuatan dokumen Hyper AI mengubah data terstruktur menjadi draf yang dapat ditelusuri. Template menjaga struktur; satu sumber data mengurangi perbedaan angka antarlampiran.")
story += [P("A. Word/DOCX dan template", "H2x"), bullet("Susun dokumen dengan heading berjenjang, paragraf, tabel, header/footer dan metadata; template DOCX dapat berisi placeholder untuk data terstruktur."), bullet("Gunakan docxtpl untuk mengisi variabel, loop baris, kondisi dan blok tabel yang disetujui; simpan salinan template asli."), bullet("Kasus resmi: pisahkan data sumber, field template, transformasi dan teks naratif. Label [ISI] wajib diperiksa manusia."), bullet("Pastikan nomor halaman, daftar isi, tabel lintas halaman, tanda tangan, caption, font dan penomoran sesuai standar organisasi."),
          P("B. PowerPoint/PPTX", "H2x"), bullet("Buat presentasi dari template brand; satu slide menyampaikan satu pesan/insight; angka utama dibuat menonjol."), bullet("Data rinci, sumber, definisi dan asumsi ditempatkan pada notes atau catatan sumber, bukan disembunyikan."), bullet("Gunakan chart dari dataset yang sama dengan tabel laporan; uji keterbacaan saat diproyeksikan."),
          P("C. PDF", "H2x"), bullet("ReportLab membuat PDF terstruktur/data-driven dari teks, paragraf, tabel, gambar dan header/footer."), bullet("pypdf dapat menggabung, memisah, membaca field AcroForm dan mengisi form kompatibel."), bullet("Setelah ekspor, periksa jumlah halaman, font Unicode, link, tabel yang terpotong, urutan baca dan metadata dokumen."),
          P("D. Pembuatan dokumen yang dapat diaudit", "H2x"), table(["Langkah", "Catatan minimum"], [
    ("Sumber", "Nama file, versi, halaman/sel, tanggal diterima, checksum bila perlu."),
    ("Transformasi", "Aturan pembersihan, konversi satuan, formula, filter dan asumsi."),
    ("Penyusunan", "Template, versi skill, field terisi, placeholder belum lengkap."),
    ("Validasi", "Cross-foot, total, link sumber, pemeriksaan format, review ahli."),
    ("Penerbitan", "Nama file final, status draft/final, reviewer, tanggal dan otorisasi."),
], [38*mm,135*mm]),
          P("E. Mini workflow DOCX → PDF", "H2x"), bullet("Tentukan outline dan pesan utama; kumpulkan sumber yang benar-benar tersedia."), bullet("Bangun tabel dan chart dari dataset yang sama; sisipkan caption/sumber."), bullet("Render DOCX/PPTX; pemeriksa meninjau field [ISI], angka, rujukan, pemenggalan halaman."), bullet("Ekspor PDF final, ekstrak teks kembali untuk QA, lalu arsipkan bersama sumber dan checklist."), PageBreak()]

story += section("7. Chart studio: metode dan contoh", "Chart membantu pola terlihat, namun tidak mengganti validasi data. Pilih tipe grafik sesuai pertanyaan, satuan, denominator dan skala.")
story += [table(["Pertanyaan", "Chart", "Validasi"], [
    ("Bagaimana perubahan dari waktu ke waktu?", "Garis; titik waktu teratur.", "Urutkan tanggal; tandai missing period; jelaskan agregasi."),
    ("Kategori mana paling besar/kecil?", "Batang horizontal/vertikal.", "Urutkan kategori; sebut satuan; tampilkan baseline yang jujur."),
    ("Apa komposisi dari keseluruhan?", "Donut/pie bila bagian sedikit.", "Nilai harus sum ke 100%; kategori kecil jangan disembunyikan."),
    ("Apakah dua variabel berkorelasi?", "Scatter.", "Korelasi bukan kausalitas; cek outlier dan populasi."),
    ("Bagaimana distribusi nilai?", "Histogram/box plot.", "Jelaskan bin, sample size dan outlier."),
    ("Bagaimana aliran antarentitas?", "Sankey/graph.", "Agregasikan edge; pisahkan cycle; batasi node agar dapat dibaca."),
], [53*mm,48*mm,72*mm]),
          pic(LINE_IMG, 157*mm, "Contoh chart 1 — tren ilustratif sintetis. Nilai hanya untuk menunjukkan pembuatan chart dan anotasi; bukan data Hyper AI."), PageBreak(),
          pic(BAR_IMG, 157*mm, "Contoh chart 2 — batang perbandingan skor sintetis. Gunakan label langsung dan skala yang dijelaskan."),
          pic(DONUT_IMG, 157*mm, "Contoh chart 3 — komposisi aktivitas sintetis. Proporsi demonstrasi, bukan telemetri produk."),
          P("Panduan desain chart", "H2x"), bullet("Selalu cantumkan judul yang menjawab pertanyaan, satuan, periode, sumber dan definisi metrik."), bullet("Gunakan warna datar dan kontras; hindari 3D; jangan memotong baseline batang tanpa penanda."), bullet("Tampilkan label langsung bila jumlah kategori sedikit; untuk kategori besar, urutkan dan tampilkan top-N plus lainnya."), bullet("Untuk grafik ke laporan resmi, simpan data transformasi dan chart script agar visual dapat direproduksi."), PageBreak()]

story += section("8. Skills dan modul kerja", "Skills adalah instruksi kerja khusus yang membantu agen memilih alur, tool, format dan kontrol mutu yang sesuai. Skill tidak menggantikan kewenangan profesional, validasi data, atau persetujuan manusia.")
skills_rows=[
    ("hyper-doc", "Mengekstrak PDF/scan/gambar ke Markdown; OCR lokal; bantuan pembuatan dokumen.", "Docling, OCR cache, Markdown terstruktur."),
    ("hyper-excel", "Membaca, menganalisis, mengaudit dan membuat workbook/formula.", "openpyxl, pandas, formulas; nilai sumber dan formula dibandingkan."),
    ("hyper-report", "Membuat laporan Word, slide PowerPoint, PDF; memanipulasi form PDF.", "python-docx, python-pptx, ReportLab, pypdf."),
    ("hyper-chart", "Membuat chart yang dapat dimasukkan ke laporan.", "matplotlib Agg, pandas, SVG/PNG; judul, satuan dan sumber."),
    ("hyper-fundflow", "Forensik aliran transaksi, siklus, jaringan dan paket lampiran.", "DuckDB, NetworkX, Plotly/Kaleido, workbook multi-sheet, hyper viz."),
    ("hyper-tax-id", "Membantu alur dokumen penyidikan pajak dan cek konsistensi.", "SP2ID, BAP, SP2RB, SPNP, LHP; sumber resmi wajib."),
    ("hyper-case", "Menangani pola kasus berulang dengan schema, checklist, redaksi dan render.", "playbook, JSON schema, template DOCX, token map lokal."),
    ("hyper-knowledge", "Menata dan mencari bahan lokal; menuntut rujukan sebelum jawab aturan.", "Hyper-Knowledge, bank general/project, ingest dan recall."),
    ("hyper-template", "Membuat template dari pekerjaan selesai dan memulai kasus baru dari variabel turunan.", "Template DOCX/XLSX/PPTX/MD, checklist dan field turunan."),
]
story += [table(["Skill", "Kegunaan", "Cakupan / alat"], skills_rows, [31*mm,71*mm,71*mm]),
          P("Prinsip skill berkualitas", "H2x"), bullet("Menyatakan kapan dipakai, input yang dibutuhkan, keluaran, validasi, batasan, dan sumber kebenaran."), bullet("Menjaga tindakan berisiko (mis. mengirim cloud, memulihkan identitas, menimpa file) sebagai keputusan eksplisit."), bullet("Mengutamakan tool native/lokal bila cocok; mencatat ketidakpastian dan menyerahkan persetujuan akhir kepada pengguna."), bullet("Keahlian domain memandu penyusunan draf; bukan bukti bahwa hasil sudah benar atau sah."),
          P("Skill tambahan dapat disediakan oleh organisasi atau pengguna. Katalog skill yang terlihat dan komponen terpasang menjadi inventory aktual; instalasi dapat berbeda menurut opsi setup.", "Smallx"), PageBreak()]

story += section("9. Hyper Case Secure dan templating kasus", "Hyper Case Secure adalah alur kerja eksplisit per kasus: pilih jenis kasus, pilih parameter JSON, aktifkan mode, buat salinan bertoken, tinjau, lalu lanjutkan secara sadar. Ia bukan interceptor universal untuk seluruh chat.")
story += [P("A. Kasus berulang dan templating", "H2x"), bullet("Setiap jenis kasus dapat memiliki playbook.md (urutan/kriteria/checklist), parameter.schema.json (field dan tipe wajib), template/*.docx, serta contoh."), bullet("Perintah mendukung list, playbook, new, validate, render, checklist, mode, redact, screen dan restore."), bullet("Validasi memblokir field wajib kosong/tipe salah; render menolak keluaran yang tidak lengkap. Satu parameter sheet menjadi sumber tunggal untuk konsistensi dokumen dan tabel."), bullet("Pekerjaan selesai dapat distandarkan menjadi template berulang: variabel, nama output, checklist, aturan nomor/field turunan, dan prosedur review."), bullet("Isi identitas dan temuan hanya dari sumber sah. Placeholder [ISI] menandai nilai yang belum diketahui; jangan mengarang angka, nomor aturan atau kesimpulan."),
          P("B. Perlindungan eksplisit per kasus", "H2x"), table(["Langkah", "Perilaku", "Nilai operasional"], [
    ("Pilih jenis dan JSON", "Dialog native memilih file JSON dan folder hasil kosong; validasi dilakukan di main process.", "Input tidak ditimpa; jenis kasus dan field diperiksa sebelum redaksi."),
    ("Aktifkan mode", "Menolak tool web/integrasi tertentu dan menonaktifkan plugin memori otomatis.", "Mengurangi jalur data keluar tertentu; provider model cloud tidak diblokir."),
    ("Redact", "Nilai sensitif terpilih diganti token semisal [[NAMA-1]] pada salinan kerja.", "Token map disimpan lokal; tidak ditampilkan UI; pemetaan dibutuhkan untuk restore lokal."),
    ("Screen", "Memeriksa pola PII dan nilai yang dikenal dari sheet; temuan memblokir pemakaian flow.", "Fail-closed untuk pola yang dikenal; bukan bukti dokumen anonim."),
    ("Review & lanjut", "Menampilkan lokasi/hasil; pengguna sendiri memilih file redaksi untuk analisis.", "Tidak mengirim file/prompt otomatis; hanya pengguna memutuskan apa yang masuk cloud."),
    ("Akhiri mode", "Konfirmasi eksplisit; mencabut kebijakan/memori yang dikelola mode.", "Tidak menghapus sumber, hasil atau tokens.json."),
], [30*mm,72*mm,71*mm]),
          P("C. Kontrol dan batas", "H2x"), bullet("Proteksi hanya untuk materi yang melalui alur tersebut. Prompt, lampiran, screenshot, narasi bebas atau salinan lain tidak otomatis diredaksi."), bullet("Detektor regex dapat melewatkan nama, alamat, entitas tidak dikenal, konteks, metadata, gambar, atau identitas yang tidak ada di sheet."), bullet("Model agen tetap cloud pada konfigurasi remote; tool shell tetap berpotensi mengakses jaringan."), bullet("Token map adalah data sensitif tinggi. Simpan terpisah dengan ACL/backup terkontrol; jangan tempel ke prompt, email, tiket atau laporan yang akan dibagikan."), bullet("Mode on/off mengubah konfigurasi yang dikelola, berlaku untuk proses/sesi sesuai siklus reload; verifikasi status setelah mengubah."),
          P("Alur aman ringkas: klasifikasi data → pilih playbook dan template → siapkan parameter minimum → aktifkan case mode → redact dan screen → tinjau salinan → analisis hanya sheet redaksi jika disetujui → buat draf → review manusia → restore nilai lokal untuk dokumen final.", "Calloutx"), PageBreak()]

story += section("10. Orkestrasi agen dan multi-agent", "Hyper AI mengorkestrasi pekerjaan melalui agen, tool, konteks proyek, integrasi dan subagent/background task yang tersedia pada konfigurasi. Orkestrasi adalah mekanisme delegasi; bukan jaminan kebenaran atau independensi hasil.")
story += [P("Pola orkestrasi", "H2x"), table(["Pola", "Kapan berguna", "Kontrol hasil"], [
    ("Agen utama + tool", "Satu tugas memerlukan pencarian, baca/tulis berkas, analisis data atau visualisasi.", "Batasi tool, direktori, jaringan, dan izin perubahan."),
    ("Delegasi ke subagent", "Submasalah terpisah: riset, review, implementasi, atau validasi yang dapat didefinisikan jelas.", "Berikan prompt, keluaran, file ownership, dan batas cakupan spesifik."),
    ("Background job", "Tugas panjang yang dapat berjalan asinkron tanpa menahan percakapan.", "Pantau notifikasi/hasil; sediakan timeout, status dan prosedur gagal."),
    ("Model/provider beragam", "Bandingkan model sesuai kecepatan, biaya, kapabilitas atau kebutuhan lokal/cloud.", "Jaga klasifikasi data konsisten untuk semua agent/model."),
    ("Integrasi MCP", "Hubungkan dokumentasi, memori, pencarian atau tool terkonfigurasi.", "MCP dapat membawa data keluar; allowlist dan audit konfigurasi."),
], [34*mm,67*mm,72*mm]),
          P("Kelebihan praktis", "H2x"), bullet("Memecah tugas besar menjadi bagian yang lebih mudah diverifikasi; spesialis berbeda dapat menangani coding, telaah sumber, tabel dan dokumen."), bullet("Pekerjaan independen dapat didelegasikan, sementara agen utama menggabungkan temuan dan meminta review."), bullet("Sesi, project, agent dan model dapat dipilih sesuai pekerjaan; instruksi khusus dapat dikemas sebagai skill reusable."), bullet("Agen Explore/General/Research yang tersedia pada konfigurasi runtime membantu investigasi, pencarian dan penelaahan pekerjaan; jumlah/kemampuan agen dapat berbeda menurut konfigurasi."),
          P("Yang tidak otomatis dijamin", "H2x"), bullet("Paralelisme bisa menambah biaya, konteks, konflik file, inkonsistensi dan risiko kebocoran. Beri satu owner untuk setiap file/area."), bullet("Agen berbeda dapat berbagi provider, tool, basis knowledge dan blind spot; keluaran ganda bukan bukti independen."), bullet("Minta setiap subagent mengembalikan sumber/line, asumsi, tingkat keyakinan dan hasil tes; agen utama harus memverifikasi fakta kritis."), bullet("Untuk data sensitif, jangan delegasikan ke model cloud sebelum minimisasi/redaksi dan izin penggunaan ditetapkan."),
          P("Contoh pembagian aman untuk analisis transaksi: satu jalur memetakan skema file sintetis; jalur kedua meninjau logika siklus; jalur ketiga memeriksa workbook/angka; agen utama menggabungkan hasil, membandingkan total dan meminta manusia menyetujui. Jangan memberi salinan token map atau identitas asli ke semua jalur.", "Calloutx"), PageBreak()]

story += section("11. Keamanan, privasi, dan tata kelola", "Keamanan berlapis: pembatasan tool, persetujuan, local processing, konfigurasi bertanda tangan, pemisahan komponen, kontrol pengguna, dan review. Tidak satu pun menghilangkan seluruh risiko.")
story += [P("Aset dan trust boundary", "H2x"), table(["Aset", "Lokasi/pemroses", "Risiko yang perlu dikendalikan"], [
    ("Prompt, kutipan, lampiran", "Sesi; model/provider yang dipilih.", "Eksposur remote, retensi provider, prompt injection, oversharing."),
    ("Knowledge/memory", "Pohon file dan service lokal; ekstraksi memori dapat menggunakan provider remote.", "Ingest tanpa klasifikasi, akses lintas proyek, recall salah konteks."),
    ("File sumber dan draf", "Disk lokal; tool Python/shell; editor.", "Overwrite, path salah, makro/arsip berbahaya, kredensial dalam log."),
    ("tokens.json", "Folder hasil redaksi lokal.", "Re-identifikasi langsung bila bocor; backup/sinkronisasi harus dikontrol."),
    ("Kredensial provider", "Konfigurasi lokal atau bundle terkelola terenkripsi.", "Akses akun, pemakaian tanpa otorisasi, phishing/malware."),
], [39*mm,56*mm,78*mm]),
          P("Kontrol yang tersedia", "H2x"), bullet("Setup memaparkan Terms/Privacy/lisensi, meminta persetujuan eksplisit, merekam versi/hash/waktu lokal, dan meminta persetujuan ulang setelah perubahan dokumen material."), bullet("Konfigurasi OTA memerlukan tanda tangan Ed25519; secret provider dibungkus AES-256-GCM dengan material kunci yang diturunkan via HKDF-SHA256. Isi managed dibatasi allowlist; verify gagal berarti bundle ditolak."), bullet("Case mode menerapkan policy deny untuk integrasi/pencarian terpilih dan meniadakan plugin memori otomatis terkelola; kepemilikan aturan pengguna dijaga saat cleanup."), bullet("File kasus diproses dengan Python lokal; alat seperti Docling, DuckDB, openpyxl dan pembuatan dokumen dapat bekerja di perangkat."), bullet("Token map POSIX dibuat dengan mode file 0600; Windows memerlukan ACL/izin akun pengguna dan perlindungan disk yang benar."), bullet("Log setup/operasional lokal dapat berisi prompt, output tool atau potongan file; atur akses, retensi dan sanitasi sebelum berbagi."),
          P("Checklist organisasi", "H2x"), bullet("Tentukan klasifikasi dan data yang dilarang dikirim ke cloud; tetapkan provider/retensi/kontrak yang disetujui."), bullet("Kelola akses lokal, enkripsi disk, backup, EDR, akun pengguna, pembaruan dan egress jaringan."), bullet("Pisahkan project/bank, cek izin ingest, beri label sumber, periode, pemilik, sensitivitas dan masa retensi."), bullet("Wajibkan review manusia atas kutipan, formula, grafik, draf hukum/pajak, serta semua output yang memengaruhi keputusan."),
          P("Fitur keamanan mengurangi risiko tertentu; ia bukan jaminan keamanan, anonimisasi, kepatuhan, atau akurasi. Organisasi harus menyelaraskan penggunaan dengan hukum, kebijakan internal, penilaian dampak, kontrak vendor, dan kewenangan pemrosesan.", "Calloutx"), PageBreak()]

story += section("12. Contoh alur kerja lintas modul", "Berikut skenario penerapan untuk menunjukkan bagaimana fitur dapat dirangkai. Contoh bukan pengganti SOP atau nasihat hukum/pajak.")
story += [P("Skenario A — Telaah regulasi dan memo", "H2x"), table(["Tahap", "Modul", "Artefak / kontrol"], [
    ("Temukan sumber", "Hyper-Knowledge + hyper fetch/recall.", "Katalog, file regulasi, kutipan/halaman; cek versi dan tautan naskah resmi."),
    ("Ekstrak", "hyper-doc / Docling.", "Markdown + tabel; cocokkan angka dan pasal ke PDF asli."),
    ("Analisis", "Agen + model terpilih.", "Pertanyaan terstruktur, rujukan dan asumsi eksplisit."),
    ("Tulis", "hyper-report + hyper-chart bila perlu.", "Memo DOCX/PDF dengan ringkasan, dasar, analisis, sumber, catatan review."),
], [29*mm,48*mm,96*mm]),
          P("Skenario B — Analisis aliran transaksi", "H2x"), bullet("Impor salinan CSV/XLSX; audit kolom, tanggal, mata uang, duplicate, missing data dan sumber."), bullet("Agregasi di DuckDB; buat graph terarah berbobot, siklus, sentralitas atau Sankey dengan filter yang terdokumentasi."), bullet("Cocokkan agregat/chart dengan workbook multi-sheet; simpan query, parameter ambang, versi sumber dan output."), bullet("Bangun draf BAP/LHP/lampiran dari template; tandai interpretasi dan angka yang perlu pemeriksa."),
          P("Skenario C — Kasus sensitif berulang", "H2x"), bullet("Pilih schema/playbook yang disetujui; siapkan parameter minimum yang perlu, jangan masukkan data berlebihan."), bullet("Jalankan Hyper Case Secure untuk salinan redaksi; tinjau hasil dan pola yang terdeteksi."), bullet("Lakukan analisis hanya pada sheet redaksi jika penggunaan cloud telah disetujui; jangan kirim token map."), bullet("Render dokumen final lokal, restore token melalui prosedur terkontrol, verifikasi output terhadap sumber dan log keputusan."),
          P("Skenario D — Tim multi-agent", "H2x"), bullet("Agen utama menyusun rencana dan memberikan subtask yang independen, spesifikasi output, owner, dan larangan file/network."), bullet("Subagent menjalankan riset teknis/sumber, pemeriksaan angka, atau adversarial review sesuai mandat."), bullet("Agen utama menggabungkan temuan dengan referensi; reviewer manusia menguji klaim penting dan menerima/menolak perubahan."),
          PageBreak()]

story += section("13. Matriks fitur dan kesiapan", "Kesiapan mengikuti pilihan komponen dan lingkungan. 'Included' berarti paket menyertakan atau mendaftarkan komponen dasar, bukan semua dependensi berat sudah terpasang.")
story += [table(["Fitur", "Status", "Koneksi", "Output tipikal"], [
    ("Desktop + setup/consent", "Inti", "Internet untuk provider/update/unduhan", "Aplikasi siap kerja, catatan persetujuan"),
    ("Context7", "Termasuk", "Jaringan saat kueri dokumentasi", "Dokumentasi library"),
    ("Hyper Search", "Bundled/diaktifkan", "Pencarian web", "Hasil web yang perlu diverifikasi"),
    ("Hindsight memory", "Opsional", "Remote model untuk ekstraksi pada setup router", "Memory bank lokal + recall"),
    ("Knowledge tree + hyper CLI", "Bagian integrasi", "App perlu aktif untuk memori; feed JDIH perlu internet", "Recall, indeks, katalog Markdown"),
    ("Docling/OCR", "Opsional", "Unduh paket/model OCR awal; ekstraksi lokal", "Markdown/tabel/teks hasil OCR"),
    ("Office + chart", "Opsional", "Unduh Python packages; proses dokumen lokal", "XLSX/DOCX/PPTX/PDF/PNG/SVG"),
    ("Skills Office", "Ditulis bila Office terpasang", "Instruksi lokal dan tool lokal", "Alur kerja khusus domain"),
    ("Hyper Case Secure", "Bundled; gunakan schema kasus", "Model tetap bisa cloud kecuali pengguna memilih alternatif", "Salinan redaksi, tokens lokal, draf"),
    ("Hyper Fundflow", "Skill/toolkit bersama Office", "Analisis lokal; visualisasi lokal", "DuckDB, grafik, workbook, draf dokumen"),
    ("Model lokal", "Opsional", "Unduhan besar; inferensi dapat lokal", "Alternatif inferensi offline tertentu"),
    ("Signed Config OTA", "Terintegrasi", "Ambil paket dari kanal managed", "Provider/model/secret sesuai allowlist"),
], [41*mm,30*mm,57*mm,45*mm]),
          P("Akses fitur tergantung versi paket, sistem operasi, arsitektur, komponen yang dipasang, izin pengguna, dan availability provider. Operator perlu memverifikasi menu/setup aktual, versi dokumen kebijakan, daftar model, status service memori dan lokasi file output sebelum rollout.", "Calloutx"), PageBreak()]

story += section("14. Batas, risiko, dan praktik implementasi", "Bagian ini menjaga presentasi tetap jujur: fitur membantu pekerjaan, tetapi hasil kerja memerlukan prosedur dan otorisasi yang tepat.")
story += [table(["Area", "Batas yang harus dipahami", "Mitigasi praktik"], [
    ("Akurasi model", "Keluaran dapat salah, usang, bias, tidak lengkap, atau menciptakan rujukan.", "Verifikasi sumber primer, tanggal, kalkulasi, pasal dan penilaian ahli."),
    ("Privasi cloud", "Prompt, file/lampiran, kutipan tool dan output dapat dikirim ke router/provider.", "Klasifikasi, minimisasi, redaksi, kontrak, izin dan data residency."),
    ("Memory", "Retain/recall dan konsolidasi memberi konteks; ekstraksi dapat memakai model remote.", "Kebijakan ingest, segmentasi bank, retensi, koreksi/hapus dan review recall."),
    ("OCR/ekstraksi", "OCR bisa salah membaca angka, kolom, layout, tulisan tangan atau gambar.", "Tinjau halaman asli, kualitas, confidence, hasil tabel dan angka material."),
    ("Case mode", "Bukan proxy, vault universal, sandbox shell atau interceptor seluruh request.", "Hanya kirim salinan redaksi yang ditinjau; jangan lampirkan token map."),
    ("Offline", "Model lokal tidak menjadikan semua tool, memory, updater atau konfigurasi offline.", "Rencanakan egress, uji isolasi jaringan, pastikan endpoint dinonaktifkan jika wajib."),
    ("Multi-agent", "Paralelisme menambah biaya, konflik, pengulangan dan permukaan data.", "Task scope, file ownership, batas tool, review dan satu penggabung hasil."),
    ("Dokumen final", "Draf AI bukan dokumen resmi siap tanda tangan.", "Pemeriksaan hukum, sumber, formula, tabel, identitas, lampiran dan sign-off."),
], [28*mm,70*mm,75*mm]),
          P("Saran penerapan bertahap", "H2x"), bullet("Mulai dari tugas non-sensitif dan data sintetis; ukur waktu, akurasi, kualitas sitasi, rework, biaya dan kebutuhan komputasi."), bullet("Tetapkan daftar provider/model yang disetujui, data yang boleh dikirim, siapa yang mengaktifkan skill/MCP, dan bagaimana audit dilakukan."), bullet("Kelompokkan file: public/internal/confidential/highly restricted. Jangan ingest massal sebelum owner dan retensi disepakati."), bullet("Uji restore, backup, output reproducibility, izin token map, lokasi log dan pembaruan pada sistem operasi sasaran."), bullet("Definisikan human-in-the-loop untuk output hukum, perpajakan, investigasi, keuangan, tindakan eksternal dan keputusan material."),
          PageBreak()]

story += section("15. Glosarium dan referensi produk")
story += [table(["Istilah", "Arti"], [
    ("Agent/agen", "Komponen yang menalar langkah dan memakai model/tool sesuai mandat."),
    ("Subagent", "Agen spesialis yang menerima subtask terdefinisi; dapat berjalan sebagai job terpisah."),
    ("MCP", "Protokol/integrasi untuk memberi agen akses ke tool atau sumber eksternal/lokal."),
    ("Hindsight", "Layanan memory layer yang menyimpan bank memori dan menyediakan retain/recall."),
    ("Knowledge tree", "Folder sumber terstruktur untuk regulasi, putusan, template, referensi dan proyek."),
    ("OCR", "Pengenalan karakter dari scan/gambar; hasil perlu verifikasi."),
    ("Token map", "Pemetaan token samaran ke nilai asli; sangat sensitif dan harus tetap lokal."),
    ("Playbook/schema", "Aturan alur dan struktur field untuk satu jenis kasus berulang."),
    ("Router/provider", "Endpoint dan layanan yang meneruskan permintaan ke model AI."),
    ("Signed config", "Konfigurasi terkelola bertanda tangan yang diverifikasi sebelum diterapkan."),
], [38*mm,135*mm]),
          P("Sumber penyusunan", "H2x"), bullet("Inventory modul produk Hyper AI: manifest komponen, setup wizard, consent, memory/knowledge, skills dan alur kasus di paket desktop."), bullet("Dokumentasi setup yang dibundel: Terms, Privacy Policy dan lisensi pihak ketiga."), bullet("README dan panduan komponen Hyper AI, serta deskripsi skill yang disediakan paket."), bullet("Keadaan fitur dapat berubah antarversi. Untuk publikasi eksternal, cocokkan dokumen ini dengan versi rilis, paket installer, kebijakan privasi yang berlaku, dan konfigurasi deployment organisasi."),
          Spacer(1,8), P("Hyper AI • Panduan kapabilitas komprehensif • Edisi 1.0 • 25 Oktober 2026", "Smallx"),
          P("Kontak layanan: info@talentabangsa.com", "Smallx")]

doc=MyDoc(OUT)
doc.build(story)
print(OUT)
