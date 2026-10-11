// Unit tests for the Drafts view's pure helpers.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ScenarioItem } from "../ui/src/types.ts"
import {
  canMarkBugFound,
  defaultDraftEnvironment,
  draftEnvironments,
  keptScenarios,
  passBadge,
  passingDrafts,
  revisionLabel,
  scenarioDraft,
  stateBadge,
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

describe("draft badges", () => {
  it("labels a passing draft Passed", () => {
    assert.deepEqual(passBadge(draft({ id: "a", passed: true, lastRun: { runId: "r1", status: "PASSED" } })), {
      label: "Passed",
      variant: "success",
    })
  })

  it("asks for another run when the last run only passed after a fix", () => {
    assert.deepEqual(passBadge(draft({ id: "a", lastRun: { runId: "r1", status: "FIXED" } })), {
      label: "Fixed, Run Again",
      variant: "warning",
    })
  })

  it("labels a failed or never-run draft Not Yet Passed", () => {
    assert.equal(passBadge(draft({ id: "a", lastRun: { runId: "r1", status: "FAILED" } })).label, "Not Yet Passed")
    assert.equal(passBadge(draft({ id: "b" })).label, "Not Yet Passed")
  })

  it("names the state in Title Case", () => {
    assert.deepEqual(stateBadge("draft"), { label: "Draft", variant: "info" })
    assert.deepEqual(stateBadge("bug_found"), { label: "Bug Found", variant: "danger" })
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
