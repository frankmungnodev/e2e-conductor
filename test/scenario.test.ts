import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { checkSteps, loadScenarios, type Scenario, type Step, targetsUsed } from "../src/scenario.ts"
import { validateScenario } from "../src/schema.ts"
import { tempDir } from "./temp-dir.ts"

/** A config folder with the given scenario files and flow files. */
function project(scenarios: Record<string, unknown>): LoadedConfig {
  const dir = tempDir("scenario")
  mkdirSync(join(dir, "scenarios"))
  for (const [name, scenario] of Object.entries(scenarios)) {
    writeFileSync(join(dir, "scenarios", name), JSON.stringify(scenario))
  }
  return {
    configDir: dir,
    dbPath: resolveDbPath(dir),
    env: {},
    scenarios: "scenarios",
    results: "results",
    services: { api: { url: "http://localhost:4000" } },
    targets: {
      api: { driver: "http", service: "api" },
      app: { driver: "mobile", platform: "android", appId: "com.example", flows: "flows" },
    },
    fixtures: { seed: { cmd: "true" } },
  }
}

function problemsOf(config: LoadedConfig): string {
  try {
    loadScenarios(config)
  } catch (error) {
    return (error as Error).message
  }
  assert.fail("expected loadScenarios to throw")
}

describe("loadScenarios", () => {
  it("loads valid scenarios sorted by file name, with ids", () => {
    const config = project(
      {
        "b-login.json": {
          name: "Login",
          setup: ["seed"],
          steps: [
            { name: "health", target: "api", url: "/health", assert: { status: 200 } },
            { name: "open", target: "app", launch: "fresh" },
            { name: "tap", target: "app", actions: [{ action: "tap", selector: "${ctx.button}" }] },
            { name: "echo", target: "shell", command: "echo hi" },
          ],
        },
        "a-health.json": { name: "Health", steps: [{ name: "ping", target: "api", url: "/" }] },
        "notes.txt": "ignored",
      },
    )
    const scenarios = loadScenarios(config)
    assert.deepEqual(
      scenarios.map((scenario) => scenario.id),
      ["a-health", "b-login"],
    )
    assert.deepEqual([...targetsUsed(scenarios)].sort(), ["api", "app", "shell"])
  })

  it("filters by file name", () => {
    const config = project({
      "a.json": { name: "A", steps: [{ name: "s", target: "shell", command: "true" }] },
      "b.json": { name: "B", steps: [{ name: "s", target: "shell", command: "true" }] },
    })
    assert.deepEqual(
      loadScenarios(config, ["b"]).map((scenario) => scenario.id),
      ["b"],
    )
    assert.throws(() => loadScenarios(config, ["zzz"]), /No scenarios in .* matching zzz/)
  })

  it("reports schema errors", () => {
    const problems = problemsOf(project({ "bad.json": { name: "Bad", steps: [], extra: 1 } }))
    assert.match(problems, /bad\.json: \/ must NOT have additional properties: "extra"/)
    assert.match(problems, /bad\.json: \/steps must NOT have fewer than 1 items/)
  })

  it("reports unknown targets and fixtures", () => {
    const problems = problemsOf(
      project({ "x.json": { name: "X", setup: ["nope"], steps: [{ name: "s", target: "ghost" }] } }),
    )
    assert.match(problems, /setup: unknown fixture "nope"/)
    assert.match(problems, /steps\[0\] "s": unknown target "ghost" \(config has: api, app, shell\)/)
  })

  it("reports fields the target's driver does not accept", () => {
    const problems = problemsOf(
      project({ "x.json": { name: "X", steps: [{ name: "s", target: "api", url: "/", command: "ls" }] } }),
    )
    assert.match(problems, /"command" is not valid for a http target/)
  })

  it("reports a missing required driver field", () => {
    const problems = problemsOf(
      project({
        "x.json": {
          name: "X",
          steps: [
            { name: "h", target: "api" },
            { name: "m", target: "app" },
          ],
        },
      }),
    )
    assert.match(problems, /http step needs "actions" or "url"/)
    assert.match(problems, /mobile step needs "actions", "action", or "launch"/)
  })

  it("rejects web modules, YAML flows and their params, which no step runs any more", () => {
    const problems = problemsOf(
      project({
        "x.json": {
          name: "X",
          steps: [
            { name: "w", target: "api", url: "/", run: "login", params: { user: "a" } },
            { name: "m", target: "app", flow: "home.yaml" },
          ],
        },
      }),
    )
    assert.match(problems, /steps\[0\] "w": "run": web modules are no longer run/)
    assert.match(problems, /steps\[0\] "w": "params": "params" only fed web modules/)
    assert.match(problems, /steps\[1\] "m": "flow": YAML flows are no longer run/)
  })

  it("accepts valid composite step actions for all drivers", () => {
    const config = project({
      "composite.json": {
        name: "Composite Scenario",
        steps: [
          {
            name: "API Steps",
            target: "api",
            actions: [
              { action: "http_get", url: "/api/health" },
              { action: "http_post", url: "/api/login" },
            ],
          },
          {
            name: "Shell Steps",
            target: "shell",
            actions: [{ action: "shell", command: "echo test" }],
          },
          {
            name: "Web Checkout Steps",
            target: "web",
            actions: [
              { action: "navigate", url: "/login" },
              { action: "set_viewport", width: 1920, height: 1080 },
              { action: "fill", selector: "#user", value: "alice" },
              { action: "click", selector: "#submit" },
              { action: "drag_and_drop", selector: "#item-1", target_selector: "#cart" },
              { action: "check", selector: "#terms" },
              { action: "assert_checked", selector: "#terms" },
              { action: "wait_for_url", url: "**/checkout" },
            ],
          },
          {
            name: "Mobile Onboarding Steps",
            target: "app",
            actions: [
              { action: "tap", selector: "Get Started" },
              { action: "type", value: "alice@example.com" },
              { action: "press", key: "ENTER" },
            ],
          },
        ],
      },
    })
    config.targets.web = { driver: "web", service: "api", modules: "modules" }
    const loaded = loadScenarios(config)
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].name, "Composite Scenario")
    assert.equal(loaded[0].steps[0].actions?.length, 2)
    assert.equal(loaded[0].steps[1].actions?.length, 1)
    assert.equal(loaded[0].steps[2].actions?.length, 8)
    assert.equal(loaded[0].steps[3].actions?.length, 3)
  })
})


describe("checkSteps", () => {
  const config = (): LoadedConfig => {
    const loaded = project({})
    loaded.targets.web = { driver: "web", service: "api", modules: "modules" }
    return loaded
  }
  const scenarioOf = (...steps: Step[]): Scenario => ({ id: "x", name: "X", steps })

  it("accepts an action name in any letter case, as the mobile driver matches it", () => {
    assert.deepEqual(checkSteps(config(), scenarioOf({ name: "s", target: "app", actions: [{ action: "tapOn", selector: "Go" }] })), [])
  })

  it("reports an unknown web action with the web actions it could be", () => {
    const [found, ...rest] = checkSteps(config(), scenarioOf({ name: "login", target: "web", actions: [{ action: "clik", selector: "#go" }] }))
    assert.deepEqual(rest, [])
    assert.equal(found.code, "unknown-action")
    assert.equal(found.pointer, "/steps/0/actions/0/action")
    assert.equal(found.stepIndex, 0)
    assert.equal(found.stepName, "login")
    assert.equal(found.value, "clik")
    assert.ok(found.hint.length > 0)
    for (const name of ["navigate", "click", "fill", "assert_text"]) assert.ok(found.allowed?.includes(name), name)
    assert.ok(!found.allowed?.includes("tap"))
  })

  it("reports an unknown single web action", () => {
    const problems = checkSteps(config(), scenarioOf({ name: "s", target: "web", action: "clik" }))
    assert.deepEqual(
      problems.map((found) => [found.code, found.pointer]),
      [["unknown-action", "/steps/0/action"]],
    )
  })

  it("reports an unknown http action, and accepts an http step with no action", () => {
    const problems = checkSteps(config(), scenarioOf({ name: "s", target: "api", actions: [{ action: "http_fetch", url: "/" }] }))
    assert.deepEqual(
      problems.map((found) => found.code),
      ["unknown-action"],
    )
    assert.deepEqual(checkSteps(config(), scenarioOf({ name: "s", target: "api", url: "/health" })), [])
  })

  it("rejects a removed field in both the schema and the step check", () => {
    const scenario = scenarioOf({ name: "s", target: "web", action: "click", selector: "#go", run: "login" })
    assert.equal(validateScenario(scenario), false)
    assert.ok(validateScenario.errors?.some((error) => error.params.additionalProperty === "run"))
    assert.deepEqual(
      checkSteps(config(), scenario).map((found) => [found.code, found.pointer, found.value]),
      [["field-removed", "/steps/0/run", "run"]],
    )
  })

  it("reports an action field the target's driver does not read", () => {
    const problems = checkSteps(config(), scenarioOf({ name: "s", target: "api", actions: [{ action: "http_get", url: "/", selector: "#x" }] }))
    assert.deepEqual(
      problems.map((found) => [found.code, found.pointer]),
      [["field-not-allowed", "/steps/0/actions/0/selector"]],
    )
  })

  it("accepts the builder's http status and shell exit code on an action", () => {
    const scenario = scenarioOf(
      { name: "h", target: "api", actions: [{ id: "a1", action: "http_get", method: "GET", url: "/api", status: 200 }] },
      { name: "c", target: "shell", actions: [{ id: "a2", action: "shell", command: "echo hi", exit_code: 0 }] },
    )
    assert.equal(validateScenario(scenario), true)
    assert.deepEqual(checkSteps(config(), scenario), [])
  })

  it("accepts a mobile step with a single action", () => {
    assert.deepEqual(checkSteps(config(), scenarioOf({ name: "s", target: "app", action: "tap", selector: "Login" })), [])
  })
})
