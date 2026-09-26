// Fails when the core leaks project knowledge: imports from outside core/,
// or project-specific names. Keep it project-agnostic so it can be reused.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const scanned = ["src", "bin", "schema", "README.md", "package.json"]
// Words that belong to a consumer project, never to the core. Set E2E_BOUNDARY_WORDS=a,b,c.
const forbidden = (process.env.E2E_BOUNDARY_WORDS ?? "")
  .split(",")
  .map((word) => word.trim())
  .filter(Boolean)

function files(path) {
  const absolute = join(root, path)
  try {
    if (statSync(absolute).isFile()) return [absolute]
  } catch {
    return []
  }
  return readdirSync(absolute, { recursive: true })
    .map((entry) => join(absolute, entry))
    .filter((file) => statSync(file).isFile())
}

const problems = []
for (const file of scanned.flatMap(files)) {
  const text = readFileSync(file, "utf8")
  const name = relative(root, file)
  for (const word of forbidden) {
    if (text.toLowerCase().includes(word.toLowerCase())) problems.push(`${name}: contains "${word}"`)
  }
  for (const match of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = resolve(dirname(file), match[1] ?? match[2])
    if (relative(root, target).startsWith("..")) problems.push(`${name}: imports outside core (${match[1] ?? match[2]})`)
  }
}

if (problems.length > 0) {
  console.error(`Core boundary check failed:\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("Core boundary check passed")
