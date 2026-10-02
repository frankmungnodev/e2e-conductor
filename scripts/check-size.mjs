// Warns about source files over the line budget so they get split by domain concept.
// Warn-only: always exits 0. See "Code Organization" in AGENTS.md.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const scanned = ["src", "ui/src"]
const extensions = new Set([".ts", ".tsx", ".js", ".mjs"])
const budget = 500

function files(path) {
  const absolute = join(root, path)
  try {
    if (statSync(absolute).isFile()) return [absolute]
  } catch {
    return []
  }
  return readdirSync(absolute, { recursive: true })
    .map((entry) => join(absolute, entry))
    .filter((file) => extensions.has(extname(file)) && statSync(file).isFile())
}

const oversized = []
for (const file of scanned.flatMap(files)) {
  const text = readFileSync(file, "utf8")
  const lines = text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length
  if (lines > budget) oversized.push(`${relative(root, file)}: ${lines} lines`)
}

if (oversized.length > 0) {
  console.warn(`File size check: ${oversized.length} file(s) over the ${budget}-line budget:\n  ${oversized.join("\n  ")}`)
} else {
  console.log(`File size check passed (budget ${budget} lines)`)
}
