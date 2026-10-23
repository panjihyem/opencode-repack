// Resolve hook: Node menjalankan TypeScript langsung, tetapi specifier repo memakai `.js`
// (hasil kompilasi). Hook ini memetakan `./x.js` -> `./x.ts` bila file .ts ada.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    const url = new URL(specifier, context.parentURL)
    const ts = new URL(url.href.replace(/\.js$/, ".ts"))
    if (ts.protocol === "file:" && existsSync(fileURLToPath(ts))) {
      return { url: ts.href, shortCircuit: true }
    }
  }
  return next(specifier, context)
}
