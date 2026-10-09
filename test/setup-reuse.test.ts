import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { getScenario, saveScenario } from "../src/db/scenarios.ts"
import { exportToJson } from "../src/export.ts"
import { importFromJson } from "../src/import.ts"
import type { Scenario } from "../src/scenario.ts"
import { scenarioVersion } from "../src/scenario-version.ts"
import { validateScenario } from "../src/schema.ts"
import { heldAfter, reusableSetup } from "../src/setup-reuse.ts"
import { execute, healthStep, project } from "./runner-project.ts"
import { tempDir } from "./temp-dir.ts"

const scenario = (id: string, fields: Partial<Scenario> = {}): Scenario => ({ id, name: id, steps: [healthStep()], ...fields })
const held = { fixtures: JSON.stringify(["reset"]), ranIn: "01-a" }

describe("reusableSetup", () => {
  it("reuses a held setup only for the same fixture list", () => {
    assert.equal(reusableSetup(held, scenario("x", { setup: ["reset"] })), held)
    assert.equal(reusableSetup(held, scenario("x", { setup: ["reset", "seed"] })), undefined)
    assert.equal(reusableSetup(held, scenario("x", { setup: [] })), undefined)
    assert.equal(reusableSetup(undefined, scenario("x", { setup: ["reset"] })), undefined)
  })
})

describe("heldAfter", () => {
  const passed = {}

  it("holds nothing after a scenario that is not read-only", () => {
    assert.equal(heldAfter(held, scenario("x", { setup: ["reset"] }), "x", passed), undefined)
  })

  it("holds a read-only scenario's own setup when it passed", () => {
    assert.deepEqual(heldAfter(undefined, scenario("x", { setup: ["seed"], read_only: true }), "x", passed), {
      fixtures: JSON.stringify(["seed"]),
      ranIn: "x",
    })
  })

  it("keeps the scenario that ran a reused setup", () => {
    assert.equal(heldAfter(held, scenario("x", { setup: ["reset"], read_only: true }), "x", passed), held)
  })

  it("holds nothing after a read-only scenario with no setup, since its promise covers no fixture", () => {
    assert.equal(heldAfter(held, scenario("x", { read_only: true }), "x", passed), undefined)
  })

  it("holds nothing after a failed setup or a pause", () => {
    const readOnly = scenario("x", { setup: ["reset"], read_only: true })
    assert.equal(heldAfter(held, readOnly, "x", { setupFailed: true }), undefined)
    assert.equal(heldAfter(held, readOnly, "x", { paused: true }), undefined)
  })
})

describe("read_only storage and fingerprint", () => {
  it("round-trips read_only and leaves it off when false", () => {
    const db = openDatabase(join(tempDir("read-only"), "e2e.db"))
    try {
      saveScenario(db, scenario("ro", { read_only: true }))
      saveScenario(db, scenario("rw", { read_only: false }))
      assert.equal(getScenario(db, "ro")?.read_only, true)
      assert.equal("read_only" in (getScenario(db, "rw") ?? {}), false)
    } finally {
      db.close()
    }
  })

  it("adds the read_only column to a database made before it existed", () => {
    const path = join(tempDir("read-only-migrate"), "e2e.db")
    const old = new DatabaseSync(path)
    old.exec("CREATE TABLE scenarios (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, setup_fixtures TEXT, vars TEXT, created_at INTEGER, updated_at INTEGER)")
    old.exec("INSERT INTO scenarios (id, name) VALUES ('legacy', 'Legacy')")
    old.close()
    const db = openDatabase(path)
    try {
      const columns = (db.prepare("PRAGMA table_info(scenarios)").all() as Array<{ name: string }>).map((c) => c.name)
      assert.ok(columns.includes("read_only"))
      assert.equal("read_only" in (getScenario(db, "legacy") ?? {}), false)
    } finally {
      db.close()
    }
  })

  it("accepts read_only in scenario files and keeps it through export and import", async () => {
    assert.equal(validateScenario({ name: "x", read_only: true, steps: [healthStep()] }), true)
    assert.equal(validateScenario({ name: "x", read_only: "yes", steps: [healthStep()] }), false)

    const root = project([scenario("01-ro", { setup: ["reset"], read_only: true })], { reset: "true" })
    const config = await loadConfig(root)
    exportToJson(config)
    const file = join(root, "scenarios", "01-ro.json")
    assert.equal(JSON.parse(readFileSync(file, "utf8")).read_only, true)

    const edited = { ...JSON.parse(readFileSync(file, "utf8")) }
    delete edited.read_only
    writeFileSync(file, JSON.stringify(edited))
    assert.deepEqual(importFromJson(config).updated, ["01-ro"])
    const db = openDatabase(config.dbPath)
    try {
      assert.equal("read_only" in (getScenario(db, "01-ro") ?? {}), false)
    } finally {
      db.close()
    }
  })

  it("changes the fingerprint only when read_only is true", () => {
    const base = scenario("x", { setup: ["reset"] })
    assert.equal(scenarioVersion({ ...base, read_only: false }).fingerprint, scenarioVersion(base).fingerprint)
    assert.notEqual(scenarioVersion({ ...base, read_only: true }).fingerprint, scenarioVersion(base).fingerprint)
  })
})

describe("runner setup reuse", () => {
  const fixtureRuns = (dir: string) => readFileSync(join(dir, "fixture-runs.txt"), "utf8").trim().split("\n")

  it("skips a setup that only read-only scenarios ran since, and runs it after one that is not", async () => {
    const dir = tempDir("setup-reuse")
    const runs = join(dir, "fixture-runs.txt")
    const root = project(
      [
        scenario("01-a", { setup: ["reset"], read_only: true }),
        scenario("02-b", { setup: ["reset"], read_only: true }),
        scenario("03-c", { setup: ["reset"] }),
        scenario("04-d", { setup: ["reset"] }),
        scenario("05-e", { setup: ["reset", "seed"], read_only: true }),
      ],
      { reset: `echo reset >> "${runs}"`, seed: `echo seed >> "${runs}"` },
    )
    const { summary } = await execute(root)
    assert.equal(summary.passed, 5)
    // 01-a runs it; 02-b and 03-c reuse it; 03-c is not read-only, so 04-d runs it; 05-e has a different list.
    assert.deepEqual(fixtureRuns(dir), ["reset", "reset", "reset", "seed"])
  })

  it("runs the setup again after a failed setup, a pause, or a read-only scenario with no setup", async () => {
    const dir = tempDir("setup-reuse-ends")
    const runs = join(dir, "fixture-runs.txt")
    // `reset` fails on its first run only.
    const reset = `echo reset >> "${runs}"; [ $(wc -l < "${runs}") -gt 1 ]`
    const broken = { name: "Broken", target: "shell", command: "exit 1" }
    const root = project(
      [
        scenario("01-setup-fails", { setup: ["reset"], read_only: true }),
        scenario("02-pauses", { setup: ["reset"], read_only: true, steps: [broken] }),
        scenario("03-after-pause", { setup: ["reset"], read_only: true }),
        scenario("04-no-setup", { read_only: true }),
        scenario("05-after-no-setup", { setup: ["reset"], read_only: true }),
      ],
      { reset },
    )
    const { summary } = await execute(root, { pause: async () => ({ kind: "end" }) })
    assert.equal(summary.failed, 2)
    // 01 fails its setup, 02 runs it and pauses, 03 runs it after the pause, 05 runs it after 04.
    assert.equal(fixtureRuns(dir).length, 4)
  })

  it("runs a read-only scenario's setup once across --repeat iterations", async () => {
    const dir = tempDir("setup-reuse-repeat")
    const runs = join(dir, "fixture-runs.txt")
    const root = project([scenario("01-a", { setup: ["reset"], read_only: true })], { reset: `echo reset >> "${runs}"` })
    const { summary } = await execute(root, { repeat: 3 })
    assert.equal(summary.passed, 3)
    assert.deepEqual(fixtureRuns(dir), ["reset"])
  })
})
