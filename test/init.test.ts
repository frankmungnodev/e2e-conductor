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
  it("writes a sqlite db and smoke scenario under .e2e that load and validate", async () => {
    const dir = project()
    const { created, skipped } = initProject(dir)
    assert.deepEqual(created, [join(dir, ".e2e/e2e.db"), join(dir, ".e2e/scenarios/smoke.json")])
    assert.deepEqual(skipped, [])

    const config = await loadConfig(dir)
    assert.deepEqual(
      loadScenarios(config).map((scenario) => scenario.id),
      ["smoke"],
    )
    const smoke = JSON.parse(readFileSync(join(dir, ".e2e/scenarios/smoke.json"), "utf8"))
    assert.ok(readFileSync(resolve(dir, ".e2e/scenarios", smoke.$schema), "utf8").includes("urn:e2e-orchestrator:scenario:v1"))
  })

  it("never overwrites existing files", () => {
    const dir = project()
    mkdirSync(join(dir, ".e2e"), { recursive: true })
    writeFileSync(join(dir, ".e2e/e2e.db"), "custom-db")
    const { created, skipped } = initProject(dir)
    assert.deepEqual(skipped, [join(dir, ".e2e/e2e.db")])
    assert.deepEqual(created, [join(dir, ".e2e/scenarios/smoke.json")])
    assert.equal(readFileSync(join(dir, ".e2e/e2e.db"), "utf8"), "custom-db")
  })
})
