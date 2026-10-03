// Fails when a Tailwind class in ui/src has a shorter canonical form (e.g. `h-[284px]` -> `h-71`),
// matching the "can be written as" warning from the Tailwind CSS IntelliSense extension.
// Uses Tailwind's undocumented design-system API, so a Tailwind upgrade may break this script.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { __unstable__loadDesignSystem } from "tailwindcss"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const entryCss = join(root, "ui/src/index.css")
const scanned = join(root, "ui/src")
const extensions = new Set([".ts", ".tsx"])
// IntelliSense compares against a 16px root font size by default.
const rootFontSize = 16

async function loadStylesheet(id, base) {
  const path = id.startsWith(".") ? resolve(base, id) : require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id)
  return { path, base: dirname(path), content: readFileSync(path, "utf8") }
}

const designSystem = await __unstable__loadDesignSystem(readFileSync(entryCss, "utf8"), {
  base: dirname(entryCss),
  loadStylesheet,
})

const files = readdirSync(scanned, { recursive: true })
  .map((entry) => join(scanned, entry))
  .filter((file) => extensions.has(extname(file)) && statSync(file).isFile())

const verdicts = new Map()
function canonicalFor(token) {
  if (!verdicts.has(token)) {
    const isClass = designSystem.candidatesToCss([token])[0] !== null
    const [canonical] = isClass ? designSystem.canonicalizeCandidates([token], { rem: rootFontSize }) : [token]
    verdicts.set(token, canonical)
  }
  return verdicts.get(token)
}

const findings = []
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n")
  lines.forEach((line, index) => {
    for (const token of line.split(/[\s"'`]+/)) {
      if (!token) continue
      const canonical = canonicalFor(token)
      if (canonical !== token) findings.push(`${relative(root, file)}:${index + 1}: \`${token}\` can be written as \`${canonical}\``)
    }
  })
}

if (findings.length > 0) {
  console.error(`Tailwind class check: ${findings.length} class(es) have a canonical form:\n  ${findings.join("\n  ")}`)
  process.exit(1)
}
console.log("Tailwind class check passed")
