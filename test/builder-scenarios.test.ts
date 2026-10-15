// Unit tests for the scenario builder's list helpers.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ScenarioItem } from "../ui/src/types.ts"
import { builderScenarios, initialBuilderScenario, nextAfterDelete } from "../ui/src/views/scenario-builder/builderScenarios.ts"

function scenario(id: string, draft?: { state: string; group: string; revisionOf?: string }): ScenarioItem {
  return { id, file: `${id}.json`, name: id, steps: [], setup: [], vars: {}, raw: { name: id, steps: [] }, isValid: true, errors: [], targets: [], draft } as ScenarioItem
}

const ids = (items: ScenarioItem[] | ScenarioItem | undefined) => (Array.isArray(items) ? items.map((item) => item.id) : items?.id)

const list = [
  scenario("checkout", { state: "draft", group: "shop" }),
  scenario("login"),
  scenario("login@draft", { state: "draft", group: "shop", revisionOf: "login" }),
  scenario("search", { state: "bug_found", group: "shop" }),
  scenario("signup"),
]

describe("builderScenarios", () => {
  it("lists kept scenarios only, leaving drafts, revisions and Bug found drafts to the Drafts tab", () => {
    assert.deepEqual(ids(builderScenarios(list, "login")), ["login", "signup"])
    assert.deepEqual(ids(builderScenarios(list, null)), ["login", "signup"])
  })

  it("keeps the draft that is open in the builder in the list", () => {
    assert.deepEqual(ids(builderScenarios(list, "login@draft")), ["login", "login@draft", "signup"])
  })
})

describe("initialBuilderScenario", () => {
  it("opens the requested draft, else the first kept scenario, never a draft by default", () => {
    assert.equal(ids(initialBuilderScenario(list, "checkout")), "checkout")
    assert.equal(ids(initialBuilderScenario(list, undefined)), "login")
    assert.equal(ids(initialBuilderScenario([scenario("checkout", { state: "draft", group: "shop" })], undefined)), undefined)
  })
})

describe("nextAfterDelete", () => {
  it("moves to another kept scenario, or none", () => {
    assert.equal(ids(nextAfterDelete(list, "login")), "signup")
    assert.equal(ids(nextAfterDelete([scenario("login"), scenario("checkout", { state: "draft", group: "shop" })], "login")), undefined)
  })
})
