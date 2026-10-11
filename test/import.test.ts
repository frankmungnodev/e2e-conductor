import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { withDb } from "../src/db/connection.ts"
import { getDraft, saveDraft, saveDraftGroup, saveRevision } from "../src/db/drafts.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { getScenario, saveScenario } from "../src/db/scenarios.ts"
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
    assert.deepEqual(importFromJson(config), { added: ["smoke"], updated: [], unchanged: [], invalid: [], skipped: [] })
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
  it("lists a file that fails the step check, such as an unknown target, as invalid and saves nothing from it", () => {
    const config = project()
    write(config, "ghost.json", { name: "Ghost", steps: [{ name: "open", target: "ghost", command: "true" }] })
    write(config, "smoke.json", echo("Smoke"))

    const result = importFromJson(config)
    assert.deepEqual(result.added, ["smoke"])
    assert.deepEqual(
      result.invalid.map(({ file }) => file.split("/").pop()),
      ["ghost.json"],
    )
    assert.deepEqual(result.invalid[0].problems, ['steps[0] "open": unknown target "ghost" (config has: shell)'])
    assert.equal(stored(config, "ghost"), undefined)
  })

  it("skips a file whose id is a draft or a draft revision, naming the reason, and leaves the draft as it was", () => {
    const config = project()
    withDb(config.dbPath, (db) => {
      saveDraftGroup(db, { key: "login", prompt: "test login" })
      saveDraft(db, { id: "checkout", ...echo("Checkout") }, "login")
      saveScenario(db, { id: "smoke", ...echo("Smoke") })
      saveRevision(db, "smoke", { id: "smoke", ...echo("Smoke", "echo revised") }, "login")
    })
    write(config, "checkout.json", echo("Checkout", "echo from the file"))
    write(config, "smoke@draft.json", echo("Smoke", "echo from the file"))

    const result = importFromJson(config)
    assert.deepEqual(
      result.skipped.map(({ file }) => file.split("/").pop()),
      ["checkout.json", "smoke@draft.json"],
    )
    assert.match(result.skipped[0].reason, /draft/)
    assert.deepEqual([...result.added, ...result.updated], [])
    assert.equal(stored(config, "checkout")?.steps[0].command, "echo hi")
    assert.equal(stored(config, "smoke@draft")?.steps[0].command, "echo revised")
    assert.equal(withDb(config.dbPath, (db) => getDraft(db, "checkout"))?.state, "draft")
  })
})
