import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { after, before } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { saveDraft, saveDraftGroup } from "../src/db/drafts.ts"
import { saveEnvironment, setAllowDrafts } from "../src/db/environments.ts"
import { saveFixture } from "../src/db/fixtures.ts"
import { savePlatform } from "../src/db/platforms.ts"
import { getRun, getRuns } from "../src/db/runs.ts"
import { getScenarioRuns, getScenarioVersion } from "../src/db/scenario-runs.ts"
import { saveScenario } from "../src/db/scenarios.ts"
import { type RunEvent, type RunOptions, run } from "../src/runner.ts"
import type { Scenario } from "../src/scenario.ts"
import { tempDir } from "./temp-dir.ts"

// One in-process backend for every test. `/health` answers 503 while `down` is set, which is how
// a test makes the service die after preflight.
export const backend = { down: false, url: "" }
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
export const healthStep = () => ({ name: "Check health", target: "api", method: "GET", url: "/health" })

export function project(scenarios: Scenario[], fixtures: Record<string, string> = {}) {
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

/**
 * A project with kept `scenarios` and `drafts` saved as drafts in one group. It has two environments,
 * `dev` (active) and `staging`, and `marked` names the ones that allow drafts.
 */
export function draftProject(scenarios: Scenario[], drafts: Scenario[], marked: string[] = []) {
  const dir = project(scenarios)
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  saveEnvironment(db, "staging", { scenarios: "scenarios", results: "results" })
  saveDraftGroup(db, { key: "batch", prompt: "test all the features" })
  for (const draft of drafts) saveDraft(db, draft, "batch")
  for (const name of marked) setAllowDrafts(db, name, true)
  db.close()
  return dir
}

export async function execute(dir: string, options: Partial<RunOptions> = {}, onEvent?: (event: RunEvent) => void) {
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

/** The latest run's scenario-iterations, each with the scenario content it was pinned to. */
export function storedScenarioRuns(dir: string) {
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  try {
    const [latest] = getRuns(db, 1)
    return getScenarioRuns(db, latest.id).map((row) => ({ ...row, content: getScenarioVersion(db, row.fingerprint) ?? "" }))
  } finally {
    db.close()
  }
}

export function storedRun(dir: string) {
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  try {
    const [latest] = getRuns(db, 1)
    return getRun(db, latest.id)
  } finally {
    db.close()
  }
}
