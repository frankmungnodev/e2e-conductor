import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { saveEnvironment } from "../src/db/environments.ts"
import { saveFixture } from "../src/db/fixtures.ts"
import { savePlatform } from "../src/db/platforms.ts"
import { getRun, getRuns } from "../src/db/runs.ts"
import { saveScenario } from "../src/db/scenarios.ts"
import { type RunEvent, type RunOptions, run } from "../src/runner.ts"
import type { Scenario } from "../src/scenario.ts"
import { tempDir } from "./temp-dir.ts"

// One in-process backend for every test. `/health` answers 503 while `down` is set, which is how
// a test makes the service die after preflight.
const backend = { down: false, url: "" }
let server: Server

before(async () => {
  server = createServer((req, res) => {
    const status = req.url === "/health" && backend.down ? 503 : 200
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify({ ok: status === 200 }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  backend.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => new Promise<void>((resolve) => server.close(() => resolve())))

// A function, because saveScenario writes a generated id onto each step object it saves.
const healthStep = () => ({ name: "Check health", target: "api", method: "GET", url: "/health" })

function project(scenarios: Scenario[], fixtures: Record<string, string> = {}) {
  backend.down = false
  const dir = tempDir("runner")
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  saveEnvironment(db, "dev", { scenarios: "scenarios", results: "results" })
  savePlatform(db, { id: "plat-api", name: "api", type: "api", url: backend.url, health: "/health", serviceName: "backend" })
  for (const [name, cmd] of Object.entries(fixtures)) saveFixture(db, name, { cmd })
  for (const scenario of scenarios) saveScenario(db, scenario)
  db.close()
  return dir
}

async function execute(dir: string, options: Partial<RunOptions> = {}, onEvent?: (event: RunEvent) => void) {
  const events: RunEvent[] = []
  const config = await loadConfig(dir)
  const summary = await run(config, {
    scenarios: [],
    repeat: 1,
    start: false,
    install: false,
    checkOnly: false,
    ...options,
    onEvent: (event) => {
      events.push(event)
      onEvent?.(event)
    },
  })
  return { summary, events }
}

function storedRun(dir: string) {
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  try {
    const [latest] = getRuns(db, 1)
    return getRun(db, latest.id)
  } finally {
    db.close()
  }
}

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
})
