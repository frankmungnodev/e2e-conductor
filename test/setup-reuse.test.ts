import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { openDatabase } from "../src/db/connection.ts"
import { getScenario, saveScenario } from "../src/db/scenarios.ts"
import type { Scenario } from "../src/scenario.ts"
import { scenarioVersion } from "../src/scenario-version.ts"
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
  it("holds nothing after a scenario that is not read-only", () => {
    assert.equal(heldAfter(held, scenario("x", { setup: ["reset"] }), "x", false), undefined)
  })

  it("holds a read-only scenario's own setup when it passed", () => {
    assert.deepEqual(heldAfter(undefined, scenario("x", { setup: ["seed"], read_only: true }), "x", false), {
      fixtures: JSON.stringify(["seed"]),
      ranIn: "x",
    })
  })

  it("keeps the scenario that ran a reused setup", () => {
    assert.equal(heldAfter(held, scenario("x", { setup: ["reset"], read_only: true }), "x", false), held)
  })

  it("keeps what held before a read-only scenario with no setup", () => {
    assert.equal(heldAfter(held, scenario("x", { read_only: true }), "x", false), held)
  })

  it("holds nothing after a failed setup", () => {
    assert.equal(heldAfter(held, scenario("x", { setup: ["reset"], read_only: true }), "x", true), undefined)
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

  it("runs a read-only scenario's setup once across --repeat iterations", async () => {
    const dir = tempDir("setup-reuse-repeat")
    const runs = join(dir, "fixture-runs.txt")
    const root = project([scenario("01-a", { setup: ["reset"], read_only: true })], { reset: `echo reset >> "${runs}"` })
    const { summary } = await execute(root, { repeat: 3 })
    assert.equal(summary.passed, 3)
    assert.deepEqual(fixtureRuns(dir), ["reset"])
  })
})
