import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { StepHistory } from "../ui/src/types.ts"
import { historyDetails, historyHeadline, isFlaky } from "../ui/src/views/scenario-builder/stepHistory.ts"

const history = (overrides: Partial<StepHistory>): StepHistory => ({
  executions: 5,
  passed: 5,
  recovered: 0,
  failed: 0,
  recent: [],
  ...overrides,
})

describe("step history helpers", () => {
  it("calls a step flaky when it passed after a retry, or both passed and failed", () => {
    assert.equal(isFlaky(undefined), false)
    assert.equal(isFlaky(history({})), false)
    assert.equal(isFlaky(history({ passed: 4, recovered: 1 })), true)
    assert.equal(isFlaky(history({ passed: 4, failed: 1 })), true)
    assert.equal(isFlaky(history({ passed: 0, failed: 5 })), false)
  })

  it("headlines first-try passes, and lists only the outcomes that happened", () => {
    assert.equal(historyHeadline(undefined), undefined)
    assert.equal(historyHeadline(history({ executions: 1, passed: 1 })), "Passed first try in 1 of the last 1 run")
    assert.equal(historyHeadline(history({ passed: 3, recovered: 1, failed: 1 })), "Passed first try in 3 of the last 5 runs")
    assert.deepEqual(historyDetails(history({ passed: 3, recovered: 1, failed: 1 })), ["1 passed only after a retry", "1 failed"])
    assert.deepEqual(historyDetails(history({})), [])
  })
})
