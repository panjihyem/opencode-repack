import { stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { doclingInstalled, installDocling } from "./docling"
import { hindsightInstalled, installHindsight } from "./hindsight"
import { installLmStudio, installModels, lmStudioInstalled } from "./lmstudio"
import { manifest } from "./manifest"
import { installOffice, officeInstalled } from "./office"
import type { Report } from "./process"

export type Component = {
  id: string
  name: string
  description: string
  /** approximate download size, shown in the wizard */
  bytes: number
  /** shipped inside the installer; always on */
  required?: boolean
  recommended?: boolean
  installed: (dataDir: string) => Promise<boolean>
  install: (dataDir: string, report: Report) => Promise<void>
}

/**
 * Model tier from physical RAM: 30 GB+ runs the sharp 9B, 8-30 GB the balanced
 * 4B (with vision), and anything smaller the 1.6 GB LFM2.5-2.6B. Memory servers
 * and daily work never need more than the tiered pick.
 */
export function tieredModel() {
  const gb = os.totalmem() / 1024 ** 3
  const tier = gb >= 30 ? "full" : gb >= 8 ? "lite" : "nano"
  return manifest.models.find((m) => m.tier === tier) ?? manifest.models[0]
}

const model = tieredModel()

const modelFile = (m: (typeof manifest.models)[number]) =>
  path.join(os.homedir(), ".lmstudio", "models", m.publisher, m.repo, m.file)

const modelPresent = (m: (typeof manifest.models)[number]) =>
  stat(modelFile(m)).then(
    (info) => info.size === m.bytes,
    () => false,
  )

/** The model hindsight should talk to: the RAM-tiered pick whenever present,
 * otherwise any tier already fully downloaded (older installs), else the tiered pick. */
export async function selectedModelId() {
  const others = manifest.models.filter((m) => m !== model)
  for (const candidate of [model, ...others]) if (await modelPresent(candidate)) return candidate.id
  return model.id
}

export const components: Component[] = [
  {
    id: "context7",
    name: "Context7",
    description: "Dokumentasi library terbaru untuk agen. Sudah termasuk di installer.",
    bytes: 0,
    required: true,
    installed: async () => true,
    install: async () => undefined,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    description: "Menjalankan model AI di komputer Anda (build resmi dari penerbit, tidak dimodifikasi).",
    bytes: 0.7e9,
    recommended: true,
    installed: lmStudioInstalled,
    install: async (dataDir, report) => installLmStudio(dataDir, report),
  },
  {
    id: "models",
    name: `Model lokal ${model.id}`,
    description: "Model untuk ekstraksi memori dan tugas offline; dipilih otomatis sesuai RAM. Model di-load hanya begitu dibutuhkan dan segera dilepas saat idle.",
    bytes: model.bytes,
    recommended: true,
    installed: () => modelPresent(model),
    install: async (_dataDir, report) => installModels(report, [model.id]),
  },
  {
    id: "hindsight",
    name: "Memori Hindsight",
    description: "Memori jangka panjang antar-sesi, berjalan lokal di 127.0.0.1:8888 dan terdaftar sebagai MCP `mem`.",
    bytes: 2e9,
    recommended: true,
    installed: hindsightInstalled,
    install: async (dataDir, report) => installHindsight(dataDir, report),
  },
  {
    id: "docs",
    name: "Ekstraksi Dokumen (Docling)",
    description: "PDF/scan/gambar menjadi Markdown terstruktur dengan OCR lokal; opsional untuk pekerjaan dokumen.",
    bytes: 1.5e9,
    recommended: false,
    installed: doclingInstalled,
    install: async (dataDir, report) => installDocling(dataDir, report),
  },
  {
    id: "office",
    name: "Paket Office",
    description:
      "Baca/analisa/buat Excel (termasuk formula), Word, PowerPoint, PDF dan grafik — semuanya lokal, tanpa kirim data ke luar.",
    bytes: 1.0e9,
    recommended: true,
    installed: officeInstalled,
    install: async (dataDir, report) => installOffice(dataDir, report),
  },
]

export type Update =
  | { type: "step"; id: string; status: "running" | "done" | "failed" | "skipped"; message?: string; fraction?: number }
  | { type: "complete"; failed: string[] }

/** Installs the chosen components in order; a failing one is reported and does not stop the rest. */
export async function provision(ids: string[], dataDir: string, emit: (update: Update) => void) {
  const failed: string[] = []
  for (const component of components.filter((item) => ids.includes(item.id) && !item.required)) {
    if (await component.installed(dataDir)) {
      emit({ type: "step", id: component.id, status: "skipped", message: "Sudah terpasang", fraction: 1 })
      continue
    }
    emit({ type: "step", id: component.id, status: "running", fraction: 0 })
    try {
      await component.install(dataDir, (message, fraction) =>
        emit({ type: "step", id: component.id, status: "running", message, fraction }),
      )
      emit({ type: "step", id: component.id, status: "done", fraction: 1 })
    } catch (error) {
      failed.push(component.id)
      emit({
        type: "step",
        id: component.id,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  emit({ type: "complete", failed })
  return failed
}
