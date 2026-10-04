import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HoldDecision, PausedStep, PauseHook } from "../src/hold.ts"
import { backend, execute, healthStep, project, storedScenarioRuns } from "./runner-project.ts"

const pass = (name = "Pass") => ({ name, target: "shell", command: "true" })

describe("runner pins each scenario-iteration to its content", () => {
  it("records a passed row per scenario and one version per distinct content", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [pass()] },
      { id: "b", name: "B", steps: [pass("Other")] },
    ])
    await execute(dir)

    const rows = storedScenarioRuns(dir)
    assert.deepEqual(
      rows.map((row) => [row.scenarioId, row.iteration, row.status, row.artifactsDir]),
      [
        ["a", 1, "PASSED", "a"],
        ["b", 1, "PASSED", "b"],
      ],
    )
    assert.notEqual(rows[0].fingerprint, rows[1].fingerprint)
    assert.match(rows[1].content, /"Other"/)
    assert.ok(rows.every((row) => row.completedAt !== undefined))
  })

  it("pins every --repeat iteration to the same content", async () => {
    const dir = project([{ id: "a", name: "A", steps: [pass()] }])
    await execute(dir, { repeat: 2 })

    const rows = storedScenarioRuns(dir)
    assert.deepEqual(
      rows.map((row) => [row.iteration, row.artifactsDir]),
      [
        [1, "a-1"],
        [2, "a-2"],
      ],
    )
    assert.equal(rows[0].fingerprint, rows[1].fingerprint)
  })

  it("records a failed setup fixture as a failed row", async () => {
    const dir = project([{ id: "a", name: "A", setup: ["seed"], steps: [pass()] }], { seed: "exit 1" })
    await execute(dir)

    assert.equal(storedScenarioRuns(dir)[0].status, "FAILED")
  })

  it("records only the scenario-iterations an environment-down stop let start", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [healthStep()] },
      { id: "b", name: "B", steps: [healthStep()] },
    ])
    await execute(dir, {}, (event) => {
      if (event.type === "preflight_done") backend.down = true
    })

    assert.deepEqual(
      storedScenarioRuns(dir).map((row) => [row.scenarioId, row.status]),
      [["a", "FAILED"]],
    )
  })

  it("records the scenario in progress as cancelled", async () => {
    const dir = project([{ id: "a", name: "A", steps: [{ name: "Fail", target: "shell", command: "exit 1" }] }])
    const controller = new AbortController()
    const outcome = execute(dir, { signal: controller.signal }, (event) => {
      if (event.type === "log" && event.text.startsWith("$ exit 1")) controller.abort()
    })
    await assert.rejects(outcome, /Execution cancelled/)

    assert.equal(storedScenarioRuns(dir)[0].status, "CANCELLED")
  })

  it("keeps the paused iteration on its content and gives the next iteration the saved fix (AE1)", async () => {
    const dir = project([{ id: "a", name: "A", steps: [{ name: "Broken", target: "shell", command: "exit 1" }] }])
    const decisions: Array<(paused: PausedStep) => HoldDecision> = [
      (paused) => ({ kind: "retry", step: { ...paused.step, command: "echo fixed" } }),
      () => ({ kind: "continue" }),
    ]
    const pause: PauseHook = async (paused) => {
      const next = decisions.shift()
      if (!next) throw new Error("unexpected pause")
      return next(paused)
    }
    await execute(dir, { repeat: 2, pause })

    const [first, second] = storedScenarioRuns(dir)
    assert.equal(first.status, "FIXED")
    assert.match(first.content, /exit 1/)
    assert.equal(second.status, "PASSED")
    assert.match(second.content, /echo fixed/)
    assert.notEqual(first.fingerprint, second.fingerprint)
  })
})
