import assert from "node:assert/strict"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"
import { openDatabase } from "../src/db/connection.ts"
import {
  getScenarioRuns,
  getScenarioVersion,
  lastScenarioRun,
  passedOnContent,
  type ScenarioRunRecord,
  type ScenarioRunStatus,
  saveScenarioRun,
  saveScenarioVersion,
} from "../src/db/scenario-runs.ts"
import { tempDir } from "./temp-dir.ts"

const dir = tempDir("scenario-runs")
let dbCount = 0
const freshDb = () => openDatabase(join(dir, `e2e-${++dbCount}.db`))

// One scenario-iteration of `01-smoke`; later runs start later.
const row = (runId: string, startedAt: number, fingerprint: string, status: ScenarioRunStatus, extra: Partial<ScenarioRunRecord> = {}) => ({
  runId,
  scenarioId: "01-smoke",
  iteration: 1,
  fingerprint,
  status,
  artifactsDir: "01-smoke",
  startedAt,
  ...extra,
})

const changed = (db: DatabaseSync, runId: string, iteration = 1) =>
  getScenarioRuns(db, runId).find((r) => r.scenarioId === "01-smoke" && r.iteration === iteration)?.changedSinceLastPass

describe("scenario runs and versions", () => {
  it("stores each version once, keeping the first content", () => {
    const db = freshDb()
    saveScenarioVersion(db, "abc", '{"steps":[]}')
    saveScenarioVersion(db, "abc", '{"other":true}')
    assert.equal(getScenarioVersion(db, "abc"), '{"steps":[]}')
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM scenario_versions").get() as { count: number }
    assert.equal(count, 1)
    assert.equal(getScenarioVersion(db, "missing"), undefined)
  })

  it("updates a scenario run from RUNNING to its outcome", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "RUNNING"))
    saveScenarioRun(db, row("run-1", 100, "a", "FAILED", { completedAt: 200 }))
    const runs = getScenarioRuns(db, "run-1")
    assert.equal(runs.length, 1)
    assert.equal(runs[0].status, "FAILED")
    assert.equal(runs[0].completedAt, 200)
    assert.equal(runs[0].artifactsDir, "01-smoke")
  })

  it("marks a run whose last pass had different content", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    saveScenarioRun(db, row("run-2", 200, "b", "FAILED"))
    saveScenarioRun(db, row("run-3", 300, "a", "FAILED"))
    assert.equal(changed(db, "run-2"), true)
    // Reverted to the content that last passed.
    assert.equal(changed(db, "run-3"), false)
  })

  it("does not mark a run with no earlier pass", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "FAILED"))
    assert.equal(changed(db, "run-1"), false)
  })

  it("only counts a plain pass as the last pass", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    for (const [index, status] of (["FIXED", "FAILED", "CANCELLED", "RUNNING"] as const).entries()) {
      saveScenarioRun(db, row(`run-other-${index}`, 200 + index, "b", status))
    }
    saveScenarioRun(db, row("run-2", 300, "b", "FAILED"))
    assert.equal(changed(db, "run-2"), true)
  })

  it("compares against the latest earlier pass, from any environment and run", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    saveScenarioRun(db, row("run-2", 200, "b", "PASSED"))
    saveScenarioRun(db, row("run-3", 300, "b", "FAILED"))
    assert.equal(changed(db, "run-3"), false)
    // A later pass does not change an earlier row's marker.
    saveScenarioRun(db, row("run-4", 400, "c", "PASSED"))
    assert.equal(changed(db, "run-3"), false)
    assert.equal(changed(db, "run-2"), true)
  })

  it("compares iterations of one run against the earlier iteration", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED", { iteration: 1, artifactsDir: "01-smoke-1" }))
    saveScenarioRun(db, row("run-1", 150, "b", "FAILED", { iteration: 2, artifactsDir: "01-smoke-2" }))
    assert.equal(changed(db, "run-1", 1), false)
    assert.equal(changed(db, "run-1", 2), true)
  })

  it("adds both tables to a database created before them", () => {
    const path = join(dir, "old.db")
    const old = new DatabaseSync(path)
    old.exec("CREATE TABLE runs (id TEXT PRIMARY KEY, environment_name TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER)")
    old.exec("INSERT INTO runs (id, environment_name, status) VALUES ('kept', 'dev', 'PASSED')")
    old.close()
    const db = openDatabase(path)
    saveScenarioRun(db, row("kept", 100, "a", "PASSED"))
    assert.equal(getScenarioRuns(db, "kept").length, 1)
    assert.ok(db.prepare("SELECT id FROM runs WHERE id = 'kept'").get())
  })
})

describe("passed on current content", () => {
  it("is true after a run that passed on the content, and false for other content", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    assert.equal(passedOnContent(db, "01-smoke", "a"), true)
    assert.equal(passedOnContent(db, "01-smoke", "b"), false)
    assert.equal(passedOnContent(db, "02-other", "a"), false)
  })

  it("does not count a FIXED scenario run", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "FIXED"))
    assert.equal(passedOnContent(db, "01-smoke", "a"), false)
  })

  it("does not count a run where a later iteration failed", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED", { iteration: 1 }))
    saveScenarioRun(db, row("run-1", 150, "a", "FAILED", { iteration: 2 }))
    assert.equal(passedOnContent(db, "01-smoke", "a"), false)
  })

  it("is cleared by a later failed run on the same content", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    saveScenarioRun(db, row("run-2", 200, "a", "FAILED"))
    assert.equal(passedOnContent(db, "01-smoke", "a"), false)
  })

  it("ignores later runs on other content", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    saveScenarioRun(db, row("run-2", 200, "b", "FAILED"))
    assert.equal(passedOnContent(db, "01-smoke", "a"), true)
  })
})

describe("last scenario run", () => {
  it("is undefined for a scenario that never ran", () => {
    assert.equal(lastScenarioRun(freshDb(), "01-smoke"), undefined)
  })

  it("reports the latest run, failed when any of its iterations failed", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "PASSED"))
    saveScenarioRun(db, row("run-2", 200, "a", "PASSED", { iteration: 1 }))
    saveScenarioRun(db, row("run-2", 250, "a", "FAILED", { iteration: 2 }))
    assert.deepEqual(lastScenarioRun(db, "01-smoke"), { runId: "run-2", status: "FAILED" })
  })

  it("reports a run whose iterations all passed as passed", () => {
    const db = freshDb()
    saveScenarioRun(db, row("run-1", 100, "a", "FAILED"))
    saveScenarioRun(db, row("run-2", 200, "b", "PASSED"))
    assert.deepEqual(lastScenarioRun(db, "01-smoke"), { runId: "run-2", status: "PASSED" })
  })
})
