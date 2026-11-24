export * as ConfigWatch from "./watch.js"

import fs from "node:fs"
import path from "path"
import { FSUtil } from "@opencode/util/fs-util"
import type { Watcher } from "../filesystem/watcher.js"
import { ConfigDiscovery } from "./discovery.js"

/**
 * Bagian pertama dari path yang belum ada (nenek moyangnya sudah ada). Menonton path
 * ini sebagai kandidat entri membuat pembuatan direktori terdeteksi, lalu reconcile
 * berikutnya menambah watch lebih dalam.
 */
function firstMissing(target: string) {
  let current = target
  for (let depth = 0; depth < 6; depth++) {
    const parent = path.dirname(current)
    if (parent === current) return current
    if (fs.existsSync(parent)) return current
    current = parent
  }
  return current
}

export function plan(sources: ConfigDiscovery.Sources) {
  const directories = [
    ...(sources.system?.present ? [sources.system.path] : []),
    ...(sources.managed ?? []).filter((source) => source.present).map((source) => source.path),
    ...(sources.global ? [sources.global] : []),
    ...sources.project.filter((root) => root.present).map((root) => root.path),
  ]
  const files = [
    ...(sources.system ? [sources.system.path] : []),
    ...(sources.managed ?? []).flatMap((source) =>
      // Direktori ada: tonton ketiga berkasnya agar bundle pertama/berikutnya memicu reload.
      // Direktori belum ada: menontonnya gagal (ENOENT), jadi tonton bagian pertama yang belum ada.
      fs.existsSync(source.path)
        ? [source.path, ...ConfigDiscovery.managedBundleFiles.map((name) => path.join(source.path, name))]
        : [firstMissing(source.path)],
    ),
    ...sources.direct,
    ...sources.project.map((root) => root.path),
    ...sources.claude,
    ...sources.agents,
    ...(sources.explicit ? [sources.explicit] : []),
  ]
  // Keep a parent watch for each root so deletion/recreation is observable.
  const parents = Map.groupBy(
    files.filter((file) => !directories.some((directory) => file !== directory && FSUtil.contains(directory, file))),
    (file) => path.dirname(file),
  )
  return new Map(
    [
      ...directories.map((path) => ({
        path,
        type: "directory" as const,
        ignore: ["node_modules", ".git", "**/{node_modules,.git}/**"],
      })),
      ...Array.from(parents, ([parent, files]) => ({
        path: parent,
        type: "entries" as const,
        names: [...new Set(files.map((file) => path.basename(file)))].toSorted(),
      })),
    ].map((target) => [JSON.stringify(target), target satisfies Watcher.WatchInput]),
  )
}
