// Unit tests for the Drafts view's pure helpers.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ScenarioItem } from "../ui/src/types.ts"
import {
  canMarkBugFound,
  defaultDraftEnvironment,
  draftEnvironments,
  failureText,
  keptScenarios,
  passingDrafts,
  promptLine,
  revisionLabel,
  rowStatus,
  scenarioDraft,
  stepCountLabel,
} from "../ui/src/views/drafts/draftHelpers.ts"
import type { DraftAwareConfig, DraftGroup, DraftItem } from "../ui/src/views/drafts/draftTypes.ts"

const readback = { steps: [], targets: [], fixtures: [], notes: [], commands: [], urls: [] }

function draft(fields: Partial<DraftItem> & { id: string }): DraftItem {
  return { name: fields.id, state: "draft", passed: false, lastRun: null, readback, ...fields }
}

function scenario(id: string, name: string, extra: Record<string, unknown> = {}): ScenarioItem {
  return {
    id,
    file: `${id}.json`,
    name,
    steps: [],
    setup: [],
    vars: {},
    raw: { name, steps: [] },
    isValid: true,
    errors: [],
    targets: [],
    ...extra,
  } as ScenarioItem
}

function config(environments: Record<string, { allowDrafts?: boolean }>, activeEnvironment?: string): DraftAwareConfig {
  return { activeEnvironment, environments } as unknown as DraftAwareConfig
}

describe("keptScenarios and scenarioDraft", () => {
  it("drops drafts and revisions and keeps scenarios without a draft state", () => {
    const list = [
      scenario("login", "Login"),
      scenario("checkout", "Checkout", { draft: { state: "draft", group: "shop" } }),
      scenario("login@draft", "Login", { draft: { state: "draft", group: "shop", revisionOf: "login" } }),
      scenario("search", "Search", { draft: { state: "bug_found", group: "shop" } }),
    ]
    assert.deepEqual(
      keptScenarios(list).map((item) => item.id),
      ["login"],
    )
    assert.deepEqual(scenarioDraft(list[2]), { state: "draft", group: "shop", revisionOf: "login" })
    assert.equal(scenarioDraft(list[0]), undefined)
  })
})

describe("draft environments", () => {
  it("lists only marked environments, in config order", () => {
    const cfg = config({ dev: { allowDrafts: true }, staging: {}, qa: { allowDrafts: true }, prod: { allowDrafts: false } }, "staging")
    assert.deepEqual(draftEnvironments(cfg), ["dev", "qa"])
  })

  it("defaults to the active environment when it is marked, else the first marked one", () => {
    assert.equal(defaultDraftEnvironment(config({ dev: { allowDrafts: true }, qa: { allowDrafts: true } }, "qa")), "qa")
    assert.equal(defaultDraftEnvironment(config({ dev: {}, qa: { allowDrafts: true } }, "dev")), "qa")
  })

  it("has no default when no environment is marked", () => {
    const cfg = config({ dev: {}, staging: { allowDrafts: false } }, "dev")
    assert.deepEqual(draftEnvironments(cfg), [])
    assert.equal(defaultDraftEnvironment(cfg), undefined)
    assert.equal(defaultDraftEnvironment(undefined), undefined)
  })
})

describe("draft row status", () => {
  const run = (status: "PASSED" | "FAILED" | "FIXED" | "RUNNING" | "CANCELLED") => ({ runId: "r1", status })

  it("labels a draft whose current content passed Passed", () => {
    assert.deepEqual(rowStatus(draft({ id: "a", passed: true, lastRun: run("PASSED") })), { label: "Passed", variant: "success" })
  })

  it("labels a failed draft Failed and a never-run draft Not Run", () => {
    assert.deepEqual(rowStatus(draft({ id: "a", lastRun: run("FAILED") })), { label: "Failed", variant: "danger" })
    assert.deepEqual(rowStatus(draft({ id: "b" })), { label: "Not Run", variant: "neutral" })
  })

  it("labels Bug Found whatever the last run did", () => {
    assert.deepEqual(rowStatus(draft({ id: "a", state: "bug_found", lastRun: run("FAILED") })), { label: "Bug Found", variant: "danger" })
    assert.deepEqual(rowStatus(draft({ id: "b", state: "bug_found", passed: true, lastRun: run("PASSED") })), {
      label: "Bug Found",
      variant: "danger",
    })
  })

  it("asks for another run after a fix during the run, or after an edit since the pass", () => {
    assert.deepEqual(rowStatus(draft({ id: "a", lastRun: run("FIXED") })), { label: "Fixed, Run Again", variant: "warning" })
    assert.deepEqual(rowStatus(draft({ id: "b", lastRun: run("PASSED") })), { label: "Changed, Run Again", variant: "warning" })
  })

  it("names running and cancelled runs", () => {
    assert.equal(rowStatus(draft({ id: "a", lastRun: run("RUNNING") })).label, "Running")
    assert.equal(rowStatus(draft({ id: "b", lastRun: run("CANCELLED") })).label, "Cancelled")
  })
})

describe("draft row text", () => {
  it("names the failing step, its name and the message", () => {
    const failed = draft({ id: "a", lastRun: { runId: "r1", status: "FAILED", failure: { step: 2, name: "Check exit", message: "exit code: expected 0, got 1" } } })
    assert.equal(failureText(failed), "Step 2, Check exit: exit code: expected 0, got 1")
  })

  it("falls back to the message once the failed step is gone", () => {
    const failed = draft({ id: "a", lastRun: { runId: "r1", status: "FAILED", failure: { message: "exit code: expected 0, got 1" } } })
    assert.equal(failureText(failed), "exit code: expected 0, got 1")
  })

  it("has no failure text for a passing, never-run or unexplained draft", () => {
    assert.equal(failureText(draft({ id: "a", passed: true, lastRun: { runId: "r1", status: "PASSED" } })), undefined)
    assert.equal(failureText(draft({ id: "b" })), undefined)
    assert.equal(failureText(draft({ id: "c", lastRun: { runId: "r1", status: "FAILED" } })), undefined)
  })

  it("counts steps", () => {
    const step = { name: "Run", target: "shell", sentences: [] }
    assert.equal(stepCountLabel({ ...readback, steps: [step] }), "1 step")
    assert.equal(stepCountLabel({ ...readback, steps: [step, step, step] }), "3 steps")
    assert.equal(stepCountLabel(readback), "0 steps")
  })

  it("puts a prompt on one line", () => {
    assert.equal(promptLine("Write tests\n\nfor   the  checkout\tflow "), "Write tests for the checkout flow")
  })
})

describe("draft actions", () => {
  it("offers Keep all passing for exactly the drafts whose current content passed", () => {
    const group: DraftGroup = {
      key: "shop",
      prompt: "Test the shop",
      createdAt: 1,
      drafts: [draft({ id: "a", passed: true }), draft({ id: "b" }), draft({ id: "c", state: "bug_found", passed: true })],
    }
    assert.deepEqual(
      passingDrafts(group).map((item) => item.id),
      ["a", "c"],
    )
  })

  it("offers Bug found only on a draft that ran and has not passed", () => {
    assert.equal(canMarkBugFound(draft({ id: "a", lastRun: { runId: "r1", status: "FAILED" } })), true)
    assert.equal(canMarkBugFound(draft({ id: "b" })), false)
    assert.equal(canMarkBugFound(draft({ id: "c", passed: true, lastRun: { runId: "r1", status: "PASSED" } })), false)
    assert.equal(canMarkBugFound(draft({ id: "d", state: "bug_found", lastRun: { runId: "r1", status: "FAILED" } })), false)
  })

  it("names the kept scenario a revision replaces, falling back to its id", () => {
    const scenarios = [scenario("login", "Log In")]
    assert.equal(revisionLabel(draft({ id: "login@draft", revisionOf: "login" }), scenarios), "Revision of Log In")
    assert.equal(revisionLabel(draft({ id: "gone@draft", revisionOf: "gone" }), scenarios), "Revision of gone")
    assert.equal(revisionLabel(draft({ id: "new" }), scenarios), undefined)
  })
})
