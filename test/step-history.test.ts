import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { openDatabase } from "../src/db/connection.ts"
import { saveRun, saveStepRun } from "../src/db/runs.ts"
import { getStepExecutions, type StepExecution, summarizeStepHistory } from "../src/db/step-history.ts"
import { tempDir } from "./temp-dir.ts"

const execution = (overrides: Partial<StepExecution>): StepExecution => ({
  stepId: "s1",
  status: "PASSED",
  attempt: 1,
  durationMs: 100,
  createdAt: 0,
  ...overrides,
})

describe("step history", () => {
  it("reads one execution per step per scenario-iteration from its last automatic attempt", () => {
    const db = openDatabase(join(tempDir("step-history"), "e2e.db"))
    saveRun(db, { id: "r1", environmentName: "main", status: "FAILED", totalScenarios: 1, passedScenarios: 0, failedScenarios: 1, startedAt: 1 })
    const row = (id: string, iteration: number, attempt: number, status: string, manual = false) =>
      saveStepRun(db, {
        id,
        runId: "r1",
        stepId: "s1",
        scenarioId: "login",
        iteration,
        attempt,
        status: status as "PASSED",
        durationMs: 10 * attempt,
        createdAt: iteration * 100 + attempt,
        manual,
      })
    row("a", 1, 1, "FAILED")
    row("b", 1, 2, "PASSED")
    row("c", 2, 1, "FAILED")
    row("d", 2, 2, "PASSED", true)
    row("e", 3, 1, "CANCELLED")

    const executions = getStepExecutions(db, "login").sort((x, y) => x.createdAt - y.createdAt)

    assert.deepEqual(
      executions.map(({ status, attempt }) => [status, attempt]),
      [
        ["PASSED", 2],
        ["FAILED", 1],
      ],
    )
  })

  it("counts first-attempt passes, retry passes and failures over the latest executions", () => {
    const history = summarizeStepHistory(
      [
        execution({ createdAt: 1, status: "FAILED" }),
        execution({ createdAt: 2, attempt: 2 }),
        execution({ createdAt: 3 }),
        execution({ createdAt: 4 }),
      ],
      3,
    )

    assert.deepEqual(history.s1, {
      executions: 3,
      passed: 2,
      recovered: 1,
      failed: 0,
      p95Ms: 100,
      recent: ["PASSED", "PASSED", "RECOVERED"],
    })
  })

  it("takes p95 from passing durations by nearest rank, and leaves it out with no pass", () => {
    const passes = Array.from({ length: 20 }, (_, i) => execution({ createdAt: i, durationMs: (i + 1) * 10 }))
    assert.equal(summarizeStepHistory(passes).s1.p95Ms, 190)
    assert.equal(summarizeStepHistory([execution({ status: "FAILED" })]).s1.p95Ms, undefined)
  })
})
