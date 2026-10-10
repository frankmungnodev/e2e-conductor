import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import type { Driver, StepRun } from "../src/drivers/types.ts"
import type { PauseHook } from "../src/hold.ts"
import { RunLog } from "../src/logger.ts"
import type { Scenario, Step } from "../src/scenario.ts"
import { runScenario } from "../src/scenario-run.ts"
import { tempDir } from "./temp-dir.ts"

/**
 * A driver with a screen. Each capture writes the name of the attempt that ran last, so a test can
 * tell which attempt an image shows. A step named in `failFirst` fails on its first attempt only;
 * one whose name starts with "Broken" always fails.
 */
class ScreenDriver implements Driver {
  last = ""
  captures: string[] = []
  ended: boolean[] = []
  private tried = new Set<string>()
  constructor(
    private readonly failFirst: string[] = [],
    private readonly captureError?: Error,
    private readonly captureMs = 0,
  ) {}

  async run({ step }: StepRun) {
    const first = !this.tried.has(step.name)
    this.tried.add(step.name)
    this.last = `${step.name} attempt ${first ? "first" : "later"}`
    if (step.name.startsWith("Broken") || (first && this.failFirst.includes(step.name))) throw new Error(`${step.name} failed`)
    return { data: {} }
  }

  async captureScreen(path: string) {
    if (this.captureMs) await new Promise((resolve) => setTimeout(resolve, this.captureMs))
    if (this.captureError) throw this.captureError
    this.captures.push(path)
    writeFileSync(path, this.last)
  }

  async endScenario(failed: boolean) {
    this.ended.push(failed)
  }
}

/** A driver with no screen, like the HTTP and shell drivers. */
const apiDriver: Driver = { run: async () => ({ data: {} }) }

const step = (name: string, target = "web", extra: Partial<Step> = {}): Step => ({ name, target, ...extra })

async function play(
  steps: Step[],
  driver: ScreenDriver,
  options: { stepScreenshots?: boolean; pause?: PauseHook } = { stepScreenshots: true },
) {
  const dir = tempDir("step-shots")
  const lines: string[] = []
  const config = { configDir: dir, env: {}, targets: {}, scenarios: "scenarios", results: "results", dbPath: join(dir, "e2e.db") } as LoadedConfig
  const scenario: Scenario = { id: "flow", name: "Flow", steps } as Scenario
  const outcome = await runScenario(config, scenario, {
    drivers: new Map<string, Driver>([
      ["web", driver],
      ["api", apiDriver],
    ]),
    dir,
    iteration: 1,
    totalIterations: 1,
    label: "flow",
    out: new RunLog([join(dir, "run.log")], (line) => lines.push(line)),
    runId: "run1",
    recheck: async () => [],
    stepScreenshots: options.stepScreenshots,
    pause: options.pause,
  })
  const shot = (n: number) => {
    const path = join(dir, `step-${n}.png`)
    return existsSync(path) ? readFileSync(path, "utf8") : undefined
  }
  return { outcome, shot, log: readFileSync(join(dir, "run.log"), "utf8") }
}

describe("screenshot every step", () => {
  it("saves one image per screen step and none for a step without a screen (AE1)", async () => {
    const driver = new ScreenDriver()
    const { shot } = await play([step("Open"), step("Call API", "api"), step("Check")], driver)
    assert.equal(shot(1), "Open attempt first")
    assert.equal(shot(2), undefined)
    assert.equal(shot(3), "Check attempt first")
  })

  it("captures a failed step before the scenario ends, and still ends it as failed (AE2)", async () => {
    const driver = new ScreenDriver()
    const { shot, outcome } = await play([step("Broken submit")], driver)
    assert.equal(outcome.failure?.step, "Broken submit")
    assert.equal(shot(1), "Broken submit attempt first")
    assert.deepEqual(driver.ended, [true])
  })

  it("keeps the image of the passing retry, captured once (AE3)", async () => {
    const driver = new ScreenDriver(["Flaky"])
    const { shot } = await play([step("Flaky", "web", { retry: { times: 1, delay_ms: 1 } })], driver)
    assert.equal(shot(1), "Flaky attempt later")
    assert.equal(driver.captures.length, 1)
  })

  it("retakes the image after a manual retry passes during a pause (AE6)", async () => {
    const driver = new ScreenDriver(["Login"])
    const decisions: Array<"retry" | "continue"> = ["retry", "continue"]
    const pause: PauseHook = async (paused) => {
      const kind = decisions.shift() ?? "continue"
      return kind === "retry" ? { kind, step: paused.step } : { kind }
    }
    const { shot, outcome } = await play([step("Login")], driver, { stepScreenshots: true, pause })
    assert.equal(outcome.fixed, true)
    assert.equal(shot(1), "Login attempt later")
    assert.equal(driver.captures.length, 2)
  })

  it("never captures when the option is off (AE4)", async () => {
    const driver = new ScreenDriver()
    const { shot } = await play([step("Open")], driver, {})
    assert.equal(shot(1), undefined)
    assert.equal(driver.captures.length, 0)
  })

  it("keeps the step passing when a capture fails, and logs it", async () => {
    const driver = new ScreenDriver([], new Error("page closed"))
    const { outcome, shot, log } = await play([step("Open")], driver)
    assert.equal(outcome.failure, undefined)
    assert.equal(shot(1), undefined)
    assert.match(log, /screenshot failed: page closed/)
  })

  it("leaves a slow capture out of the step's time", async () => {
    const driver = new ScreenDriver([], undefined, 300)
    const { log } = await play([step("Open")], driver)
    const ms = Number(/Open (\d+)ms/.exec(log)?.[1])
    assert.ok(ms < 300, `step took ${ms}ms`)
  })
})
