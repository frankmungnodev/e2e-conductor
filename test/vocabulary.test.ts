import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import scenarioSchema from "../schema/v1/scenario.schema.json" with { type: "json" }
import type { StepAction } from "../src/db/scenarios.ts"
import { HttpDriver } from "../src/drivers/http.ts"
import { MobileDriver } from "../src/drivers/mobile.ts"
import { ShellDriver } from "../src/drivers/shell.ts"
import { WebDriver } from "../src/drivers/web.ts"
import {
  ACTIONS,
  actionFields,
  COMMON_STEP_FIELDS,
  DRIVER_STEP_FIELDS,
  type DriverName,
  NO_EFFECT_ACTION_FIELDS,
} from "../src/vocabulary.ts"
import { tempDir } from "./temp-dir.ts"

/** Every name an action of `driver` runs under: its name and its aliases. */
const namesOf = (driver: DriverName) => ACTIONS[driver].flatMap((spec) => [spec.name, ...spec.aliases])

/** Fields every action gets, so each case has what it needs to get past its own argument checks. */
const FILLED = { selector: "#x", value: "v", url: "/", key: "Enter", ms: 1, timeout_ms: 1 }

/**
 * Stands in for a Playwright page: every property and call returns itself, and awaiting it gives
 * itself, so an action runs its driver case without a browser.
 */
function anything(): unknown {
  const proxy: unknown = new Proxy(() => proxy, {
    get: (_target, prop) => (prop === "then" ? undefined : prop === Symbol.toPrimitive ? () => "x" : proxy),
    apply: () => proxy,
  })
  return proxy
}

/** The error an action ends with, or undefined when it ran. */
async function errorOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
    return undefined
  } catch (error) {
    return (error as Error).message
  }
}

describe("vocabulary and drivers", () => {
  it("runs every web action and alias in a driver case", async () => {
    const driver = new WebDriver({ driver: "web", service: "web", modules: "modules" }, { url: "http://localhost" }) as unknown as {
      executeAction(page: unknown, step: StepAction, log: (line: string) => void): Promise<unknown>
    }
    for (const name of namesOf("web")) {
      const error = await errorOf(() => driver.executeAction(anything(), { action: name, ...FILLED }, () => {}))
      assert.doesNotMatch(error ?? "", /unknown web action/, name)
    }
  })

  it("runs every mobile action and alias in a driver case, in any letter case", async () => {
    const driver = new MobileDriver({ driver: "mobile", platform: "android", appId: "com.example", flows: "flows" }, "emulator-5554", "adb") as unknown as {
      executeAction(runner: unknown, step: StepAction, appId: string, log: (line: string) => void): Promise<unknown>
    }
    const runner = { runCommands: async () => {} }
    for (const name of [...namesOf("mobile"), "tapOn", "hideKeyboard"]) {
      const error = await errorOf(() => driver.executeAction(runner, { action: name, ...FILLED }, "com.example", () => {}))
      assert.equal(error, undefined, name)
    }
  })

  it("sends each http action as the request method its name says", async () => {
    const methods: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      methods.push(String(init.method))
      return new Response("{}")
    }) as typeof fetch
    try {
      const driver = new HttpDriver({ url: "http://localhost:4000" })
      for (const name of namesOf("http")) {
        await driver.run({ step: { name: "s", target: "api", actions: [{ action: name, url: "/x" }] }, env: {}, log: () => {} } as never)
      }
    } finally {
      globalThis.fetch = realFetch
    }
    assert.deepEqual(methods, ["GET", "POST", "PUT", "PATCH", "DELETE"])
  })

  it("runs the shell action", async () => {
    const driver = new ShellDriver(tempDir("vocabulary-shell"))
    const result = await driver.run({ step: { name: "s", target: "shell", actions: [{ action: "shell", command: "true" }] }, env: {}, log: () => {} } as never)
    assert.equal(result.exitCode, 0)
  })

  it("names only vocabulary actions and aliases in the web and mobile driver switches", () => {
    for (const [driver, file] of [
      ["web", "src/drivers/web.ts"],
      ["mobile", "src/drivers/mobile.ts"],
    ] as const) {
      const labels = [...readFileSync(file, "utf8").matchAll(/case "([^"]+)":/g)].map((match) => match[1])
      assert.ok(labels.length > 10, file)
      for (const label of labels) assert.ok(namesOf(driver).includes(label), `${file}: case "${label}" is not in the vocabulary`)
    }
  })

  it("matches the schema's step fields to the vocabulary's step fields", () => {
    const vocabulary = new Set([...COMMON_STEP_FIELDS, ...Object.values(DRIVER_STEP_FIELDS).flat()])
    assert.deepEqual(Object.keys(scenarioSchema.definitions.Step.properties).sort(), [...vocabulary].sort())
  })

  it("matches the schema's action fields to the vocabulary's action fields, with the no-effect status and exit_code", () => {
    const vocabulary = new Set((Object.keys(ACTIONS) as DriverName[]).flatMap(actionFields))
    assert.deepEqual(Object.keys(scenarioSchema.definitions.StepAction.properties).sort(), [...vocabulary].sort())
    assert.ok(vocabulary.has("status") && vocabulary.has("exit_code"))
    assert.deepEqual(Object.keys(NO_EFFECT_ACTION_FIELDS).sort(), ["exit_code", "status"])
  })
})
