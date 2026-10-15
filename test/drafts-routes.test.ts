import assert from "node:assert/strict"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { getDraft, revisionId, saveRevision } from "../src/db/drafts.ts"
import { saveRun } from "../src/db/runs.ts"
import { saveScenarioRun } from "../src/db/scenario-runs.ts"
import { getScenario, type Scenario, saveScenario } from "../src/db/scenarios.ts"
import { scenarioVersion } from "../src/scenario-version.ts"
import { startServer } from "../src/server.ts"
import { draftProject } from "./runner-project.ts"

const shell = (id: string, command = "true"): Scenario => ({ id, name: id, steps: [{ name: "Run", target: "shell", command }] })

function withDb<T>(dir: string, use: (db: DatabaseSync) => T): T {
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  try {
    return use(db)
  } finally {
    db.close()
  }
}

let runCount = 0
/** Records a finished run of each id on its stored content. */
function recordRun(dir: string, status: "PASSED" | "FAILED", ...ids: string[]) {
  const runId = `run-${++runCount}`
  withDb(dir, (db) => {
    saveRun(db, {
      id: runId,
      environmentName: "dev",
      status: status,
      totalScenarios: ids.length,
      passedScenarios: status === "PASSED" ? ids.length : 0,
      failedScenarios: status === "FAILED" ? ids.length : 0,
      startedAt: runCount,
      completedAt: runCount,
    })
    for (const id of ids) {
      const scenario = getScenario(db, id)
      assert.ok(scenario, `${id} is stored`)
      const { fingerprint } = scenarioVersion(scenario)
      saveScenarioRun(db, { runId, scenarioId: id, iteration: 1, fingerprint, status, startedAt: runCount, completedAt: runCount })
    }
  })
}

async function withServer(dir: string, test: (url: string) => Promise<void>) {
  const { server, url } = await startServer(await loadConfig(dir), { port: 0, host: "127.0.0.1", open: false })
  try {
    await test(url)
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
  }
}

const send = (url: string, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const isDraft = (dir: string, id: string) => withDb(dir, (db) => Boolean(getDraft(db, id)))
const stored = (dir: string, id: string) => withDb(dir, (db) => getScenario(db, id))

describe("GET /api/drafts", () => {
  it("groups drafts by prompt with state, readback, pass state and last run status", async () => {
    const dir = draftProject([shell("kept")], [shell("passing"), shell("failing", "false")])
    recordRun(dir, "PASSED", "passing")
    recordRun(dir, "FAILED", "failing")
    await withServer(dir, async (url) => {
      const body = (await (await send(url, "GET", "/api/drafts")).json()) as any
      assert.equal(body.groups.length, 1)
      const [group] = body.groups
      assert.deepEqual([group.key, group.prompt], ["batch", "test all the features"])
      const byId = Object.fromEntries(group.drafts.map((draft: any) => [draft.id, draft]))
      assert.deepEqual(Object.keys(byId).sort(), ["failing", "passing"])
      assert.deepEqual([byId.passing.state, byId.passing.passed, byId.passing.lastRun.status], ["draft", true, "PASSED"])
      assert.deepEqual([byId.failing.passed, byId.failing.lastRun.status], [false, "FAILED"])
      assert.deepEqual(byId.failing.readback.steps[0].sentences, ["Runs the shell command: false"])
      assert.deepEqual(byId.failing.readback.targets, ["shell"])
    })
  })
})

describe("Keep", () => {
  it("keeps a draft whose current content passed", async () => {
    const dir = draftProject([], [shell("passing")])
    recordRun(dir, "PASSED", "passing")
    await withServer(dir, async (url) => {
      const res = await send(url, "POST", "/api/drafts/passing/keep")
      assert.equal(res.status, 200)
    })
    assert.equal(isDraft(dir, "passing"), false)
    assert.ok(stored(dir, "passing"))
  })

  it("refuses Keep after a builder edit of one step until a new pass (AE2)", async () => {
    const dir = draftProject([], [shell("passing")])
    recordRun(dir, "PASSED", "passing")
    await withServer(dir, async (url) => {
      const edited = { name: "passing", steps: [{ name: "Run", target: "shell", command: "echo edited" }] }
      assert.equal((await send(url, "POST", "/api/scenarios", { id: "passing", content: edited })).status, 200)
      const refused = await send(url, "POST", "/api/drafts/passing/keep")
      assert.equal(refused.status, 409)
      assert.equal(((await refused.json()) as any).reason, "not-passed")
      assert.equal(isDraft(dir, "passing"), true)

      recordRun(dir, "PASSED", "passing")
      assert.equal((await send(url, "POST", "/api/drafts/passing/keep")).status, 200)
    })
    assert.equal(isDraft(dir, "passing"), false)
  })

  it("Keep all passing keeps the passing drafts and leaves the failing ones as drafts", async () => {
    const dir = draftProject([], [shell("a"), shell("b"), shell("c", "false")])
    recordRun(dir, "PASSED", "a", "b")
    recordRun(dir, "FAILED", "c")
    await withServer(dir, async (url) => {
      const body = (await (await send(url, "POST", "/api/drafts/groups/batch/keep")).json()) as any
      assert.deepEqual(body.kept.sort(), ["a", "b"])
      assert.deepEqual(body.skipped, [])
    })
    assert.deepEqual(
      ["a", "b", "c"].map((id) => isDraft(dir, id)),
      [false, false, true],
    )
  })

  it("keeping a revision replaces the kept scenario's content and removes the revision row", async () => {
    const dir = draftProject([shell("login", "echo old")], [])
    withDb(dir, (db) => saveRevision(db, "login", shell("login", "echo new"), "batch"))
    recordRun(dir, "PASSED", revisionId("login"))
    await withServer(dir, async (url) => {
      const res = await send(url, "POST", `/api/drafts/${encodeURIComponent(revisionId("login"))}/keep`)
      assert.equal(res.status, 200)
      assert.equal(((await res.json()) as any).id, "login")
    })
    assert.equal(stored(dir, "login")?.steps[0].command, "echo new")
    assert.equal(stored(dir, revisionId("login")), undefined)
  })

  it("refuses a revision whose kept scenario changed, naming Discard and re-save, and Keep all passing skips it", async () => {
    const dir = draftProject([shell("login", "echo old")], [shell("other")])
    withDb(dir, (db) => {
      saveRevision(db, "login", shell("login", "echo new"), "batch")
      saveScenario(db, shell("login", "echo changed by hand"))
    })
    recordRun(dir, "PASSED", revisionId("login"), "other")
    await withServer(dir, async (url) => {
      const res = await send(url, "POST", `/api/drafts/${encodeURIComponent(revisionId("login"))}/keep`)
      assert.equal(res.status, 409)
      const refusal = (await res.json()) as any
      assert.equal(refusal.reason, "base-changed")
      assert.match(refusal.error, /Discard this revision and have the agent save it again/)

      const all = (await (await send(url, "POST", "/api/drafts/groups/batch/keep")).json()) as any
      assert.deepEqual(all.kept, ["other"])
      assert.deepEqual(
        all.skipped.map((skip: any) => skip.id),
        [revisionId("login")],
      )
      assert.match(all.skipped[0].message, /changed after this revision was saved/)
    })
    assert.equal(stored(dir, "login")?.steps[0].command, "echo changed by hand")
    assert.equal(isDraft(dir, revisionId("login")), true)
  })
})

describe("Bug found and Discard", () => {
  it("marks a draft Bug found and refuses to mark a kept scenario", async () => {
    const dir = draftProject([shell("kept")], [shell("failing", "false")])
    await withServer(dir, async (url) => {
      assert.equal((await send(url, "POST", "/api/drafts/failing/bug-found")).status, 200)
      assert.equal((await send(url, "POST", "/api/drafts/kept/bug-found")).status, 404)
    })
    assert.equal(withDb(dir, (db) => getDraft(db, "failing")?.state), "bug_found")
    assert.equal(isDraft(dir, "kept"), false)
  })

  it("discards one draft and refuses to discard a kept scenario", async () => {
    const dir = draftProject([shell("kept")], [shell("draft")])
    await withServer(dir, async (url) => {
      assert.equal((await send(url, "DELETE", "/api/drafts/draft")).status, 200)
      assert.equal((await send(url, "DELETE", "/api/drafts/kept")).status, 404)
    })
    assert.equal(stored(dir, "draft"), undefined)
    assert.ok(stored(dir, "kept"))
  })

  it("discards a group's drafts and revisions and leaves the kept scenarios", async () => {
    const dir = draftProject([shell("login", "echo old")], [shell("a"), shell("b")])
    withDb(dir, (db) => saveRevision(db, "login", shell("login", "echo new"), "batch"))
    await withServer(dir, async (url) => {
      const body = (await (await send(url, "DELETE", "/api/drafts/groups/batch")).json()) as any
      assert.deepEqual(body.discarded.sort(), ["a", "b", revisionId("login")].sort())
      assert.deepEqual(((await (await send(url, "GET", "/api/drafts")).json()) as any).groups, [])
    })
    assert.equal(stored(dir, "login")?.steps[0].command, "echo old")
  })

  it("answers 409 to Keep and Discard of a draft in the active run", async () => {
    const dir = draftProject([], [shell("slow", "sleep 1"), shell("passing")], ["dev"])
    recordRun(dir, "PASSED", "slow")
    await withServer(dir, async (url) => {
      assert.equal((await send(url, "POST", "/api/run", { drafts: ["slow"] })).status, 200)
      for (const [method, path] of [
        ["POST", "/api/drafts/slow/keep"],
        ["POST", "/api/drafts/groups/batch/keep"],
        ["DELETE", "/api/drafts/slow"],
        ["DELETE", "/api/drafts/groups/batch"],
      ]) {
        assert.equal((await send(url, method, path)).status, 409, `${method} ${path}`)
      }
      assert.equal(isDraft(dir, "slow"), true)

      const deadline = Date.now() + 5000
      while (((await (await send(url, "GET", "/api/run/status")).json()) as any).isRunning) {
        if (Date.now() > deadline) throw new Error("run did not finish")
        await new Promise((resolveWait) => setTimeout(resolveWait, 20))
      }
    })
  })
})

describe("scenario and environment routes for drafts", () => {
  it("GET /api/scenarios marks drafts with a summary outside raw", async () => {
    const dir = draftProject([shell("kept")], [shell("draft")])
    withDb(dir, (db) => saveRevision(db, "kept", shell("kept", "echo new"), "batch"))
    await withServer(dir, async (url) => {
      const list = (await (await send(url, "GET", "/api/scenarios")).json()) as any[]
      const byId = Object.fromEntries(list.map((item) => [item.id, item]))
      assert.equal(byId.kept.draft, undefined)
      assert.deepEqual(byId.draft.draft, { state: "draft", group: "batch" })
      assert.deepEqual(byId[revisionId("kept")].draft, { state: "draft", group: "batch", revisionOf: "kept" })
      assert.equal(byId.draft.raw.draft, undefined)
    })
  })

  it("DELETE /api/scenarios/login%40draft deletes the login@draft row", async () => {
    const dir = draftProject([shell("login")], [])
    withDb(dir, (db) => saveRevision(db, "login", shell("login", "echo new"), "batch"))
    await withServer(dir, async (url) => {
      const res = await send(url, "DELETE", "/api/scenarios/login%40draft")
      assert.equal(res.status, 200)
    })
    assert.equal(stored(dir, "login@draft"), undefined)
    assert.ok(stored(dir, "login"))
  })

  it("sets and clears an environment's draft mark", async () => {
    const dir = draftProject([], [])
    await withServer(dir, async (url) => {
      const path = "/api/config/environment/allow-drafts"
      assert.equal((await send(url, "POST", path, { name: "staging", allowed: true })).status, 200)
      let config = (await (await send(url, "GET", "/api/config")).json()) as any
      assert.deepEqual([config.environments.staging.allowDrafts, config.environments.dev.allowDrafts], [true, false])

      assert.equal((await send(url, "POST", path, { name: "staging", allowed: false })).status, 200)
      config = (await (await send(url, "GET", "/api/config")).json()) as any
      assert.equal(config.environments.staging.allowDrafts, false)
      assert.equal((await send(url, "POST", path, { name: "nowhere", allowed: true })).status, 404)
    })
  })
})

describe("run status for draft runs", () => {
  const waitIdle = async (url: string) => {
    const deadline = Date.now() + 10000
    for (;;) {
      const status = (await (await send(url, "GET", "/api/run/status")).json()) as any
      if (!status.isRunning) return status
      if (Date.now() > deadline) throw new Error("run did not finish")
      await new Promise((resolveWait) => setTimeout(resolveWait, 20))
    }
  }

  it("keeps the last suite run's summary when a draft batch fails after it (AE4)", async () => {
    const dir = draftProject([shell("suite")], [shell("broken", "exit 1")], ["dev"])
    await withServer(dir, async (url) => {
      assert.equal((await send(url, "POST", "/api/run", {})).status, 200)
      const afterSuite = await waitIdle(url)
      assert.equal(afterSuite.lastSuiteSummary.status, "PASSED")
      assert.equal(afterSuite.lastSuiteSummary.drafts, undefined)

      assert.equal((await send(url, "POST", "/api/run", { drafts: ["broken"] })).status, 200)
      const afterDrafts = await waitIdle(url)
      assert.equal(afterDrafts.lastSummary.status, "FAILED")
      assert.equal(afterDrafts.lastSummary.drafts, true)
      assert.equal(afterDrafts.lastSuiteSummary.status, "PASSED")
    })
  })

  it("has no suite summary when only a draft batch has run", async () => {
    const dir = draftProject([shell("suite")], [shell("broken", "exit 1")], ["dev"])
    await withServer(dir, async (url) => {
      assert.equal((await send(url, "POST", "/api/run", { drafts: ["broken"] })).status, 200)
      const status = await waitIdle(url)
      assert.equal(status.lastSummary.drafts, true)
      assert.equal(status.lastSuiteSummary, null)
    })
  })
})
