import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { StepRunRecord } from "../src/db/runs.ts"
import { buildRunReport } from "../src/run-report.ts"

const attempt = (index: number, n: number, status: StepRunRecord["status"], extra: Partial<StepRunRecord> = {}): StepRunRecord => ({
  id: `run-1:login:1:${index}:${n}`,
  runId: "run-1",
  scenarioId: "login",
  iteration: 1,
  attempt: n,
  status,
  durationMs: 10,
  createdAt: n,
  ...extra,
})

const version = JSON.stringify({
  steps: [
    { name: "open page", target: "web" },
    { name: "sign in", target: "web" },
    { name: "check api", target: "api" },
  ],
})

describe("buildRunReport", () => {
  it("names steps from the pinned content and collapses attempts, failed and not-run steps included", () => {
    const [report] = buildRunReport({
      scenarioRuns: [
        {
          runId: "run-1",
          scenarioId: "login",
          iteration: 1,
          fingerprint: "f1",
          status: "FAILED",
          artifactsDir: "login",
          startedAt: 1000,
          completedAt: 4000,
          changedSinceLastPass: true,
        },
      ],
      stepRuns: [
        attempt(0, 1, "FAILED"),
        attempt(0, 2, "PASSED"),
        attempt(1, 1, "FAILED", { errorMessage: "button not found", failureLabel: "Step error" }),
      ],
      versions: { f1: version },
      names: { login: "Login works" },
      files: { login: [{ name: "web-failure.png", url: "/x.png", isImage: true }] },
    })

    assert.equal(report.name, "Login works")
    assert.equal(report.durationMs, 3000)
    assert.equal(report.changedSinceLastPass, true)
    assert.equal(report.files.length, 1)
    assert.deepEqual(
      report.steps.map(({ name, status, attempts, recovered }) => ({ name, status, attempts, recovered })),
      [
        { name: "open page", status: "PASSED", attempts: 2, recovered: true },
        { name: "sign in", status: "FAILED", attempts: 1, recovered: false },
        { name: "check api", status: "NOT_RUN", attempts: 0, recovered: false },
      ],
    )
    assert.equal(report.steps[0].durationMs, 20)
    assert.equal(report.steps[1].error, "button not found")
    assert.equal(report.steps[1].failureLabel, "Step error")
  })

  it("marks a manual retry pass as fixed by hand, and falls back to ids and step numbers", () => {
    const [report] = buildRunReport({
      scenarioRuns: [
        { runId: "run-1", scenarioId: "login", iteration: 1, fingerprint: "gone", status: "FIXED", startedAt: 1, changedSinceLastPass: false },
      ],
      stepRuns: [attempt(0, 1, "FAILED"), attempt(0, 2, "PASSED", { manual: true })],
      versions: {},
      names: {},
      files: {},
    })
    assert.equal(report.name, "login")
    assert.equal(report.durationMs, undefined)
    assert.deepEqual(report.steps.map(({ name, fixedByHand, recovered }) => ({ name, fixedByHand, recovered })), [
      { name: "Step 1", fixedByHand: true, recovered: false },
    ])
  })
})
