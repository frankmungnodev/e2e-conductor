import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatDuration, friendlyPlaceholders } from "../ui/src/format.ts"
import type { ScenarioReport } from "../ui/src/types.ts"
import { runHeadline, runWhen, sortScenarioReports, stepNote } from "../ui/src/views/reports/reportFormat.ts"
import { formatOffset } from "../ui/src/views/reports/timelineFormat.ts"

describe("report wording", () => {
  it("formats durations for reading at a glance", () => {
    assert.equal(formatDuration(undefined), "-")
    assert.equal(formatDuration(420), "420ms")
    assert.equal(formatDuration(22_495), "22.5s")
    assert.equal(formatDuration(194_100), "3m 14s")
    assert.equal(formatDuration(3_720_000), "1h 2m")
  })

  it("shows placeholders by value name, without the internal scope", () => {
    assert.equal(friendlyPlaceholders("/api/songs/${ctx.songId}?env=${env.APP_ENV}"), "/api/songs/{songId}?env={APP_ENV}")
  })

  it("states a run's outcome in words, including why a run stopped", () => {
    assert.deepEqual(runHeadline({ status: "PASSED", totalScenarios: 15 }), { tone: "success", title: "All 15 scenarios passed" })
    assert.deepEqual(runHeadline({ status: "PASSED", totalScenarios: 1 }), { tone: "success", title: "1 scenario passed" })
    assert.deepEqual(runHeadline({ status: "FAILED", totalScenarios: 15, failedScenarios: 2 }), { tone: "error", title: "2 of 15 scenarios failed" })
    assert.equal(runHeadline({ status: "FAILED", reason: "environment down" }).title, "Stopped: a service or device went down")
    assert.equal(runHeadline({ status: "CANCELLED" }).tone, "stopped")
    assert.equal(runHeadline({ status: "RUNNING" }).tone, "running")
  })

  it("says today and yesterday instead of a date", () => {
    const now = new Date(2026, 9, 7, 15, 0).getTime()
    assert.match(runWhen(new Date(2026, 9, 7, 0, 54).getTime(), now), /^Today, /)
    assert.match(runWhen(new Date(2026, 9, 6, 23, 0).getTime(), now), /^Yesterday, /)
    assert.doesNotMatch(runWhen(new Date(2026, 9, 1, 9, 0).getTime(), now), /^(Today|Yesterday)/)
  })

  it("puts failed scenarios first and explains retried steps", () => {
    const report = (scenarioId: string, status: ScenarioReport["status"]) =>
      ({ scenarioId, status, name: scenarioId, iteration: 1, changedSinceLastPass: false, steps: [], files: [] }) as ScenarioReport
    assert.deepEqual(
      sortScenarioReports([report("a", "PASSED"), report("b", "FAILED"), report("c", "FIXED")]).map((r) => r.scenarioId),
      ["b", "c", "a"],
    )
    assert.equal(stepNote({ recovered: false, fixedByHand: false, attempts: 1 }), undefined)
    assert.equal(stepNote({ recovered: true, fixedByHand: false, attempts: 2 }), "Passed on try 2, after 1 failed try")
    assert.equal(stepNote({ recovered: false, fixedByHand: true, attempts: 3 }), "Passed after you fixed it during the run")
  })
})

describe("formatOffset", () => {
  it("shows time since the scenario started to the millisecond, with minutes past one minute", () => {
    assert.equal(formatOffset(1042, 1000), "+0.042s")
    assert.equal(formatOffset(13_300, 1000), "+12.300s")
    assert.equal(formatOffset(1000 + 125_120, 1000), "+2m 05.120s")
    assert.equal(formatOffset(500, 1000), "-0.500s")
  })
})
