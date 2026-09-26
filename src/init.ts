import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const CONFIG = `import { defineConfig } from "e2e-orchestrator"

export default defineConfig({
  services: {
    api: { url: "http://localhost:3000" },
  },
  targets: {
    api: { driver: "http", service: "api" },
  },
  scenarios: "e2e/scenarios",
  results: "e2e/results",
})
`

const SMOKE = {
  $schema: "../../node_modules/e2e-orchestrator/schema/v1/scenario.schema.json",
  name: "Smoke",
  steps: [{ name: "home responds", target: "api", url: "/", assert: { status: 200 } }],
}

/**
 * Write a starter config and one scenario next to `configPath`.
 * Never overwrites: a file that exists is skipped.
 */
export function initProject(configPath: string): { created: string[]; skipped: string[] } {
  const config = resolve(configPath)
  const files: Record<string, string> = {
    [config]: CONFIG,
    [join(dirname(config), "e2e/scenarios/smoke.json")]: `${JSON.stringify(SMOKE, null, 2)}\n`,
  }
  const created: string[] = []
  const skipped: string[] = []
  for (const [file, content] of Object.entries(files)) {
    if (existsSync(file)) {
      skipped.push(file)
      continue
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    created.push(file)
  }
  return { created, skipped }
}
