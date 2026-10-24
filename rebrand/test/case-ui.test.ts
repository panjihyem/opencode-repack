import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { redactCase, type CaseUiError } from "../files/desktop/hyper/case-ui"

describe("Hyper Case Secure UI flow", () => {
  test("validation fails before mode activation and redaction preserves source", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    const original = JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } })
    await writeFile(input, original)
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
    expect(await stat(output).catch(() => undefined)).toBeUndefined()
    await rm(root, { recursive: true, force: true })
  })

  test("screen failure removes redacted artifacts, never leaves token map", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hyper-case-ui-"))
    const input = path.join(root, "parameter.json")
    const output = path.join(root, "hasil")
    await writeFile(input, JSON.stringify({ wp: { npwp: "12.345.678.9-123.456" } }))
    const fake = async (_python: string, args: string[]) => {
      if (args[1] === "validate") return { stdout: JSON.stringify({ valid: true, field_wajib_kosong: [], tipe_salah: [] }), stderr: "" }
      if (args[1] === "mode") return { stdout: "{}", stderr: "" }
      await mkdir(output, { recursive: true })
      await writeFile(path.join(output, "parameter.redacted.json"), "{}")
      await writeFile(path.join(output, "tokens.json"), "SENSITIVE")
      throw Object.assign(new Error("screen found PII"), { code: 1 })
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
})
