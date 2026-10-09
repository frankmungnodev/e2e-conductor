import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { loadScenarios, targetsUsed } from "../src/scenario.ts"
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

