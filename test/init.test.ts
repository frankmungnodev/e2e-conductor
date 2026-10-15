import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { saveScenario } from "../src/db/scenarios.ts"
import { initProject } from "../src/init.ts"
import { loadScenarios } from "../src/scenario.ts"
import { tempDir } from "./temp-dir.ts"

/** An empty project that has this package installed, as a user's would. */
function project(): string {
  const dir = tempDir("init")
  mkdirSync(join(dir, "node_modules"))
  symlinkSync(resolve(import.meta.dirname, ".."), join(dir, "node_modules/e2e-conductor"), "dir")
  return dir
}

describe("initProject", () => {
  it("seeds a chosen database instead of the default one, so a later run with --db finds it", async () => {
    const dir = project()
    const chosen = join(tempDir("init-chosen"), "copy.db")
    const { created } = initProject(dir, chosen)
    assert.ok(created.includes(chosen))
    assert.ok(!created.includes(join(dir, ".e2e/e2e.db")))
    const config = await loadConfig(dir, undefined, chosen)
    assert.equal(config.dbPath, chosen)
    assert.ok(config.activeEnvironment)
  })

  it("writes a sqlite db under .e2e with only a dev environment: no platform, no scenario", async () => {
    const dir = project()
    const { created, skipped } = initProject(dir)
    assert.deepEqual(created, [join(dir, ".e2e/e2e.db")])
    assert.deepEqual(skipped, [])
    assert.ok(!existsSync(join(dir, "e2e-suite")))

    const config = await loadConfig(dir)
    assert.deepEqual(Object.keys(config.environments ?? {}), ["dev"])
    assert.equal(config.activeEnvironment, "dev")
    assert.equal(config.scenarios, "e2e-suite/scenarios")
    assert.deepEqual(config.targets, {})
    assert.throws(() => loadScenarios(config), /No scenarios/)
  })

  it("seeds a database that exists but has no environment yet, keeping its scenarios", async () => {
    const dir = project()
    // Saving a scenario in the GUI before initializing creates the database with no environment.
    const db = openDatabase(join(dir, ".e2e/e2e.db"))
    saveScenario(db, { id: "smoke", name: "My Smoke", steps: [{ name: "Mine", target: "shell", command: "true" }] })
    db.close()

    const { created, skipped } = initProject(dir)
    assert.ok(created.includes(join(dir, ".e2e/e2e.db")))
    assert.deepEqual(skipped, [])
    const config = await loadConfig(dir)
    assert.equal(config.activeEnvironment, "dev")
    assert.equal(loadScenarios(config).find((scenario) => scenario.id === "smoke")?.name, "My Smoke")
  })

  it("leaves a database that already has an environment untouched", () => {
    const dir = project()
    initProject(dir)
    const { skipped } = initProject(dir)
    assert.ok(skipped.includes(join(dir, ".e2e/e2e.db")))
  })

  it("never overwrites existing files", () => {
    const dir = project()
    mkdirSync(join(dir, ".e2e"), { recursive: true })
    writeFileSync(join(dir, ".e2e/e2e.db"), "custom-db")
    const { created, skipped } = initProject(dir)
    assert.deepEqual(skipped, [join(dir, ".e2e/e2e.db")])
    assert.deepEqual(created, [])
    assert.equal(readFileSync(join(dir, ".e2e/e2e.db"), "utf8"), "custom-db")
  })
})
