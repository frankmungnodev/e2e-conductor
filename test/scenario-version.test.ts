import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { openDatabase } from "../src/db/connection.ts"
import { getScenario, type Scenario, saveScenario } from "../src/db/scenarios.ts"
import { scenarioVersion } from "../src/scenario-version.ts"
import { tempDir } from "./temp-dir.ts"

const base = (): Scenario => ({
  id: "01-smoke",
  name: "Smoke",
  description: "Checks login",
  setup: ["seed"],
  vars: { user: "ann" },
  steps: [
    {
      id: "step-a",
      name: "Login",
      target: "web",
      actions: [{ id: "action-a", action: "fill", selector: "#user", value: "${env.TOKEN}" }],
    },
    { id: "step-b", name: "Health", target: "api", method: "GET", url: "/health" },
  ],
})

const fingerprint = (scenario: Scenario) => scenarioVersion(scenario).fingerprint

describe("scenarioVersion", () => {
  it("gives the same fingerprint for the same scenario", () => {
    assert.equal(fingerprint(base()), fingerprint(base()))
    assert.match(fingerprint(base()), /^[0-9a-f]{64}$/)
  })

  it("changes when what runs changes", () => {
    const original = fingerprint(base())

    const selector = base()
    selector.steps[0].actions = [{ id: "action-a", action: "fill", selector: "#email", value: "${env.TOKEN}" }]
    const variable = { ...base(), vars: { user: "bob" } }
    const setup = { ...base(), setup: ["seed", "reset"] }
    const order = base()
    order.steps.reverse()

    for (const changed of [selector, variable, setup, order]) assert.notEqual(fingerprint(changed), original)
  })

  it("ignores name, description, step ids and action ids", () => {
    const renamed = { ...base(), name: "Renamed", description: "Other words" }
    renamed.steps = renamed.steps.map((step) => ({
      ...step,
      id: `new-${step.id}`,
      actions: step.actions?.map((action) => ({ ...action, id: "other" })),
    }))
    assert.equal(fingerprint(renamed), fingerprint(base()))
  })

  it("ignores key order, null fields, and missing versus empty setup and vars", () => {
    const reordered: Scenario = {
      steps: base().steps.map((step) => Object.fromEntries(Object.entries(step).reverse()) as Scenario["steps"][number]),
      vars: { user: "ann" },
      setup: ["seed"],
      name: "Smoke",
      id: "01-smoke",
    }
    assert.equal(fingerprint(reordered), fingerprint(base()))

    const withNulls = base()
    withNulls.steps[1] = { ...withNulls.steps[1], timeout_ms: null as unknown as number, retry: undefined }
    assert.equal(fingerprint(withNulls), fingerprint(base()))

    const bare: Scenario = { id: "x", name: "x", steps: [] }
    assert.equal(fingerprint(bare), fingerprint({ ...bare, setup: [], vars: {} }))
  })

  it("keeps null values inside the scenario's own data", () => {
    // A null expected value is a real assertion, and a null var or body field changes what is sent.
    const withNullAssert = base()
    withNullAssert.steps[1] = { ...withNullAssert.steps[1], assert: { json_match: { error: null } } }
    const withEmptyAssert = base()
    withEmptyAssert.steps[1] = { ...withEmptyAssert.steps[1], assert: { json_match: {} } }
    assert.notEqual(fingerprint(withNullAssert), fingerprint(withEmptyAssert))

    assert.notEqual(fingerprint({ ...base(), vars: { user: null } }), fingerprint({ ...base(), vars: {} }))
  })

  it("keeps placeholders as written", () => {
    assert.match(scenarioVersion(base()).json, /\$\{env\.TOKEN\}/)
  })

  it("matches after a database round trip", () => {
    const db = openDatabase(join(tempDir("scenario-version"), "e2e.db"))
    try {
      const scenario = base()
      saveScenario(db, scenario)
      const loaded = getScenario(db, scenario.id)
      assert.ok(loaded)
      assert.equal(fingerprint(loaded), fingerprint(base()))
    } finally {
      db.close()
    }
  })
})
