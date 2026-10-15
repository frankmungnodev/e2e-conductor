import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import type { RunEvent } from "../src/runner.ts"
import type { Scenario } from "../src/scenario.ts"
import { backend, draftProject, execute, healthStep, project, storedRun } from "./runner-project.ts"
import { tempDir } from "./temp-dir.ts"

describe("runner failure labels and environment stop", () => {
  it("stops the run when the backend dies, listing the rest as not run (AE1)", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [healthStep()] },
      { id: "b", name: "B", steps: [healthStep()] },
      { id: "c", name: "C", steps: [healthStep()] },
    ])
    const { summary, events } = await execute(dir, {}, (event) => {
      if (event.type === "preflight_done") backend.down = true
    })

    assert.equal(summary.status, "FAILED")
    assert.equal(summary.reason, "environment down")
    assert.deepEqual(summary.down, [`service backend (${backend.url})`])
    assert.deepEqual(summary.notRun, [
      { scenario: "b", iteration: 1 },
      { scenario: "c", iteration: 1 },
    ])
    assert.equal(summary.total, 3)
    assert.equal(summary.failed, 1)
    assert.equal(summary.failures[0].label, "Environment down")

    const stepFail = events.find((event) => event.type === "step_fail")
    assert.equal(stepFail?.type === "step_fail" && stepFail.label, "Environment down")
    const ends = events.filter((event) => event.type === "scenario_end")
    assert.equal(ends.length, 1)
    assert.equal(ends[0].type === "scenario_end" && ends[0].passed, false)
    assert.ok(events.some((event) => event.type === "finish"))
    assert.ok(events.some((event) => event.type === "log" && /checking/i.test(event.text)))

    const written = JSON.parse(readFileSync(join(dir, "results", "summary.json"), "utf8"))
    assert.equal(written.reason, "environment down")
    assert.equal(written.notRun.length, 2)

    const stored = storedRun(dir)
    assert.equal(stored?.status, "FAILED")
    assert.equal(stored?.reason, "environment down")
    assert.equal(stored?.notRunScenarios, 2)
    assert.equal(stored?.stepRuns.at(-1)?.failureLabel, "Environment down")
  })

  it("labels a setup fixture that fails while the backend is down, and stops (AE6)", async () => {
    const dir = project(
      [
        { id: "a", name: "A", setup: ["seed"], steps: [healthStep()] },
        { id: "b", name: "B", steps: [healthStep()] },
      ],
      { seed: "exit 1" },
    )
    const { summary, events } = await execute(dir, {}, (event) => {
      if (event.type === "preflight_done") backend.down = true
    })

    assert.equal(summary.reason, "environment down")
    assert.equal(summary.failures[0].step, "setup: seed")
    assert.equal(summary.failures[0].label, "Environment down")
    assert.deepEqual(summary.notRun, [{ scenario: "b", iteration: 1 }])
    const end = events.find((event) => event.type === "scenario_end")
    assert.ok(end?.type === "scenario_end")
    assert.equal(end.passed, false)
    assert.equal(end.label, "Environment down")
  })

  it("labels a fixture failure on a healthy backend as a step error and keeps going", async () => {
    const dir = project(
      [
        { id: "a", name: "A", setup: ["seed"], steps: [healthStep()] },
        { id: "b", name: "B", steps: [healthStep()] },
      ],
      { seed: "exit 1" },
    )
    const { summary, events } = await execute(dir)

    assert.equal(summary.status, "FAILED")
    assert.equal(summary.reason, undefined)
    assert.equal(summary.failures[0].label, "Step error")
    assert.equal(summary.passed, 1)
    assert.deepEqual(summary.notRun, [])
    const end = events.find((event) => event.type === "scenario_end")
    assert.equal(end?.type === "scenario_end" && end.label, "Step error")
  })

  it("lists the rest of the iteration and every later iteration as not run under --repeat", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [healthStep()] },
      { id: "b", name: "B", steps: [healthStep()] },
      { id: "c", name: "C", steps: [healthStep()] },
    ])
    const { summary } = await execute(dir, { repeat: 2 }, (event) => {
      if (event.type === "scenario_start" && event.scenarioId === "b") backend.down = true
    })

    assert.deepEqual(summary.notRun, [
      { scenario: "c", iteration: 1 },
      { scenario: "a", iteration: 2 },
      { scenario: "b", iteration: 2 },
      { scenario: "c", iteration: 2 },
    ])
    assert.equal(summary.passed, 1)
    assert.equal(summary.failed, 1)
    assert.equal(summary.passed + summary.failed + summary.notRun.length, 6)
    assert.equal(summary.total, 6)
  })

  it("re-checks a shell-only run, finds nothing down and labels by the error", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [{ name: "Fail", target: "shell", command: "exit 3" }] },
      { id: "b", name: "B", steps: [{ name: "Pass", target: "shell", command: "true" }] },
    ])
    const { summary, events } = await execute(dir)

    assert.equal(summary.status, "FAILED")
    assert.equal(summary.reason, undefined)
    assert.equal(summary.down, undefined)
    assert.equal(summary.failures[0].label, "Assertion failed")
    assert.equal(summary.passed, 1)
    assert.ok(events.some((event) => event.type === "log" && /checking/i.test(event.text)))
    assert.equal(storedRun(dir)?.stepRuns.find((row) => row.status === "FAILED")?.failureLabel, "Assertion failed")
  })

  it("still throws on cancel during a failing step, and stores no label", async () => {
    const dir = project([{ id: "a", name: "A", steps: [{ name: "Fail", target: "shell", command: "exit 1" }] }])
    const controller = new AbortController()
    const ends: RunEvent[] = []
    // The shell driver logs its command just before running it, after the attempt's own
    // cancel check, so aborting here cancels while the failing step is running.
    const outcome = execute(dir, { signal: controller.signal }, (event) => {
      if (event.type === "log" && event.text.startsWith("$ exit 1")) controller.abort()
      if (event.type === "scenario_end") ends.push(event)
    })

    await assert.rejects(outcome, /Execution cancelled/)
    // Cancelling skips the label, never the failure: the scenario still ends failed.
    assert.equal(ends.length, 1)
    assert.equal(ends[0].type === "scenario_end" && ends[0].passed, false)
    assert.equal(ends[0].type === "scenario_end" && ends[0].label, undefined)
    const stored = storedRun(dir)
    assert.equal(stored?.status, "CANCELLED")
    assert.equal(stored?.stepRuns[0].status, "FAILED")
    assert.equal(stored?.stepRuns[0].failureLabel, undefined)
  })
})

describe("runner re-check timing", () => {
  it("re-checks and labels only after the final retry attempt", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [{ name: "Always fails", target: "shell", command: "exit 1", retry: { times: 2, delay_ms: 0 } }] },
    ])
    const { events } = await execute(dir)

    assert.equal(events.filter((event) => event.type === "log" && /checking services/.test(event.text)).length, 1)
    const rows = (storedRun(dir)?.stepRuns ?? []).sort((x, y) => x.attempt - y.attempt)
    assert.deepEqual(
      rows.map((row) => [row.attempt, row.failureLabel]),
      [
        [1, undefined],
        [2, undefined],
        [3, "Assertion failed"],
      ],
    )
  })
})

describe("runner recovered steps", () => {
  const flaky = (marker: string): Scenario => ({
    id: "flaky",
    name: "Flaky",
    steps: [
      {
        name: "Second time lucky",
        target: "shell",
        command: `test -f '${marker}' || { touch '${marker}'; exit 1; }`,
        retry: { times: 1, delay_ms: 0 },
      },
    ],
  })

  it("passes a step that passed on retry, marked recovered (AE2)", async () => {
    const marker = join(tempDir("marker"), "attempted")
    const withFlaky = project([flaky(marker)])
    const { summary, events } = await execute(withFlaky)

    assert.ok(existsSync(marker))
    assert.equal(summary.status, "PASSED")
    assert.equal(summary.recovered, 1)
    assert.equal(summary.reason, undefined)
    const pass = events.find((event) => event.type === "step_pass")
    assert.equal(pass?.type === "step_pass" && pass.recovered, true)
    assert.equal(storedRun(withFlaky)?.recoveredSteps, 1)
  })

  it("fails a recovered run under strict (AE5)", async () => {
    const withFlaky = project([flaky(join(tempDir("marker"), "attempted"))])
    const { summary } = await execute(withFlaky, { strict: true })

    assert.equal(summary.status, "FAILED")
    assert.equal(summary.reason, "recovered steps (strict)")
    assert.equal(summary.strict, true)
    assert.equal(summary.failed, 0)
    assert.equal(storedRun(withFlaky)?.status, "FAILED")
  })

  it("keeps each iteration's step runs as separate rows", async () => {
    const dir = project([{ id: "a", name: "A", steps: [{ name: "Pass", target: "shell", command: "true" }] }])
    const { summary } = await execute(dir, { repeat: 2 })

    assert.equal(summary.recovered, 0)
    const rows = storedRun(dir)?.stepRuns ?? []
    assert.deepEqual(rows.map((row) => row.iteration).sort(), [1, 2])
  })

  it("keeps the response of a step whose assertion failed, and its HTTP exchanges", async () => {
    const dir = project([
      { id: "a", name: "A", steps: [{ ...healthStep(), assert: { status: 201 } }] },
    ])
    await execute(dir)

    const [row] = storedRun(dir)?.stepRuns ?? []
    assert.equal(row.status, "FAILED")
    assert.equal(row.statusCode, 200)
    assert.deepEqual(row.resultData, { ok: true })
    assert.ok(row.artifactsPath && existsSync(join(row.artifactsPath, "http-exchanges.json")))
  })
})

describe("runner draft safety", () => {
  const shell = (id: string): Scenario => ({ id, name: id, steps: [{ name: "Pass", target: "shell", command: "true" }] })
  const ran = (events: RunEvent[]) => {
    const start = events.find((event) => event.type === "run_start")
    return start?.type === "run_start" ? start.scenarios.map((scenario) => scenario.id) : []
  }
  /** Runs with `E2E_ENV` set, restoring it afterwards. */
  async function withE2eEnv<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const before = process.env.E2E_ENV
    process.env.E2E_ENV = name
    try {
      return await fn()
    } finally {
      if (before === undefined) delete process.env.E2E_ENV
      else process.env.E2E_ENV = before
    }
  }

  it("runs only kept scenarios when no filter is given (AE4)", async () => {
    const dir = draftProject([shell("kept")], [shell("draft")], ["dev"])
    const { summary, events } = await execute(dir)

    assert.deepEqual(ran(events), ["kept"])
    assert.equal(summary.total, 1)
  })

  it("leaves a draft out of a substring filter that also matches a kept scenario", async () => {
    const dir = draftProject([shell("login-admin")], [shell("login")])
    const { events } = await execute(dir, { scenarios: ["login"] })

    assert.deepEqual(ran(events), ["login-admin"])
  })

  it("starts an ordinary run when a draft is invalid", async () => {
    const invalid: Scenario = { id: "broken", name: "Broken", steps: [{ name: "Nowhere", target: "nope", command: "true" }] }
    const dir = draftProject([shell("kept")], [invalid])
    const { summary, events } = await execute(dir)

    assert.equal(summary.status, "PASSED")
    assert.deepEqual(ran(events), ["kept"])
  })

  it("says a filter matched only drafts instead of running them", async () => {
    const dir = draftProject([shell("kept")], [shell("login")])

    await assert.rejects(execute(dir, { scenarios: ["login"] }), /"login" matches only drafts \(login\).*Drafts tab/)
  })

  it("exits 1 from the CLI when -s matches only drafts", () => {
    const dir = draftProject([shell("kept")], [shell("login")])
    const cli = resolve(import.meta.dirname, "..", "bin", "e2e-conductor.mjs")
    const result = spawnSync(process.execPath, [cli, "run", "-d", dir, "-s", "login"], { encoding: "utf8" })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /"login" matches only drafts \(login\).*Drafts tab/)
  })

  it("runs exactly the drafts it is given on a marked environment", async () => {
    const dir = draftProject([shell("kept")], [shell("draft-a"), shell("draft-b")], ["dev"])
    const { summary, events } = await execute(dir, { drafts: ["draft-b"] })

    assert.equal(summary.status, "PASSED")
    assert.deepEqual(ran(events), ["draft-b"])
  })

  it("refuses a draft run when E2E_ENV names an unmarked environment, naming the marked ones (AE5)", async () => {
    const dir = draftProject([shell("kept")], [shell("draft")], ["staging"])
    const events: RunEvent[] = []

    await withE2eEnv("dev", () =>
      assert.rejects(
        execute(dir, { drafts: ["draft"] }, (event) => events.push(event)),
        /environment "dev" does not allow drafts\. Environments that allow drafts: staging/,
      ),
    )
    assert.deepEqual(ran(events), [])
  })

  it("refuses a draft run when no environment is marked, saying where the mark is set", async () => {
    const dir = draftProject([shell("kept")], [shell("draft")])

    await assert.rejects(execute(dir, { drafts: ["draft"] }), /No environment allows drafts.*Config view/)
  })

  it("refuses a draft run that names a kept scenario", async () => {
    const dir = draftProject([shell("kept")], [shell("draft")], ["dev"])

    await assert.rejects(execute(dir, { drafts: ["draft", "kept"] }), /"kept" is not a draft/)
  })
})
