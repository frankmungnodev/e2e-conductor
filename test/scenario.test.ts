import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { loadScenarios, targetsUsed } from "../src/scenario.ts"

const dirs: string[] = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A config folder with the given scenario files and flow files. */
function project(scenarios: Record<string, unknown>, flows: Record<string, string> = {}): LoadedConfig {
  const dir = mkdtempSync(join(tmpdir(), "e2e-scenario-"))
  dirs.push(dir)
  mkdirSync(join(dir, "scenarios"))
  mkdirSync(join(dir, "flows"))
  for (const [name, scenario] of Object.entries(scenarios)) {
    writeFileSync(join(dir, "scenarios", name), JSON.stringify(scenario))
  }
  for (const [name, flow] of Object.entries(flows)) writeFileSync(join(dir, "flows", name), flow)
  return {
    configDir: dir,
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
            { name: "open", target: "app", flow: "login.yaml", launch: "fresh" },
            { name: "dynamic", target: "app", flow: "${ctx.flow}.yaml" },
            { name: "echo", target: "shell", command: "echo hi" },
          ],
        },
        "a-health.json": { name: "Health", steps: [{ name: "ping", target: "api", url: "/" }] },
        "notes.txt": "ignored",
      },
      { "login.yaml": "- launchApp\n" },
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
    assert.match(problems, /http step needs "url"/)
    assert.match(problems, /mobile step needs "flow" or "launch"/)
  })

  it("checks each named flow once", () => {
    const step = { name: "s", target: "app", flow: "bad.yaml" }
    const problems = problemsOf(
      project(
        {
          "x.json": { name: "X", steps: [step, step] },
          "y.json": { name: "Y", steps: [{ name: "s", target: "app", flow: "missing.yaml" }] },
        },
        { "bad.yaml": "- tapOnn: x\n" },
      ),
    )
    assert.equal(problems.match(/flow bad\.yaml:/g)?.length, 1)
    assert.match(problems, /y\.json: steps\[0\] "s": flow not found: .*missing\.yaml/)
  })
})
