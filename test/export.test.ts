import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { withDb } from "../src/db/connection.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { deleteScenario, saveScenario } from "../src/db/scenarios.ts"
import { deleteStepPreset } from "../src/db/step-presets.ts"
import { checkExport, exportToJson } from "../src/export.ts"
import { getOrSeedPresets, getOrSeedScenarios } from "../src/scenario.ts"
import { validateScenario } from "../src/schema.ts"
import { tempDir } from "./temp-dir.ts"

/** A config folder with an empty database, one scenario file, and one preset file. */
function project(): LoadedConfig {
  const dir = tempDir("export")
  mkdirSync(join(dir, "scenarios"))
  mkdirSync(join(dir, "presets"))
  writeFileSync(
    join(dir, "scenarios", "smoke.json"),
    JSON.stringify({ name: "Smoke", steps: [{ name: "echo", target: "shell", command: "echo hi" }] }),
  )
  writeFileSync(
    join(dir, "presets", "preset-echo.json"),
    JSON.stringify({ id: "preset-echo", name: "Echo", target: "shell", step: { name: "Echo", target: "shell", command: "echo" } }),
  )
  const config: LoadedConfig = {
    configDir: dir,
    dbPath: resolveDbPath(dir),
    env: {},
    scenarios: "scenarios",
    results: "results",
    services: {},
    targets: {},
    fixtures: {},
  }
  // Opening the database creates the file and its schema.
  withDb(resolveDbPath(dir), () => undefined)
  return config
}

describe("JSON import and export", () => {
  it("imports scenario files once, so a deleted scenario stays deleted", () => {
    const config = project()
    assert.deepEqual(
      getOrSeedScenarios(config).map((s) => s.id),
      ["smoke"],
    )

    withDb(resolveDbPath(config.configDir), (db) => deleteScenario(db, "smoke"))
    assert.deepEqual(getOrSeedScenarios(config), [])
    assert.ok(existsSync(join(config.configDir, "scenarios", "smoke.json")))
  })

  it("imports preset files once, so a deleted preset stays deleted", () => {
    const config = project()
    assert.deepEqual(
      getOrSeedPresets(config).map((p) => p.id),
      ["preset-echo"],
    )

    withDb(resolveDbPath(config.configDir), (db) => deleteStepPreset(db, "preset-echo"))
    assert.deepEqual(getOrSeedPresets(config), [])
  })

  it("writes database scenarios and presets to JSON files that pass validation", () => {
    const config = project()
    withDb(resolveDbPath(config.configDir), (db) =>
      saveScenario(db, { id: "created", name: "Created", steps: [{ name: "ls", target: "shell", command: "ls" }] }),
    )

    const result = exportToJson(config)

    const createdFile = join(config.configDir, "scenarios", "created.json")
    assert.deepEqual(result.scenarios, [createdFile, join(config.configDir, "scenarios", "smoke.json")])
    assert.deepEqual(result.presets, [join(config.configDir, "presets", "preset-echo.json")])
    const written = JSON.parse(readFileSync(createdFile, "utf8"))
    assert.equal(written.id, undefined)
    assert.equal(written.name, "Created")
    assert.ok(validateScenario(written), JSON.stringify(validateScenario.errors))
  })

  it("finds no drift right after an export, even when a file is reformatted", () => {
    const config = project()
    exportToJson(config)
    const file = join(config.configDir, "scenarios", "smoke.json")
    writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, "utf8"))))

    assert.deepEqual(checkExport(config), { missing: [], changed: [], stale: [] })
  })

  it("reports missing, changed and stale files without writing any", () => {
    const config = project()
    exportToJson(config)
    const scenariosDir = join(config.configDir, "scenarios")
    withDb(resolveDbPath(config.configDir), (db) => {
      const smoke = getOrSeedScenarios(config)[0]
      saveScenario(db, { ...smoke, steps: [{ ...smoke.steps[0], name: "renamed" }] })
      saveScenario(db, { id: "created", name: "Created", steps: [{ name: "ls", target: "shell", command: "ls" }] })
      deleteStepPreset(db, "preset-echo")
    })

    const drift = checkExport(config)

    assert.deepEqual(drift, {
      missing: [join(scenariosDir, "created.json")],
      changed: [join(scenariosDir, "smoke.json")],
      stale: [join(config.configDir, "presets", "preset-echo.json")],
    })
    assert.equal(existsSync(join(scenariosDir, "created.json")), false)
  })

  it("reports a file that is not valid JSON as changed", () => {
    const config = project()
    exportToJson(config)
    const file = join(config.configDir, "scenarios", "smoke.json")
    writeFileSync(file, "{ not json")

    assert.deepEqual(checkExport(config).changed, [file])
  })

  it("fails when the database cannot be read, instead of comparing the files with themselves", () => {
    const config = project()
    writeFileSync(config.dbPath, "not a sqlite database")

    assert.throws(() => checkExport(config))
  })
})
