import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { HoldController, HoldError, type PausedStep } from "../src/hold.ts"

const paused = (retryPassed = false): PausedStep => ({
  scenarioId: "a",
  iteration: 1,
  index: 0,
  step: { name: "Fail", target: "shell", command: "exit 1" },
  error: "exited 1",
  label: "Assertion failed",
  retryPassed,
  targets: ["shell"],
})

describe("hold controller", () => {
  it("hands a retry with the edited step back to the waiting loop", async () => {
    const hold = new HoldController()
    const decision = hold.hook(paused())
    assert.equal(hold.paused?.scenarioId, "a")
    hold.retry({ name: "Fixed", target: "shell", command: "true" })
    assert.deepEqual(await decision, { kind: "retry", step: { name: "Fixed", target: "shell", command: "true" } })
    assert.equal(hold.paused, undefined)
  })

  it("refuses continue until a retry has passed", async () => {
    const hold = new HoldController()
    void hold.hook(paused(false))
    assert.throws(() => hold.continue(), HoldError)
    assert.ok(hold.paused, "a refused continue keeps the run paused")
  })

  it("continues once a retry has passed", async () => {
    const hold = new HoldController()
    const decision = hold.hook(paused(true))
    hold.continue()
    assert.deepEqual(await decision, { kind: "continue" })
  })

  it("ends the scenario on request", async () => {
    const hold = new HoldController()
    const decision = hold.hook(paused())
    hold.endScenario()
    assert.deepEqual(await decision, { kind: "end" })
  })

  it("refuses a retry on a target the run did not prepare", () => {
    const hold = new HoldController()
    void hold.hook(paused())
    assert.throws(() => hold.retry({ name: "Web", target: "web", actions: [] }), /not prepared/)
    assert.ok(hold.paused)
  })

  it("refuses every action when the run is not paused", () => {
    const hold = new HoldController()
    assert.throws(() => hold.retry(paused().step), HoldError)
    assert.throws(() => hold.continue(), HoldError)
    assert.throws(() => hold.endScenario(), HoldError)
  })

  it("rejects the pending wait when the run is cancelled", async () => {
    const controller = new AbortController()
    const hold = new HoldController(controller.signal)
    const decision = hold.hook(paused())
    controller.abort()
    await assert.rejects(decision, /Execution cancelled/)
    assert.equal(hold.paused, undefined)
  })
})
