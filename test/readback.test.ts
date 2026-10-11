import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { ACTION_SENTENCES, readback } from "../src/readback.ts"
import type { Scenario, Step } from "../src/scenario.ts"
import { ACTIONS, type DriverName } from "../src/vocabulary.ts"

const config: LoadedConfig = {
  configDir: "/project",
  dbPath: "/project/.e2e/e2e.db",
  env: {},
  scenarios: "scenarios",
  results: "results",
  services: { api: { url: "http://localhost:4000" } },
  targets: {
    api: { driver: "http", service: "api" },
    site: { driver: "web", service: "api", modules: "web" },
    app: { driver: "mobile", platform: "android", appId: "com.example", flows: "flows" },
  },
  fixtures: { seed: { cmd: "true" } },
}

const TARGET_OF: Record<DriverName, string> = { http: "api", web: "site", mobile: "app", shell: "shell" }

const scenarioOf = (steps: Step[], extra: Partial<Scenario> = {}): Scenario => ({ id: "s", name: "S", steps, ...extra })

const sentencesOf = (step: Step, extra: Partial<Scenario> = {}) => readback(config, scenarioOf([step], extra)).steps[0].sentences

describe("readback", () => {
  it("has a sentence for every vocabulary action, reached by its name and by each alias", () => {
    for (const [driver, specs] of Object.entries(ACTIONS) as Array<[DriverName, (typeof ACTIONS)[DriverName]]>) {
      for (const spec of specs) {
        assert.ok(ACTION_SENTENCES[driver][spec.name], `${driver} ${spec.name} has a sentence`)
        for (const name of [spec.name, ...spec.aliases]) {
          const [sentence] = sentencesOf({
            name: "step",
            target: TARGET_OF[driver],
            actions: [{ action: name, selector: "#go", value: "x", url: "/path", key: "Enter", command: "echo hi" }],
          })
          assert.ok(sentence, `${driver} ${name} gives a sentence`)
          assert.notEqual(sentence, `${name} on ${TARGET_OF[driver]}`, `${driver} ${name} does not fall back`)
        }
      }
    }
  })

  it("falls back to the action and target for an action the driver does not run", () => {
    assert.deepEqual(sentencesOf({ name: "step", target: "site", actions: [{ action: "teleport" }] }), ["teleport on site"])
    assert.deepEqual(sentencesOf({ name: "step", target: "nowhere", actions: [{ action: "click" }] }), ["click on nowhere"])
  })

  it("shows a shell step's command verbatim and lists it", () => {
    const command = 'curl -s "$API/health" | grep ${ctx.token}'
    const result = readback(config, scenarioOf([{ name: "probe", target: "shell", command }]))
    assert.deepEqual(result.steps[0].sentences, [`Runs the shell command: ${command}`])
    assert.deepEqual(result.commands, [command])
  })

  it("lists absolute URLs verbatim and leaves relative paths out of that list", () => {
    const result = readback(
      config,
      scenarioOf([
        { name: "open", target: "site", actions: [{ action: "navigate", url: "https://example.com/login" }] },
        { name: "health", target: "api", method: "GET", url: "/health" },
      ]),
    )
    assert.deepEqual(result.steps[0].sentences, ["Opens https://example.com/login"])
    assert.deepEqual(result.steps[1].sentences, ["Sends GET /health"])
    assert.deepEqual(result.urls, ["https://example.com/login"])
  })

  it("says values, setup reuse and placeholders in plain words, with no runtime prefixes", () => {
    const result = readback(
      config,
      scenarioOf(
        [
          {
            name: "login",
            target: "api",
            method: "POST",
            url: "/users/${ctx.userId}?key=${env.API_KEY}",
            body: { email: "${ctx.email}" },
            extract: { token: "data.token" },
            assert: { status: 200, json_match: { "data.ok": true, "data.items": { $contains: "a" } } },
          },
        ],
        { vars: { email: "a@b.co" }, read_only: true, setup: ["seed"] },
      ),
    )
    assert.deepEqual(result.steps[0].sentences, [
      "Sends POST /users/{userId}?key={API_KEY from the environment} with a body",
      "Expects status 200",
      'Expects the response to have data.ok equal to true and data.items containing "a"',
      "Remembers token from the response",
    ])
    assert.deepEqual(result.notes, ['Starts with values: email = "a@b.co"', "Reuses the setup (read-only)"])
    assert.deepEqual(result.fixtures, ["seed"])
    assert.deepEqual(result.targets, ["api"])
    const text = JSON.stringify({ ...result.steps, notes: result.notes })
    for (const jargon of ["ctx.", "vars.", "env.", "json_match", "read_only"]) assert.ok(!text.includes(jargon), jargon)
  })

  it("reads the single-action and launch forms of web and mobile steps", () => {
    assert.deepEqual(sentencesOf({ name: "tap", target: "app", action: "tap", selector: "Sign in" }), ['Taps "Sign in"'])
    assert.deepEqual(sentencesOf({ name: "open", target: "app", launch: "fresh" }), ["Launches the app fresh"])
    assert.deepEqual(sentencesOf({ name: "fill", target: "site", action: "fill", selector: "#email", value: "a@b.co" }), [
      'Fills "#email" with "a@b.co"',
    ])
  })
})
