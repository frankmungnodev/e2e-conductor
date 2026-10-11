import assert from "node:assert/strict"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"
import { pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"
import { openDatabase } from "../src/db/connection.ts"
import {
  discardDraft,
  discardDraftGroup,
  getDraft,
  getDraftGroup,
  getDrafts,
  keepDraft,
  markBugFound,
  revisionId,
  saveDraft,
  saveDraftGroup,
  saveRevision,
} from "../src/db/drafts.ts"
import { getEnvironments, saveEnvironment, setAllowDrafts } from "../src/db/environments.ts"
import { saveScenarioRun } from "../src/db/scenario-runs.ts"
import { getScenario, getScenarios, replaceScenarioStep, type Scenario, saveScenario } from "../src/db/scenarios.ts"
import { scenarioVersion } from "../src/scenario-version.ts"
import { tempDir } from "./temp-dir.ts"

const dir = tempDir("drafts-db")
let dbCount = 0
const freshDb = () => openDatabase(join(dir, `e2e-${++dbCount}.db`))

const echo = (id: string, command = "echo hi"): Scenario => ({
  id,
  name: `Echo ${id}`,
  steps: [{ id: `${id}-step`, name: "echo", target: "shell", command, actions: [{ id: `${id}-action`, action: "shell", command }] }],
})

const fingerprint = (db: DatabaseSync, id: string) => {
  const scenario = getScenario(db, id)
  assert.ok(scenario, `${id} is stored`)
  return scenarioVersion(scenario).fingerprint
}

let runCount = 0
/** Records a finished run of `id` on its stored content, one row per status (one per iteration). */
const recordRun = (db: DatabaseSync, id: string, ...statuses: Array<"PASSED" | "FAILED" | "FIXED">) => {
  const runId = `run-${++runCount}`
  statuses.forEach((status, index) => {
    saveScenarioRun(db, { runId, scenarioId: id, iteration: index + 1, fingerprint: fingerprint(db, id), status, startedAt: runCount * 100 + index })
  })
}

const draftColumns = (db: DatabaseSync, id: string) =>
  ({ ...db.prepare("SELECT draft_state, draft_group, revision_of, base_fingerprint FROM scenarios WHERE id = ?").get(id) })

/** A database holding group `login` and a passing draft `checkout`. */
function withPassingDraft() {
  const db = freshDb()
  saveDraftGroup(db, { key: "login", prompt: "test login", agent: "claude" })
  saveDraft(db, echo("checkout"), "login")
  recordRun(db, "checkout", "PASSED")
  return db
}

describe("draft storage", () => {
  it("saves a draft with its group, dropping incoming step and action ids", () => {
    const db = freshDb()
    saveDraftGroup(db, { key: "login", prompt: "test login", agent: "claude" })
    saveDraft(db, echo("checkout"), "login")

    assert.deepEqual(getDraft(db, "checkout"), { id: "checkout", state: "draft", group: "login" })
    const step = getScenario(db, "checkout")?.steps[0]
    assert.notEqual(step?.id, "checkout-step")
    assert.equal(step?.actions?.[0].id, undefined)
    assert.deepEqual({ ...getDraftGroup(db, "login"), createdAt: 0 }, { key: "login", prompt: "test login", agent: "claude", createdAt: 0 })
  })

  it("updates an existing draft in place and moves it to the group of the latest save", () => {
    const db = freshDb()
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    saveDraftGroup(db, { key: "cart", prompt: "test the cart" })
    saveDraft(db, echo("checkout"), "login")
    saveDraft(db, echo("checkout", "echo changed"), "cart")

    assert.equal(getScenarios(db).length, 1)
    assert.equal(getScenario(db, "checkout")?.steps[0].command, "echo changed")
    assert.equal(getDraft(db, "checkout")?.group, "cart")
  })

  it("keeps a group's prompt when a later save names the group without one", () => {
    const db = freshDb()
    saveDraftGroup(db, { key: "login", prompt: "test login", agent: "claude" })
    saveDraftGroup(db, { key: "login", agent: "codex" })
    assert.equal(getDraftGroup(db, "login")?.prompt, "test login")
    assert.equal(getDraftGroup(db, "login")?.agent, "codex")
  })

  it("saves a revision of a kept scenario as its own row, leaving the kept scenario unchanged", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    const id = saveRevision(db, "smoke", echo("smoke", "echo revised"), "login")

    assert.equal(id, revisionId("smoke"))
    assert.equal(id, "smoke@draft")
    assert.deepEqual(getDraft(db, id), { id, state: "draft", group: "login", revisionOf: "smoke", baseFingerprint: fingerprint(db, "smoke") })
    assert.equal(getScenario(db, "smoke")?.steps[0].command, "echo hi")
    assert.equal(getScenario(db, id)?.steps[0].command, "echo revised")
    assert.equal(getDraft(db, "smoke"), undefined, "the kept scenario is not a draft")
  })

  it("lists drafts and leaves kept scenarios out of getScenarios when asked", () => {
    const db = withPassingDraft()
    saveScenario(db, echo("smoke"))
    assert.deepEqual(getDrafts(db).map((draft) => draft.id), ["checkout"])
    assert.deepEqual(getScenarios(db, { keptOnly: true }).map((scenario) => scenario.id), ["smoke"])
    assert.deepEqual(getScenarios(db).map((scenario) => scenario.id), ["checkout", "smoke"])
  })

  it("leaves the draft columns alone on a builder save", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    const id = saveRevision(db, "smoke", echo("smoke", "echo revised"), "login")
    const before = draftColumns(db, id)
    const stored = getScenario(db, id)
    assert.ok(stored)

    saveScenario(db, { ...stored, name: "Edited in the builder" })

    assert.deepEqual(draftColumns(db, id), before)
    assert.equal(before.draft_state, "draft")
  })

  it("keeps a draft a draft when one step is replaced, as a Pause on Failure fix does", () => {
    const db = withPassingDraft()
    const step = getScenario(db, "checkout")?.steps[0]
    assert.ok(step)
    assert.equal(replaceScenarioStep(db, "checkout", { ...step, command: "echo fixed" }), "Echo checkout")
    assert.equal(getDraft(db, "checkout")?.state, "draft")
  })

  it("marks a draft Bug found and refuses to mark a kept scenario", () => {
    const db = withPassingDraft()
    saveScenario(db, echo("smoke"))
    assert.equal(markBugFound(db, "checkout"), true)
    assert.equal(getDraft(db, "checkout")?.state, "bug_found")
    assert.equal(markBugFound(db, "smoke"), false)
    assert.equal(getDraft(db, "smoke"), undefined)
  })

  it("discards a draft but never a kept scenario", () => {
    const db = withPassingDraft()
    saveScenario(db, echo("smoke"))
    assert.equal(discardDraft(db, "smoke"), false)
    assert.ok(getScenario(db, "smoke"))
    assert.equal(discardDraft(db, "checkout"), true)
    assert.equal(getScenario(db, "checkout"), undefined)
  })

  it("discards a whole group, its drafts and nothing else", () => {
    const db = withPassingDraft()
    saveDraft(db, echo("search"), "login")
    saveDraftGroup(db, { key: "cart", prompt: "test the cart" })
    saveDraft(db, echo("basket"), "cart")
    saveScenario(db, echo("smoke"))

    assert.deepEqual(discardDraftGroup(db, "login").sort(), ["checkout", "search"])
    assert.deepEqual(getScenarios(db).map((scenario) => scenario.id), ["basket", "smoke"])
    assert.equal(getDraftGroup(db, "login"), undefined)
    assert.ok(getDraftGroup(db, "cart"))
  })
})

describe("keeping a draft", () => {
  it("keeps a new draft that passed on its current content, clearing its draft columns", () => {
    const db = withPassingDraft()
    assert.deepEqual(keepDraft(db, "checkout"), { ok: true, id: "checkout" })
    assert.equal(getDraft(db, "checkout"), undefined)
    assert.deepEqual(draftColumns(db, "checkout"), { draft_state: null, draft_group: null, revision_of: null, base_fingerprint: null })
  })

  it("refuses a draft whose current content has not passed", () => {
    const db = withPassingDraft()
    const step = getScenario(db, "checkout")?.steps[0]
    assert.ok(step)
    replaceScenarioStep(db, "checkout", { ...step, command: "echo edited" })

    const outcome = keepDraft(db, "checkout")
    assert.equal(outcome.ok, false)
    assert.equal(!outcome.ok && outcome.reason, "not-passed")
    assert.equal(getDraft(db, "checkout")?.state, "draft")
  })

  it("keeps a Bug found draft once it passed", () => {
    const db = withPassingDraft()
    markBugFound(db, "checkout")
    assert.equal(keepDraft(db, "checkout").ok, true)
  })

  it("refuses a scenario that is not a draft", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    const outcome = keepDraft(db, "smoke")
    assert.equal(!outcome.ok && outcome.reason, "not-a-draft")
  })

  it("replaces the kept content in place with new step ids and removes the revision", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    const oldStepId = getScenario(db, "smoke")?.steps[0].id
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    const id = saveRevision(db, "smoke", { ...echo("smoke", "echo revised"), name: "Revised smoke" }, "login")
    recordRun(db, id, "PASSED")

    assert.deepEqual(keepDraft(db, id), { ok: true, id: "smoke" })

    const kept = getScenario(db, "smoke")
    assert.equal(kept?.name, "Revised smoke")
    assert.equal(kept?.steps[0].command, "echo revised")
    assert.notEqual(kept?.steps[0].id, oldStepId)
    assert.equal(getScenario(db, id), undefined)
    assert.equal(getDraft(db, "smoke"), undefined)
  })

  it("refuses a revision whose kept scenario changed since the revision was saved, naming the way out", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    const id = saveRevision(db, "smoke", echo("smoke", "echo revised"), "login")
    recordRun(db, id, "PASSED")
    saveScenario(db, echo("smoke", "echo edited in the builder"))

    const outcome = keepDraft(db, id)
    assert.equal(!outcome.ok && outcome.reason, "base-changed")
    assert.match(!outcome.ok ? outcome.message : "", /discard/i)
    assert.equal(getScenario(db, "smoke")?.steps[0].command, "echo edited in the builder")
    assert.ok(getScenario(db, id))
  })

  it("refuses a revision whose kept scenario was deleted", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    const id = saveRevision(db, "smoke", echo("smoke", "echo revised"), "login")
    recordRun(db, id, "PASSED")
    db.prepare("DELETE FROM scenarios WHERE id = 'smoke'").run()

    const outcome = keepDraft(db, id)
    assert.equal(!outcome.ok && outcome.reason, "kept-missing")
    assert.ok(getScenario(db, id))
  })

  it("records the kept scenario's current fingerprint on a re-save, so a refused revision can be kept again", () => {
    const db = freshDb()
    saveScenario(db, echo("smoke"))
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    saveRevision(db, "smoke", echo("smoke", "echo revised"), "login")
    saveScenario(db, echo("smoke", "echo edited in the builder"))
    const id = saveRevision(db, "smoke", echo("smoke", "echo revised"), "login")
    recordRun(db, id, "PASSED")

    assert.equal(getDraft(db, id)?.baseFingerprint, fingerprint(db, "smoke"))
    assert.equal(keepDraft(db, id).ok, true)
  })
})

describe("allow_drafts on environments", () => {
  it("is off for a new environment and survives a form save", () => {
    const db = freshDb()
    saveEnvironment(db, "dev", { url: "http://localhost:3000" })
    assert.equal(getEnvironments(db).dev.allowDrafts, false)

    setAllowDrafts(db, "dev", true)
    saveEnvironment(db, "dev", { url: "http://localhost:4000", description: "edited in the form" })

    assert.equal(getEnvironments(db).dev.allowDrafts, true)
    assert.equal(getEnvironments(db).dev.url, "http://localhost:4000")
  })
})

describe("opening an existing database", () => {
  it("adds the draft columns and table without losing rows", () => {
    const path = join(dir, "old.db")
    const old = new DatabaseSync(path)
    old.exec(`
      CREATE TABLE scenarios (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, setup_fixtures TEXT, vars TEXT,
        read_only INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE environments (name TEXT PRIMARY KEY, description TEXT, url TEXT, scenarios TEXT, flows TEXT, results TEXT,
        env_vars TEXT, is_default INTEGER DEFAULT 0, is_active INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER);
      INSERT INTO scenarios (id, name) VALUES ('smoke', 'Smoke');
      INSERT INTO environments (name, url) VALUES ('dev', 'http://localhost:3000');
    `)
    old.close()

    const db = openDatabase(path)
    assert.equal(getScenario(db, "smoke")?.name, "Smoke")
    assert.equal(getDraft(db, "smoke"), undefined)
    assert.equal(getEnvironments(db).dev.allowDrafts, false)
    saveDraftGroup(db, { key: "login", prompt: "test login" })
    saveDraft(db, echo("checkout"), "login")
    assert.equal(getDraft(db, "checkout")?.state, "draft")
  })
})

describe("busy timeout", () => {
  it("lets a scenario_runs write from another connection wait for a write transaction, landing after it commits", async () => {
    const path = join(dir, "busy.db")
    const db = openDatabase(path)
    db.exec("BEGIN IMMEDIATE")
    db.prepare("INSERT INTO settings (key, value) VALUES ('held', '1')").run()

    const worker = new Worker(
      `
      const { workerData, parentPort } = require("node:worker_threads")
      import(workerData.connection).then(async ({ openDatabase }) => {
        const { saveScenarioRun } = await import(workerData.scenarioRuns)
        try {
          const db = openDatabase(workerData.path)
          saveScenarioRun(db, { runId: "run-1", scenarioId: "checkout", iteration: 1, fingerprint: "a", status: "PASSED", startedAt: 1 })
          db.close()
          parentPort.postMessage({ ok: true, at: Date.now() })
        } catch (error) {
          parentPort.postMessage({ ok: false, error: String(error) })
        }
      })
      `,
      {
        eval: true,
        workerData: {
          path,
          connection: pathToFileURL(join(import.meta.dirname, "../src/db/connection.ts")).href,
          scenarioRuns: pathToFileURL(join(import.meta.dirname, "../src/db/scenario-runs.ts")).href,
        },
      },
    )
    const done = new Promise<{ ok: boolean; at?: number; error?: string }>((resolve) => worker.once("message", resolve))

    await new Promise((resolve) => setTimeout(resolve, 500))
    const committedAt = Date.now()
    db.exec("COMMIT")
    const result = await done
    await worker.terminate()

    assert.deepEqual({ ok: result.ok, error: result.error }, { ok: true, error: undefined })
    assert.ok((result.at ?? 0) >= committedAt, "the write landed after the commit")
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM scenario_runs").get() as { count: number }
    assert.equal(count, 1)
    db.close()
  })
})
