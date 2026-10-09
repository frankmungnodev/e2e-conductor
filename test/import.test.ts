import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { withDb } from "../src/db/connection.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { getScenario } from "../src/db/scenarios.ts"
import { importFromJson } from "../src/import.ts"
import { getOrSeedScenarios } from "../src/scenario.ts"
import { tempDir } from "./temp-dir.ts"

const echo = (name: string, command = "echo hi") => ({ name, steps: [{ name: "echo", target: "shell", command }] })

/** A config folder whose database already ran its one-time import, so later files are not picked up by it. */
function project(): LoadedConfig {
  const dir = tempDir("import")
  mkdirSync(join(dir, "scenarios"))
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
  withDb(resolveDbPath(dir), () => undefined)
  getOrSeedScenarios(config)
  return config
}

const write = (config: LoadedConfig, file: string, content: unknown) =>
  writeFileSync(join(config.configDir, "scenarios", file), typeof content === "string" ? content : JSON.stringify(content))

const stored = (config: LoadedConfig, id: string) => withDb(resolveDbPath(config.configDir), (db) => getScenario(db, id))

describe("importFromJson", () => {
  it("adds files the one-time import no longer reads, and reports re-imports as unchanged", () => {
    const config = project()
    write(config, "smoke.json", echo("Smoke"))
    assert.deepEqual(importFromJson(config), { added: ["smoke"], updated: [], unchanged: [], invalid: [] })
    const stepId = stored(config, "smoke")?.steps[0].id

    assert.deepEqual(importFromJson(config).unchanged, ["smoke"])
    assert.equal(stored(config, "smoke")?.steps[0].id, stepId, "an unchanged file keeps its step ids")
  })

  it("replaces a scenario whose file changed, keeping step ids the file names", () => {
    const config = project()
    write(config, "smoke.json", echo("Smoke"))
    importFromJson(config)
    const stepId = stored(config, "smoke")?.steps[0].id
    write(config, "smoke.json", { name: "Smoke", steps: [{ id: stepId, name: "echo", target: "shell", command: "echo changed" }] })

    assert.deepEqual(importFromJson(config).updated, ["smoke"])
    const after = stored(config, "smoke")
    assert.equal(after?.steps[0].command, "echo changed")
    assert.equal(after?.steps[0].id, stepId)
  })

  it("reports invalid files with their problems and saves nothing from them", () => {
    const config = project()
    write(config, "broken.json", "{ not json")
    write(config, "no-steps.json", { name: "No steps" })

    const { invalid } = importFromJson(config)
    assert.deepEqual(
      invalid.map(({ file }) => file.split("/").pop()),
      ["broken.json", "no-steps.json"],
    )
    assert.match(invalid[0].problems[0], /not valid JSON/)
    assert.match(invalid[1].problems.join(), /steps/)
    assert.equal(stored(config, "no-steps"), undefined)
  })
})
