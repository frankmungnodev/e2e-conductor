import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { getScenario } from "../src/db/scenarios.ts"
import { startServer } from "../src/server.ts"
import { project, storedRun } from "./runner-project.ts"

const broken = () => ({
  id: "a",
  name: "Scenario A",
  steps: [
    { name: "Broken", target: "shell", command: "exit 1" },
    { name: "After", target: "shell", command: "true" },
  ],
})

async function withServer(test: (url: string, dir: string) => Promise<void>) {
  const dir = project([broken()])
  const { server, url } = await startServer(await loadConfig(dir), { port: 0, host: "127.0.0.1", open: false })
  try {
    await test(url, dir)
  } finally {
    await fetch(`${url}/api/run/stop`, { method: "POST" }).catch(() => {})
    await until(url, (status) => !status.isRunning)
    server.close()
  }
}

type Status = {
  isRunning: boolean
  currentRun: { paused: { index: number; retryPassed: boolean; step: { id?: string; command?: string } } | null } | null
}

async function status(url: string): Promise<Status> {
  return (await (await fetch(`${url}/api/run/status`)).json()) as Status
}

/** Polls the run status until `done` holds, failing after five seconds. */
async function until(url: string, done: (status: Status) => boolean): Promise<Status> {
  const deadline = Date.now() + 5000
  for (;;) {
    const current = await status(url)
    if (done(current)) return current
    if (Date.now() > deadline) throw new Error(`timed out waiting; last status ${JSON.stringify(current)}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const post = (url: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })

const paused = (url: string) => until(url, (s) => Boolean(s.currentRun?.paused))

describe("pause on failure over HTTP", () => {
  it("pauses, saves a passing retry to the scenario, and continues to the end", async () => {
    await withServer(async (url, dir) => {
      assert.equal((await post(url, "/api/run", { pauseOnFailure: true })).status, 200)
      const first = await paused(url)
      assert.equal(first.currentRun?.paused?.index, 0)

      assert.equal((await post(url, "/api/run/hold/continue")).status, 409, "continue waits for a passing retry")

      const step = { name: "Broken", target: "shell", command: "true" }
      assert.equal((await post(url, "/api/run/hold/retry", { step })).status, 200)
      await until(url, (s) => s.currentRun?.paused?.retryPassed === true)

      const db = openDatabase(join(dir, ".e2e", "e2e.db"))
      try {
        const stored = getScenario(db, "a")
        assert.equal(stored?.steps[0].command, "true")
        assert.equal(stored?.steps[0].id, first.currentRun?.paused?.step.id, "the saved step keeps its id")
        assert.equal(stored?.steps[1].command, "true", "the other step is untouched")
      } finally {
        db.close()
      }

      assert.equal((await post(url, "/api/run/hold/continue")).status, 200)
      await until(url, (s) => !s.isRunning)
      const stored = storedRun(dir)
      assert.equal(stored?.reason, "fixed during run")
      assert.equal(stored?.fixedScenarios, 1)
    })
  })

  it("leaves the stored step alone when a retry fails", async () => {
    await withServer(async (url, dir) => {
      await post(url, "/api/run", { pauseOnFailure: true })
      await paused(url)
      await post(url, "/api/run/hold/retry", { step: { name: "Broken", target: "shell", command: "exit 4" } })
      await until(url, (s) => s.currentRun?.paused?.step.command === "exit 4")

      const db = openDatabase(join(dir, ".e2e", "e2e.db"))
      try {
        assert.equal(getScenario(db, "a")?.steps[0].command, "exit 1")
      } finally {
        db.close()
      }
    })
  })

  it("does not save a fix over a step removed while paused, and the run can still continue", async () => {
    await withServer(async (url, dir) => {
      await post(url, "/api/run", { pauseOnFailure: true })
      await paused(url)
      // The scenario is edited during the pause: the paused step is removed.
      await post(url, "/api/scenarios", { id: "a", content: { name: "Scenario A", steps: [{ name: "Only", target: "shell", command: "true" }] } })

      await post(url, "/api/run/hold/retry", { step: { name: "Broken", target: "shell", command: "true" } })
      await until(url, (s) => s.currentRun?.paused?.retryPassed === true)
      const db = openDatabase(join(dir, ".e2e", "e2e.db"))
      try {
        assert.deepEqual(
          getScenario(db, "a")?.steps.map((step) => step.name),
          ["Only"],
        )
      } finally {
        db.close()
      }
      assert.equal((await post(url, "/api/run/hold/continue")).status, 200)
      await until(url, (s) => !s.isRunning)
    })
  })

  it("refuses an invalid step or an unprepared target without running it", async () => {
    await withServer(async (url, dir) => {
      await post(url, "/api/run", { pauseOnFailure: true })
      await paused(url)

      const invalid = await post(url, "/api/run/hold/retry", { step: { name: "No target" } })
      assert.equal(invalid.status, 400)
      const unprepared = await post(url, "/api/run/hold/retry", { step: { name: "Api", target: "api", method: "GET", url: "/health" } })
      assert.equal(unprepared.status, 400)
      assert.match(((await unprepared.json()) as { error: string }).error, /not prepared/)
      assert.equal(storedRun(dir)?.stepRuns.filter((row) => row.manual).length, 0)
    })
  })

  it("answers 409 to hold actions when no run is paused", async () => {
    await withServer(async (url) => {
      for (const path of ["/api/run/hold/continue", "/api/run/hold/end-scenario"]) {
        assert.equal((await post(url, path)).status, 409)
      }
      assert.equal((await post(url, "/api/run/hold/retry", { step: { name: "Ok", target: "shell", command: "true" } })).status, 409)
    })
  })

  it("cancels a paused run with Stop", async () => {
    await withServer(async (url, dir) => {
      await post(url, "/api/run", { pauseOnFailure: true })
      await paused(url)
      assert.equal((await post(url, "/api/run/stop")).status, 200)
      await until(url, (s) => !s.isRunning)
      assert.equal(storedRun(dir)?.status, "CANCELLED")
    })
  })
})
