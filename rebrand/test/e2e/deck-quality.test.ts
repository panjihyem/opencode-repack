import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { officeInstalled, officeRoot, deckModule, ensureManagedDeck } from "../../files/desktop/hyper/office"

const python = "C:\\Users\\User\\AppData\\Roaming\\ai.hyperai.desktop\\hyper-bundle\\office\\venv\\Scripts\\python.exe"
const deck = new URL("../../files/desktop/hyper/deck.py", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) => drive.slice(1))

test("public deck has PNG and editable chart without replacing source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hyper-deck-"))
  const source = path.join(root, "source.json")
  const output = path.join(root, "result.pptx")
  const data = JSON.stringify({ data_class: "synthetic", title: "Contoh Penjualan", source: "Data sintetis 2026", rows: [{ label: "Jan", value: 12 }, { label: "Feb", value: 15 }] })
  try {
    await writeFile(source, data)
    const run = Bun.spawnSync([python, deck, source, output])
    expect(run.exitCode).toBe(0)
    const inspect = Bun.spawnSync([python, "-c", "from pptx import Presentation; import sys; p=Presentation(sys.argv[1]); assert len(p.slides)==2; assert round(p.slide_width/p.slide_height, 2)==1.78; assert any(s.has_chart for s in p.slides[1].shapes); assert any(s.shape_type==13 for s in p.slides[0].shapes); assert all(s.top+s.height<=p.slide_height and s.left+s.width<=p.slide_width for slide in p.slides for s in slide.shapes); assert all('Sumber: Data sintetis 2026' in ' '.join(s.text for s in slide.shapes if s.has_text_frame) for slide in p.slides)", output])
    expect(inspect.exitCode).toBe(0)
    expect(await readFile(source, "utf8")).toBe(data)
    expect((await readFile(path.join(root, "result.chart.png"))).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(Bun.spawnSync([python, deck, source, output]).exitCode).not.toBe(0)
    expect(await readFile(source, "utf8")).toBe(data)
    const tooLong = JSON.stringify({ data_class: "synthetic", title: "Contoh", source: "Dataset", rows: [{ label: "LABEL_SEPANJANG_INI_MEMOTONG_CHART", value: 1 }] })
    await writeFile(source, tooLong)
    expect(Bun.spawnSync([python, deck, source, path.join(root, "invalid.pptx")]).exitCode).not.toBe(0)
    const oldInstall = path.join(root, "old-install")
    await mkdir(path.join(officeRoot(oldInstall), "venv", "Scripts"), { recursive: true })
    await writeFile(path.join(officeRoot(oldInstall), "venv", "Scripts", "python.exe"), "fixture")
    const marker = (await import("node:crypto")).createHash("sha256").update((await import("../../files/desktop/hyper/manifest")).manifest.office.packages.join(",")).digest("hex").slice(0, 8)
    await writeFile(path.join(officeRoot(oldInstall), `installed-${marker}`), "previous")
    expect(await officeInstalled(oldInstall)).toBe(true)
    const managed = await readFile(deckModule(oldInstall), "utf8")
    expect(managed).toContain("HYPER_AI_MANAGED")
    await writeFile(deckModule(oldInstall), '"""HYPER_AI_MANAGED: old version"""\n')
    expect(await officeInstalled(oldInstall)).toBe(true)
    expect(await readFile(deckModule(oldInstall), "utf8")).toBe(managed)
    await writeFile(deckModule(oldInstall), "# user code\n")
    expect(await officeInstalled(oldInstall)).toBe(true)
    expect(await readFile(deckModule(oldInstall), "utf8")).toBe("# user code\n")
    await ensureManagedDeck(oldInstall)
    expect(await readFile(deckModule(oldInstall), "utf8")).toBe("# user code\n")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
