import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { redactCase, registerCaseUi } from "../files/desktop/hyper/case-ui"

describe("Hyper Case Secure UI flow", () => {
  test("validation fails before mode activation and redaction preserves source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    const original = JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } })
    await writeFile(input, original)
    await mkdir(output)
    const calls: string[][] = []
    const fake = async (_python: string, args: string[]) => {
      calls.push(args)
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: false, field_wajib_kosong: ["kasus_id"], tipe_salah: [] }), stderr: "" }
      throw new Error("unexpected call")
    }
    const result = await redactCase("cli.py", "python", "uji", input, output, fake)
    expect(result.ok).toBe(false)
    expect(calls.some((args) => args[1] === "mode")).toBe(false)
    expect(await readFile(input, "utf8")).toBe(original)
    expect(await readdir(output)).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  test("screen failure removes redacted artifacts, never leaves token map", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    await mkdir(output)
    await writeFile(input, JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } }))
    const fake = async (_python: string, args: string[]) => {
      if (args[1] === "list") return { stdout: JSON.stringify({ cases: [{ id: "uji", title: "Uji" }] }), stderr: "" }
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: true, field_wajib_kosong: [], tipe_salah: [] }), stderr: "" }
      if (args[1] === "mode" && args[2] === "status") return { stdout: JSON.stringify({ case_mode: false }), stderr: "" }
      if (args[1] === "mode" && args[2] === "on") return { stdout: JSON.stringify({ case_mode: true }), stderr: "" }
      if (args[1] === "redact") {
        const stage = args[args.indexOf("--out") + 1]
        await writeFile(path.join(stage, "parameter.redacted.json"), "{}")
        await writeFile(path.join(stage, "tokens.json"), "SENSITIVE")
        throw Object.assign(new Error("screen found PII"), { code: 1 })
      }
      throw new Error("unexpected Python command")
    }
    await expect(redactCase("cli.py", "python", "uji", input, output, fake)).rejects.toThrow()
    expect(await readdir(output)).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  test("rejects non-JSON source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const pdf = path.join(root, "source.pdf")
    await writeFile(pdf, "not a parameter sheet")
    await expect(redactCase("cli.py", "python", "uji", pdf, path.join(root, "out"))).rejects.toThrow("JSON")
    await rm(root, { recursive: true, force: true })
  })

  test("rejects output folder identical to source parent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.dirname(input)
    await writeFile(input, "{}")
    const fake = async () => { throw new Error("must not invoke Python") }
    let message = ""
    try { await redactCase("cli.py", "python", "uji", input, output, fake) } catch (error) { message = String(error) }
    expect(message).toContain("folder hasil")
    await rm(root, { recursive: true, force: true })
  })

  test("rejects output ancestor containing source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const sourceDir = path.join(root, "cases")
    const output = root
    await mkdir(sourceDir)
    const input = path.join(sourceDir, "parameter.json")
    await writeFile(input, "{}")
    let message = ""
    try { await redactCase("cli.py", "python", "uji", input, output) } catch (error) { message = String(error) }
    expect(message).toContain("tidak memuat file sumber")
    await rm(root, { recursive: true, force: true })
  })

  test("leaves pre-existing case mode on when a new redaction fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    await writeFile(input, JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } }))
    await mkdir(output)
    let mode = true
    const run = async (_python: string, args: string[]) => {
      if (args[1] === "mode" && args[2] === "status") return { stdout: JSON.stringify({ case_mode: mode }), stderr: "" }
      if (args[1] === "mode" && args[2] === "on") return { stdout: JSON.stringify({ case_mode: true }), stderr: "" }
      if (args[1] === "mode" && args[2] === "off") { mode = false; return { stdout: JSON.stringify({ case_mode: false }), stderr: "" } }
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: true, field_wajib_kosong: [], tipe_salah: [] }), stderr: "" }
      if (args[1] === "redact") {
        const stage = args[args.indexOf("--out") + 1]
        await writeFile(path.join(stage, "parameter.redacted.json"), "partial")
        await writeFile(path.join(stage, "tokens.json"), "SENSITIVE")
        throw new Error("screen failed")
      }
      throw new Error("unexpected command")
    }
    await expect(redactCase("cli.py", "python", "uji", input, output, run)).rejects.toThrow()
    expect(mode).toBe(true)
    expect(await readdir(output)).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  test("serializes concurrent prepare actions to keep case mode on for active redaction", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const outputA = path.join(root, "hasil-a")
    const outputB = path.join(root, "hasil-b")
    await writeFile(input, JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } }))
    await Promise.all([mkdir(outputA), mkdir(outputB)])
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const ipcMain = { removeHandler: (key: string) => handlers.delete(key), handle: (key: string, fn: (...args: any[]) => unknown) => handlers.set(key, fn) }
    let mode = false
    let active = 0
    let maxActive = 0
    let releaseFirst!: () => void
    let reachedFirst!: () => void
    const firstRedact = new Promise<void>((resolve) => { reachedFirst = resolve })
    const barrier = new Promise<void>((resolve) => { releaseFirst = resolve })
    const runPython = async (_python: string, args: string[]) => {
      if (args[1] === "list") return { stdout: JSON.stringify({ cases: [{ id: "uji", title: "Uji" }] }), stderr: "" }
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: true, field_wajib_kosong: [], tipe_salah: [] }), stderr: "" }
      if (args[1] === "mode" && args[2] === "status") return { stdout: JSON.stringify({ case_mode: mode }), stderr: "" }
      if (args[1] === "mode" && args[2] === "on") { mode = true; return { stdout: JSON.stringify({ case_mode: true }), stderr: "" } }
      if (args[1] === "mode" && args[2] === "off") { mode = false; return { stdout: JSON.stringify({ case_mode: false }), stderr: "" } }
      if (args[1] === "redact") {
        active++
        maxActive = Math.max(maxActive, active)
        const stage = args[args.indexOf("--out") + 1]
        if (stage.includes("hasil-a")) { reachedFirst(); await barrier }
        await writeFile(path.join(stage, "parameter.redacted.json"), "{}")
        await writeFile(path.join(stage, "tokens.json"), "SENSITIVE")
        active--
        return { stdout: JSON.stringify({ ok: true }), stderr: "" }
      }
      throw new Error("unexpected command")
    }
    registerCaseUi({
      ipcMain: ipcMain as any,
      BrowserWindow: { fromWebContents: () => undefined } as any,
      dialog: {} as any,
      shell: { openPath: async () => "" } as any,
      app: {} as any,
      cli: "cli.py",
      python: "python",
      runPython,
      log: async () => undefined,
      setCaseMode: async () => undefined,
      onClose: () => undefined,
    })
    const prepare = handlers.get("hyper:case:prepare")!
    const first = prepare({}, { kind: "uji", file: input, output: outputA })
    await firstRedact
    const second = prepare({}, { kind: "uji", file: input, output: outputB })
    releaseFirst()
    await Promise.all([first, second])
    expect(maxActive).toBe(1)
    expect(mode).toBe(true)
    await rm(root, { recursive: true, force: true })
  })

  test("rolls back generated artifacts if policy state persistence fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    await writeFile(input, JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } }))
    await mkdir(output)
    const mode = { value: false }
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const ipcMain = { removeHandler: (key: string) => handlers.delete(key), handle: (key: string, fn: (...args: any[]) => unknown) => handlers.set(key, fn) }
    const fake = async (_python: string, args: string[]) => {
      if (args[1] === "list") return { stdout: JSON.stringify({ cases: [{ id: "uji", title: "Uji" }] }), stderr: "" }
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: true, field_wajib_kosong: [], tipe_salah: [] }), stderr: "" }
      if (args[1] === "mode" && args[2] === "status") return { stdout: JSON.stringify({ case_mode: mode.value }), stderr: "" }
      if (args[1] === "mode" && args[2] === "on") { mode.value = true; return { stdout: JSON.stringify({ case_mode: true }), stderr: "" } }
      if (args[1] === "mode" && args[2] === "off") { mode.value = false; return { stdout: JSON.stringify({ case_mode: false }), stderr: "" } }
      if (args[1] === "redact") {
        const stage = args[args.indexOf("--out") + 1]
        await writeFile(path.join(stage, "parameter.redacted.json"), "{}")
        await writeFile(path.join(stage, "tokens.json"), "SENSITIVE")
        return { stdout: JSON.stringify({ ok: true }), stderr: "" }
      }
      throw new Error("unexpected Python command")
    }
    registerCaseUi({
      ipcMain: ipcMain as any,
      BrowserWindow: { fromWebContents: () => undefined } as any,
      dialog: {} as any,
      shell: { openPath: async () => "" } as any,
      app: {} as any,
      cli: "cli.py",
      python: "python",
      runPython: fake,
      log: async () => undefined,
      setCaseMode: async (enabled) => { if (enabled) throw new Error("state write failed"); mode.value = enabled },
      onClose: () => undefined,
    })
    let message = ""
    try { await handlers.get("hyper:case:prepare")!({}, { kind: "uji", file: input, output }) } catch (error) { message = String(error) }
    expect(message).toContain("status mode tidak tersimpan")
    expect(await readdir(output)).toEqual([])
    expect(mode.value).toBe(false)
    await rm(root, { recursive: true, force: true })
  })

  test("open-output only opens output created by this UI session", async () => {
    const opened: string[] = []
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const ipcMain = { removeHandler: (key: string) => handlers.delete(key), handle: (key: string, fn: (...args: any[]) => unknown) => handlers.set(key, fn) }
    registerCaseUi({
      ipcMain: ipcMain as any,
      BrowserWindow: { fromWebContents: () => undefined } as any,
      dialog: {} as any,
      shell: { openPath: async (folder: string) => { opened.push(folder); return "" } } as any,
      app: {} as any,
      cli: "cli.py",
      python: "python",
      runPython: async (_python, args) => args[1] === "mode" ? { stdout: JSON.stringify({ case_mode: false }), stderr: "" } : { stdout: JSON.stringify({ cases: [] }), stderr: "" },
      log: async () => undefined,
      setCaseMode: async () => undefined,
      onClose: () => undefined,
    })
    await handlers.get("hyper:case:list")!()
    await expect(handlers.get("hyper:case:open-output")!({}, path.resolve("untrusted"))).rejects.toThrow("tidak dikenal")
    expect(opened).toEqual([])
  })

  test("log failure does not turn successful redaction into a UI failure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    await writeFile(input, JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } }))
    await mkdir(output)
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const ipcMain = { removeHandler: (key: string) => handlers.delete(key), handle: (key: string, fn: (...args: any[]) => unknown) => handlers.set(key, fn) }
    let modeEnabled = false
    const runPython = async (_python: string, args: string[]) => {
      if (args[1] === "list") return { stdout: JSON.stringify({ cases: [{ id: "uji", title: "Uji" }] }), stderr: "" }
      if (args[1] === "mode" && args[2] === "status") return { stdout: JSON.stringify({ case_mode: false }), stderr: "" }
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: true, field_wajib_kosong: [], tipe_salah: [] }), stderr: "" }
      if (args[1] === "mode" && args[2] === "on") { modeEnabled = true; return { stdout: JSON.stringify({ case_mode: true }), stderr: "" } }
      if (args[1] === "mode" && args[2] === "off") { modeEnabled = false; return { stdout: JSON.stringify({ case_mode: false }), stderr: "" } }
      if (args[1] === "redact") {
        await writeFile(path.join(args[args.indexOf("--out") + 1], "parameter.redacted.json"), "{}")
        await writeFile(path.join(args[args.indexOf("--out") + 1], "tokens.json"), "SENSITIVE")
        return { stdout: JSON.stringify({ ok: true }), stderr: "" }
      }
      throw new Error("unexpected Python command")
    }
    registerCaseUi({
      ipcMain: ipcMain as any,
      BrowserWindow: { fromWebContents: () => undefined } as any,
      dialog: {} as any,
      shell: { openPath: async () => "" } as any,
      app: {} as any,
      cli: "cli.py",
      python: "python",
      runPython,
      log: async () => { throw new Error("log unavailable") },
      setCaseMode: async () => undefined,
      onClose: () => undefined,
    })
    const result = await handlers.get("hyper:case:prepare")!({}, { kind: "uji", file: input, output }) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(await readFile(path.join(output, "tokens.json"), "utf8")).toBe("SENSITIVE")
    expect(modeEnabled).toBe(true)
    await rm(root, { recursive: true, force: true })
  })

  test("rejects an output ancestor that contains the source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const sourceDir = path.join(root, "cases")
    const output = path.join(root, "hasil")
    await mkdir(sourceDir)
    await mkdir(output)
    const input = path.join(sourceDir, "parameter.json")
    await writeFile(input, "{}")
    await expect(redactCase("cli.py", "python", "uji", input, root)).rejects.toThrow("tidak memuat file sumber")
    await rm(root, { recursive: true, force: true })
  })
})
