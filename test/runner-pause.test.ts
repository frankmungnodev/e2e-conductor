import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { HoldController, type HoldDecision, type PausedStep, type PauseHook } from "../src/hold.ts"
import type { RunEvent } from "../src/runner.ts"
import type { Scenario } from "../src/scenario.ts"
import { backend, execute, healthStep, project, storedRun } from "./runner-project.ts"
import { tempDir } from "./temp-dir.ts"

describe("runner pause on failure", () => {
  // Answers each pause with the next scripted decision and records what the loop paused on.
  function scripted(...decisions: Array<(paused: PausedStep) => HoldDecision>) {
    const seen: PausedStep[] = []
    const pause: PauseHook = async (paused) => {
      seen.push(paused)
      const next = decisions.shift()
      if (!next) throw new Error(`unexpected pause on ${paused.step.name}`)
      return next(paused)
    }
    return { pause, seen }
  }
  const retry = (command: string) => (paused: PausedStep): HoldDecision => ({ kind: "retry", step: { ...paused.step, command } })
  const proceed = (): HoldDecision => ({ kind: "continue" })
  const end = (): HoldDecision => ({ kind: "end" })

  const threeSteps = (last = "echo ${ctx.seed}"): Scenario => ({
    id: "a",
    name: "A",
    steps: [
      { name: "Seed", target: "shell", command: "echo seeded", extract: { seed: "stdout" } },
      { name: "Broken", target: "shell", command: "exit 1" },
      { name: "Uses value", target: "shell", command: last },
    ],
  })

  it("retries the edited step on the live run, continues, and marks the scenario fixed (AE1)", async () => {
    const dir = project([threeSteps("echo ${ctx.seed}-${ctx.fixed}")])
    // The fixed step extracts a value the next step reads, so the scope carries across the pause.
    const fix = (paused: PausedStep): HoldDecision => ({
      kind: "retry",
      step: { ...paused.step, command: "echo fixed", extract: { fixed: "stdout" } },
    })
    const { pause, seen } = scripted(fix, proceed)
    const { summary, events } = await execute(dir, { pause })

    assert.equal(seen.length, 2)
    assert.equal(seen[0].index, 1)
    assert.equal(seen[0].label, "Assertion failed")
    assert.equal(seen[1].retryPassed, true)
    const lastPass = events.filter((event) => event.type === "step_pass").at(-1)
    assert.equal(lastPass?.type === "step_pass" && lastPass.index, 2)
    const scenarioEnd = events.find((event) => event.type === "scenario_end")
    assert.equal(scenarioEnd?.type === "scenario_end" && scenarioEnd.fixed, true)
    assert.equal(scenarioEnd?.type === "scenario_end" && scenarioEnd.passed, false)
    assert.ok(events.some((event) => event.type === "log" && event.text.includes("seeded-fixed")))
    assert.equal(summary.failed, 0)
  })

  it("ends the scenario failed with the original label, then runs the next scenario (AE2)", async () => {
    const dir = project([threeSteps(), { id: "b", name: "B", steps: [{ name: "Pass", target: "shell", command: "true" }] }])
    const { pause } = scripted(end)
    const { summary } = await execute(dir, { pause })

    assert.equal(summary.failed, 1)
    assert.equal(summary.passed, 1)
    assert.equal(summary.failures[0].step, "Broken")
    assert.equal(summary.failures[0].label, "Assertion failed")
    assert.equal(storedRun(dir)?.stepRuns.filter((row) => row.manual).length, 0)
  })

  it("never pauses on an environment-down failure (AE3)", async () => {
    const dir = project([{ id: "a", name: "A", steps: [healthStep(), { name: "Fail", target: "shell", command: "exit 1" }] }])
    const { pause, seen } = scripted()
    const { summary } = await execute(dir, { pause }, (event) => {
      if (event.type === "step_pass") backend.down = true
    })

    assert.equal(seen.length, 0)
    assert.equal(summary.reason, "environment down")
  })

  it("stays paused after a failed retry, and continues after a later one passes", async () => {
    const dir = project([threeSteps()])
    const { pause, seen } = scripted(retry("exit 2"), retry("true"), proceed)
    const { events } = await execute(dir, { pause })

    assert.equal(seen.length, 3)
    assert.equal(seen[1].retryPassed, false)
    assert.match(seen[1].error, /2/)
    const retries = events.filter((event) => event.type === "hold_retry")
    assert.deepEqual(
      retries.map((event) => event.type === "hold_retry" && event.passed),
      [false, true],
    )
    const rows = (storedRun(dir)?.stepRuns ?? []).filter((row) => row.manual).sort((x, y) => x.attempt - y.attempt)
    assert.deepEqual(
      rows.map((row) => [row.attempt, row.status]),
      [
        [2, "FAILED"],
        [3, "PASSED"],
      ],
    )
  })

  it("stops the run when a retry fails with the environment down", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [healthStep(), { name: "Broken", target: "shell", command: "exit 1" }] },
      { id: "b", name: "B", steps: [{ name: "Pass", target: "shell", command: "true" }] },
    ])
    const { pause } = scripted((paused) => {
      backend.down = true
      return { kind: "retry", step: paused.step }
    })
    const { summary, events } = await execute(dir, { pause })

    assert.equal(summary.reason, "environment down")
    assert.equal(summary.failures[0].label, "Environment down")
    assert.deepEqual(summary.notRun, [{ scenario: "b", iteration: 1 }])
    const last = events.filter((event) => event.type === "hold_end").at(-1)
    assert.equal(last?.type === "hold_end" && last.how, "stopped")
  })

  it("cancels while paused, and the scenario is not counted passed", async () => {
    const dir = project([threeSteps()])
    const controller = new AbortController()
    const hold = new HoldController(controller.signal)
    const ends: RunEvent[] = []
    const outcome = execute(dir, { pause: hold.hook, signal: controller.signal }, (event) => {
      if (event.type === "hold_start") controller.abort()
      if (event.type === "scenario_end") ends.push(event)
    })

    await assert.rejects(outcome, /Execution cancelled/)
    assert.equal(ends[0]?.type === "scenario_end" && ends[0].passed, false)
    assert.equal(storedRun(dir)?.status, "CANCELLED")
  })

  it("does not pause on a failed setup fixture", async () => {
    const dir = project([{ id: "a", name: "A", setup: ["broken"], steps: [{ name: "Pass", target: "shell", command: "true" }] }], {
      broken: "exit 1",
    })
    const { pause, seen } = scripted()
    const { summary } = await execute(dir, { pause })

    assert.equal(seen.length, 0)
    assert.equal(summary.failed, 1)
  })

  it("uses the fixed step in later iterations of the run", async () => {
    const dir = project([threeSteps()])
    const { pause, seen } = scripted(retry("true"), proceed)
    const { summary } = await execute(dir, { pause, repeat: 2 })

    assert.equal(seen.length, 2, "iteration 2 runs the fix and never pauses")
    assert.equal(summary.failed, 0)
  })

  it("fails a run with a fixed scenario, counted apart from passed and failed (AE4)", async () => {
    const pass = (id: string): Scenario => ({ id, name: id, steps: [{ name: "Pass", target: "shell", command: "true" }] })
    const dir = project([pass("p1"), threeSteps(), pass("p2")])
    const { pause } = scripted(retry("true"), proceed)
    const { summary, events } = await execute(dir, { pause })

    assert.equal(summary.status, "FAILED")
    assert.equal(summary.reason, "fixed during run")
    assert.deepEqual([summary.passed, summary.failed, summary.fixed, summary.total], [2, 0, 1, 3])
    assert.ok(events.some((event) => event.type === "log" && event.text.includes("FAILED (fixed during run): 2/3 passed, 1 fixed")))
    const stored = storedRun(dir)
    assert.equal(stored?.status, "FAILED")
    assert.equal(stored?.reason, "fixed during run")
    assert.equal(stored?.fixedScenarios, 1)
    assert.equal(stored?.passedScenarios, 2)
  })

  it("lets an environment-down stop in a later scenario take precedence over an earlier fix", async () => {
    const dir = project([threeSteps(), { id: "b", name: "B", steps: [healthStep()] }])
    const { pause } = scripted(retry("true"), () => {
      backend.down = true
      return proceed()
    })
    const { summary } = await execute(dir, { pause })

    assert.equal(summary.reason, "environment down")
    assert.equal(summary.fixed, 1)
    assert.equal(summary.failed, 1)
  })

  it("reports a fixed run as fixed, not strict, when it also has recovered steps", async () => {
    const marker = join(tempDir("marker"), "attempted")
    const flakyThenBroken: Scenario = {
      id: "a",
      name: "A",
      steps: [
        { name: "Flaky", target: "shell", command: `test -f '${marker}' || { touch '${marker}'; exit 1; }`, retry: { times: 1, delay_ms: 0 } },
        { name: "Broken", target: "shell", command: "exit 1" },
      ],
    }
    const dir = project([flakyThenBroken])
    const { pause } = scripted(retry("true"), proceed)
    const { summary } = await execute(dir, { pause, strict: true })

    assert.equal(summary.reason, "fixed during run")
    assert.equal(summary.recovered, 1)
  })

  it("does not count a step that passed on a manual retry as recovered", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [{ name: "Broken", target: "shell", command: "exit 1", retry: { times: 1, delay_ms: 0 } }] },
    ])
    const { pause } = scripted(retry("true"), proceed)
    const { summary } = await execute(dir, { pause })

    assert.equal(summary.recovered, 0)
    assert.equal(storedRun(dir)?.recoveredSteps, 0)
  })

  it("behaves as before without a pause hook (AE5)", async () => {
    const dir = project([threeSteps()])
    const { summary, events } = await execute(dir)

    assert.equal(summary.failed, 1)
    assert.ok(!events.some((event) => event.type.startsWith("hold_")))
  })
})
