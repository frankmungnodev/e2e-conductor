import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import { loadConfig, resolveFromConfig } from "../src/config.ts"

const dir = mkdtempSync(join(tmpdir(), "e2e-config-"))
after(() => rmSync(dir, { recursive: true, force: true }))

function configFile(name: string, config: unknown): string {
  const file = join(dir, name)
  writeFileSync(file, `export default ${JSON.stringify(config)}\n`)
  return file
}

describe("loadConfig", () => {
  it("loads a config, merges env and remembers its folder", async () => {
    process.env.E2E_TEST_FROM_PROCESS = "process"
    const file = configFile("ok.mjs", {
      services: { api: { url: "http://localhost:4000" } },
      targets: { api: { driver: "http", service: "api" } },
      env: { FROM_CONFIG: "config", E2E_TEST_FROM_PROCESS: "config" },
      scenarios: "scenarios",
      results: "results",
    })
    const config = await loadConfig(file)
    assert.equal(config.configDir, dir)
    assert.equal(config.env.FROM_CONFIG, "config")
    assert.equal(config.env.E2E_TEST_FROM_PROCESS, "process", "process env wins")
    assert.equal(resolveFromConfig(config, config.scenarios), join(dir, "scenarios"))
  })

  it("fails when the file is missing", async () => {
    await assert.rejects(loadConfig(join(dir, "missing.mjs")), /Config not found/)
  })

  it("fails without a default export that has targets", async () => {
    await assert.rejects(loadConfig(configFile("empty.mjs", {})), /must default-export defineConfig/)
  })

  it("reserves the shell target name", async () => {
    const file = configFile("shell.mjs", { targets: { shell: { driver: "mobile" } }, scenarios: ".", results: "." })
    await assert.rejects(loadConfig(file), /Target name "shell" is reserved/)
  })

  it("fails on a target with an unknown service", async () => {
    const file = configFile("service.mjs", { targets: { web: { driver: "web", service: "nope" } }, scenarios: ".", results: "." })
    await assert.rejects(loadConfig(file), /Target "web" uses unknown service "nope"/)
  })
})
