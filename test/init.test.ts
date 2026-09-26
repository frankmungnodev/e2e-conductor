import assert from "node:assert/strict"
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { initProject } from "../src/init.ts"
import { loadScenarios } from "../src/scenario.ts"
import { tempDir } from "./temp-dir.ts"

/** An empty project that has this package installed, as a user's would. */
function project(): string {
  const dir = tempDir("init")
  mkdirSync(join(dir, "node_modules"))
  symlinkSync(resolve(import.meta.dirname, ".."), join(dir, "node_modules/e2e-orchestrator"), "dir")
  return dir
}

describe("initProject", () => {
  it("writes a config and scenario that load and validate", async () => {
    const dir = project()
    const { created, skipped } = initProject(join(dir, "e2e.config.ts"))
    assert.deepEqual(created, [join(dir, "e2e.config.ts"), join(dir, "e2e/scenarios/smoke.json")])
    assert.deepEqual(skipped, [])

    const config = await loadConfig(join(dir, "e2e.config.ts"))
    assert.deepEqual(
      loadScenarios(config).map((scenario) => scenario.id),
      ["smoke"],
    )
    const smoke = JSON.parse(readFileSync(join(dir, "e2e/scenarios/smoke.json"), "utf8"))
    assert.ok(readFileSync(resolve(dir, "e2e/scenarios", smoke.$schema), "utf8").includes("urn:e2e-orchestrator:scenario:v1"))
  })

  it("never overwrites existing files", () => {
    const dir = project()
    writeFileSync(join(dir, "e2e.config.ts"), "mine")
    const { created, skipped } = initProject(join(dir, "e2e.config.ts"))
    assert.deepEqual(skipped, [join(dir, "e2e.config.ts")])
    assert.deepEqual(created, [join(dir, "e2e/scenarios/smoke.json")])
    assert.equal(readFileSync(join(dir, "e2e.config.ts"), "utf8"), "mine")
  })
})
