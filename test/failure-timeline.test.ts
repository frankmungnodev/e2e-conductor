import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { StepRunRecord } from "../src/db/runs.ts"
import { buildFailureTimeline, parseExchanges, parseLogcat } from "../src/failure-timeline.ts"

const START = Date.UTC(2026, 9, 11, 12, 0, 0)

const attempt = (index: number, n: number, status: StepRunRecord["status"], at: number, extra: Partial<StepRunRecord> = {}) => ({
  id: `run-1:login:1:${index}:${n}`,
  runId: "run-1",
  scenarioId: "login",
  iteration: 1,
  attempt: n,
  status,
  durationMs: 50,
  createdAt: at,
  index,
  ...extra,
})

describe("parseLogcat", () => {
  it("reads year and UTC lines exactly, keeps only warnings and worse, and joins a stack trace into one entry", () => {
    const log = [
      "--------- beginning of main",
      "2026-10-11 12:00:01.000  100  100 I ActivityManager: Start proc",
      "2026-10-11 12:00:02.500  200  200 E AndroidRuntime: FATAL EXCEPTION: main",
      "2026-10-11 12:00:02.500  200  200 E AndroidRuntime: java.lang.IllegalStateException: boom",
      "2026-10-11 12:00:03.000  200  210 W OkHttp: slow call",
    ].join("\n")
    const { entries, clock } = parseLogcat(log, START)
    assert.equal(clock, "exact")
    assert.deepEqual(
      entries.map((e) => [e.at - START, e.level, e.title, e.detail]),
      [
        [2500, "error", "AndroidRuntime", "FATAL EXCEPTION: main\njava.lang.IllegalStateException: boom"],
        [3000, "warning", "OkHttp", "slow call"],
      ],
    )
  })

  it("reads lines without a year in this computer's time zone, in the year nearest the scenario start", () => {
    const start = new Date(2026, 0, 1, 0, 0, 5).getTime()
    const { entries, clock } = parseLogcat("12-31 23:59:59.000  1  1 E App: late", start)
    assert.equal(clock, "assumed")
    assert.equal(entries[0].at, new Date(2025, 11, 31, 23, 59, 59).getTime())
  })

  it("reports no clock for a log with no lines it can read", () => {
    assert.deepEqual(parseLogcat("E AndroidRuntime: FATAL EXCEPTION", START), { entries: [], clock: undefined })
  })
})

describe("parseExchanges", () => {
  it("shows each request's path and outcome, and marks errors and status 400 and up", () => {
    const json = JSON.stringify([
      { step: "sign in", startedAt: new Date(START + 100).toISOString(), durationMs: 20, request: { method: "POST", url: "http://api.local/login?x=1" }, response: { status: 200 } },
      { step: "profile", startedAt: new Date(START + 200).toISOString(), durationMs: 5, request: { method: "GET", url: "http://api.local/me" }, response: { status: 500 } },
      { step: "ping", startedAt: new Date(START + 300).toISOString(), durationMs: 1, request: { method: "GET", url: "http://down.local/" }, error: "ECONNREFUSED" },
    ])
    assert.deepEqual(
      parseExchanges(json).map((e) => [e.at - START, e.level, e.title, e.detail]),
      [
        [100, "info", "POST /login?x=1", "200 · sign in"],
        [200, "error", "GET /me", "500 · profile"],
        [300, "error", "GET /", "No response: ECONNREFUSED · ping"],
      ],
    )
  })

  it("gives nothing for a file it cannot read", () => {
    assert.deepEqual(parseExchanges("{not json"), [])
    assert.deepEqual(parseExchanges(JSON.stringify({ step: "x" })), [])
  })
})

describe("buildFailureTimeline", () => {
  it("orders step attempts, requests and device lines by time, step first on a tie", () => {
    const timeline = buildFailureTimeline({
      startedAt: START,
      steps: [{ name: "sign in" }, { name: "open profile" }],
      attempts: [
        attempt(0, 1, "PASSED", START + 100),
        attempt(1, 1, "FAILED", START + 200, { errorMessage: "expected 200, got 500\nat line 3" }),
        attempt(1, 2, "PASSED", START + 900, { manual: true }),
      ],
      httpExchanges: JSON.stringify([
        { step: "open profile", startedAt: new Date(START + 200).toISOString(), request: { method: "GET", url: "http://api.local/me" }, response: { status: 500 } },
      ]),
      logcat: "2026-10-11 12:00:00.250  1  1 E App: crash",
    })
    assert.equal(timeline.deviceEntries, 1)
    assert.equal(timeline.deviceClock, "exact")
    assert.deepEqual(
      timeline.events.map((e) => [e.at - START, e.source, e.title, e.detail]),
      [
        [100, "step", "1. sign in", "Passed"],
        [200, "step", "2. open profile", "Failed: expected 200, got 500"],
        [200, "http", "GET /me", "500 · open profile"],
        [250, "device", "App", "crash"],
        [900, "step", "2. open profile (manual retry)", "Passed"],
      ],
    )
  })

  it("keeps only the latest 100 device entries", () => {
    const log = Array.from({ length: 120 }, (_, i) => `2026-10-11 12:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}  1  ${i} E App: line ${i}`).join("\n")
    const timeline = buildFailureTimeline({ startedAt: START, steps: [], attempts: [], logcat: log })
    assert.equal(timeline.deviceEntries, 120)
    assert.equal(timeline.events.length, 100)
    assert.ok(timeline.events.every((e) => Number(e.detail?.split(" ")[1]) >= 20))
  })
})
