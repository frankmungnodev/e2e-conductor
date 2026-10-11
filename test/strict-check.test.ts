import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { saveEnvPlatform } from "../src/db/env-platforms.ts"
import { saveEnvironment, setDefaultEnvironment } from "../src/db/environments.ts"
import { savePlatform } from "../src/db/platforms.ts"
import type { Scenario, Step } from "../src/db/scenarios.ts"
import { type CheckedEnvironment, checkStrict, environmentsToCheck } from "../src/strict-check.ts"
import { tempDir } from "./temp-dir.ts"

const api = { driver: "http", service: "api" } as const
const web = { driver: "web", service: "web", modules: "modules" } as const

/** The active environment's config, which the strict check must not read targets or env names from. */
const config: LoadedConfig = {
  configDir: ".",
  dbPath: "unused.db",
  env: { API_KEY: "from-process" },
  scenarios: "scenarios",
  results: "results",
  services: {},
  targets: { api, web },
  fixtures: {},
}

const dev: CheckedEnvironment = { name: "dev", targets: { api, web }, envVars: ["BASE_TOKEN", "USER_EMAIL"] }

const scenario = (steps: Step[], vars?: Record<string, unknown>): Scenario => ({ id: "s", name: "S", vars, steps })

const codes = (problems: { code: string }[]) => problems.map((found) => found.code)

describe("checkStrict", () => {
  it("passes a scenario that extracts before it uses and names only configured env variables", () => {
    const steps: Step[] = [
      { name: "Log in", target: "api", url: "/login", body: { email: "${env.USER_EMAIL}" }, extract: { token: "body.token" } },
      { name: "Profile", target: "api", url: "/me", headers: { authorization: "Bearer ${ctx.token}" } },
    ]
    assert.deepEqual(checkStrict(config, scenario(steps), [dev]), [])
  })

  it("reports a ctx value extracted by a later step as ctx-produced-later, naming that step", () => {
    const steps: Step[] = [
      { name: "Health", target: "api", url: "/health" },
      { name: "Profile", target: "api", url: "/me", headers: { authorization: "Bearer ${ctx.token}" } },
      { name: "Ping", target: "api", url: "/ping" },
      { name: "Log in", target: "api", url: "/login", extract: { token: "body.token" } },
    ]
    const [found, ...rest] = checkStrict(config, scenario(steps), [dev])
    assert.deepEqual(rest, [])
    assert.equal(found.code, "ctx-produced-later")
    assert.equal(found.pointer, "/steps/1/headers/authorization")
    assert.equal(found.stepIndex, 1)
    assert.equal(found.value, "token")
    assert.match(found.message, /steps\[3\] "Log in"/)
    assert.ok(found.hint.length > 0)
  })

  it("reports a ctx value nothing sets as ctx-not-produced", () => {
    const steps: Step[] = [{ name: "Open", target: "web", actions: [{ action: "fill", selector: "#email", value: "${ctx.token}" }] }]
    const [found, ...rest] = checkStrict(config, scenario(steps), [dev])
    assert.deepEqual(rest, [])
    assert.equal(found.code, "ctx-not-produced")
    assert.equal(found.pointer, "/steps/0/actions/0/value")
    assert.equal(found.value, "token")
    assert.ok(found.hint.length > 0)
  })

  it("accepts a ctx value the scenario's vars define, including a nested path", () => {
    const steps: Step[] = [{ name: "Open", target: "web", actions: [{ action: "fill", selector: "#email", value: "${ctx.user.email}" }] }]
    assert.deepEqual(checkStrict(config, scenario(steps, { user: { email: "a@b.c" } }), [dev]), [])
  })

  it("reports an env name set only in the process env as unknown-env-var, listing the configured names", () => {
    const steps: Step[] = [{ name: "Call", target: "api", url: "/x", headers: { "x-api-key": "${env.API_KEY}" } }]
    const [found, ...rest] = checkStrict(config, scenario(steps), [dev])
    assert.deepEqual(rest, [])
    assert.equal(found.code, "unknown-env-var")
    assert.equal(found.pointer, "/steps/0/headers/x-api-key")
    assert.equal(found.value, "API_KEY")
    assert.deepEqual(found.allowed, ["BASE_TOKEN", "USER_EMAIL"])
    assert.ok(found.hint.length > 0)
  })

  it("reports an absolute http url as raw-url and accepts a relative one", () => {
    const steps: Step[] = [
      { name: "Absolute", target: "api", url: "https://example.com/x" },
      { name: "Relative", target: "api", url: "/x" },
      { name: "Navigate", target: "web", actions: [{ action: "goto", value: "http://localhost:5173/login" }] },
      { name: "Typed", target: "web", actions: [{ action: "fill", selector: "#site", value: "https://example.com" }] },
    ]
    const problems = checkStrict(config, scenario(steps), [dev])
    assert.deepEqual(
      problems.map(({ code, pointer }) => [code, pointer]),
      [
        ["raw-url", "/steps/0/url"],
        ["raw-url", "/steps/2/actions/0/value"],
      ],
    )
    assert.ok(problems.every((found) => found.hint.length > 0))
  })

  it("reports a target one checked environment lacks as unknown-target, naming that environment", () => {
    const staging: CheckedEnvironment = { name: "staging", targets: { api }, envVars: [] }
    const steps: Step[] = [{ name: "Open", target: "web", actions: [{ action: "navigate", url: "/" }] }]
    const [found, ...rest] = checkStrict(config, scenario(steps), [dev, staging])
    assert.deepEqual(rest, [])
    assert.equal(found.code, "unknown-target")
    assert.equal(found.pointer, "/steps/0/target")
    assert.match(found.message, /environment "staging"/)
    assert.deepEqual(found.allowed, ["api", "shell"])
    assert.ok(found.hint.length > 0)
  })

  it("checks targets against the given environments, not the active config", () => {
    const apiOnly: CheckedEnvironment = { name: "dev", targets: { api }, envVars: [] }
    const steps: Step[] = [{ name: "Open", target: "web", actions: [{ action: "navigate", url: "/" }] }]
    assert.deepEqual(codes(checkStrict(config, scenario(steps), [apiOnly])), ["unknown-target"])
  })
})

describe("environmentsToCheck", () => {
  /** A database with an `api` platform everywhere, a `web` platform disabled in staging, and staging as default. */
  function database() {
    const db = openDatabase(join(tempDir("strict-check"), "e2e.db"))
    saveEnvironment(db, "dev", { env: { DEV_ONLY: "1" } })
    saveEnvironment(db, "staging", { env: { STAGING_ONLY: "1" } })
    savePlatform(db, { id: "plat-api", name: "api", type: "api", url: "http://localhost:4000" })
    savePlatform(db, { id: "plat-web", name: "web", type: "web", url: "http://localhost:5173" })
    saveEnvPlatform(db, { envName: "staging", platformId: "plat-web", enabled: false })
    setDefaultEnvironment(db, "staging")
    return db
  }

  it("reads each named environment's targets and configured env variable names", () => {
    const db = database()
    const { environments, notices } = environmentsToCheck(db, ["dev", "staging"])
    db.close()
    assert.deepEqual(notices, [])
    assert.deepEqual(
      environments.map(({ name, targets, envVars }) => [name, Object.keys(targets), envVars]),
      [
        ["dev", ["api", "web"], ["DEV_ONLY"]],
        ["staging", ["api"], ["STAGING_ONLY"]],
      ],
    )
  })

  it("uses the default environment with a no-draft-environment notice when none is named", () => {
    const db = database()
    const { environments, notices } = environmentsToCheck(db, [])
    db.close()
    assert.deepEqual(
      environments.map(({ name, targets }) => [name, Object.keys(targets)]),
      [["staging", ["api"]]],
    )
    assert.deepEqual(codes(notices), ["no-draft-environment"])
    assert.ok(notices[0].hint.length > 0)
  })
})
