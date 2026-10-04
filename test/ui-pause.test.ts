// Unit tests for the runner view's pause-on-failure helpers.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { finishToast } from "../ui/src/runResult.ts"
import type { PausedStep, RunEvent, ScenarioItem } from "../ui/src/types.ts"
import { buildExecutionTree } from "../ui/src/views/runner/executionTree.ts"
import { parseStepJson, pausedFrom } from "../ui/src/views/runner/pauseState.ts"
import { runCounts } from "../ui/src/views/runner/runCounts.ts"

const paused: PausedStep = {
  scenarioId: "a",
  iteration: 1,
  index: 1,
  step: { name: "Broken", target: "shell", command: "exit 1" } as PausedStep["step"],
  error: "exited 1",
  label: "Assertion failed",
  retryPassed: false,
  targets: ["shell"],
}
const holdStart: RunEvent = { type: "hold_start", stepName: "Broken", ...paused }

describe("pausedFrom", () => {
  it("is the step from hold_start, and clears on hold_end", () => {
    assert.deepEqual(pausedFrom([holdStart], null), paused)
    assert.equal(pausedFrom([holdStart, { type: "hold_end", scenarioId: "a", index: 1, how: "end" }], null), null)
  })

  it("tracks whether the last retry passed, and its new error when it failed", () => {
    const edited = { ...paused.step, command: "exit 2" }
    const failed: RunEvent = { type: "hold_retry", scenarioId: "a", index: 1, step: edited, replaces: "Broken", passed: false, duration_ms: 1, error: "exited 2", label: "Step error" }
    const passed: RunEvent = { type: "hold_retry", scenarioId: "a", index: 1, step: edited, replaces: "Broken", passed: true, duration_ms: 1 }
    assert.deepEqual(pausedFrom([holdStart, failed], null), { ...paused, step: edited, error: "exited 2", label: "Step error" })
    assert.equal(pausedFrom([holdStart, failed, passed], null)?.retryPassed, true)
  })

  it("uses the server's paused step until the stream says otherwise", () => {
    assert.deepEqual(pausedFrom([{ type: "connected", active: true }], paused), paused)
    assert.equal(pausedFrom([{ type: "run_start", runId: "r", totalScenarios: 1, repeat: 1, scenarios: [] }], paused), null)
  })
})

describe("parseStepJson", () => {
  it("accepts a step object with a name and target", () => {
    assert.deepEqual(parseStepJson('{"name":"Fixed","target":"shell","command":"true"}').step, { name: "Fixed", target: "shell", command: "true" })
  })

  it("explains invalid JSON, a non-object, and a missing name or target", () => {
    assert.match(parseStepJson("{").error ?? "", /Not valid JSON/)
    assert.match(parseStepJson("[]").error ?? "", /JSON object/)
    assert.match(parseStepJson('{"target":"shell"}').error ?? "", /name/)
    assert.match(parseStepJson('{"name":"x"}').error ?? "", /target/)
  })
})

describe("execution tree and counts with a fixed scenario", () => {
  const scenarios = [
    {
      id: "a",
      name: "A",
      steps: [
        { name: "Seed", target: "shell" },
        { name: "Broken", target: "shell" },
      ],
    },
  ] as unknown as ScenarioItem[]
  const events: RunEvent[] = [
    { type: "run_start", runId: "r", totalScenarios: 1, repeat: 1, scenarios: [{ id: "a", name: "A", stepsCount: 2 }] },
    { type: "scenario_start", scenarioId: "a", scenarioName: "A", iteration: 1, totalIterations: 1 },
    { type: "step_pass", scenarioId: "a", stepName: "Seed", target: "shell", index: 0, duration_ms: 1, recovered: false },
    { type: "step_fail", scenarioId: "a", stepName: "Broken", target: "shell", index: 1, duration_ms: 1, error: "exited 1", label: "Assertion failed" },
    holdStart,
    { type: "hold_retry", scenarioId: "a", index: 1, step: paused.step, replaces: "Broken", passed: false, duration_ms: 2, error: "exited 2", label: "Assertion failed" },
    { type: "hold_retry", scenarioId: "a", index: 1, step: paused.step, replaces: "Broken", passed: true, duration_ms: 3 },
    { type: "hold_end", scenarioId: "a", index: 1, how: "continue" },
    { type: "scenario_end", scenarioId: "a", iteration: 1, passed: false, fixed: true, duration_ms: 9 },
  ]

  it("marks the step fixed after its manual retries, and the scenario fixed", () => {
    const [a] = buildExecutionTree(events, scenarios)
    assert.equal(a.status, "fixed")
    assert.deepEqual(
      { status: a.steps[1].status, fixed: a.steps[1].fixed, retries: a.steps[1].manualRetries, error: a.steps[1].error },
      { status: "passed", fixed: true, retries: 2, error: undefined },
    )
  })

  it("counts fixed scenarios apart from passed and failed, and as complete", () => {
    const counts = runCounts(buildExecutionTree(events, scenarios))
    assert.deepEqual(counts, { passed: 0, failed: 0, fixed: 1, notRun: 0, recovered: 0, total: 1, percent: 100 })
  })

  it("shows a fixed-during-run toast", () => {
    const toast = finishToast({ status: "FAILED", reason: "fixed during run", fixed: 1, total: 1, passed: 0, failed: 0, duration_ms: 1, failures: [], artifacts: "" })
    assert.equal(toast.title, "Fixed During Run")
    assert.match(toast.message, /1 scenario was fixed/)
  })
})
