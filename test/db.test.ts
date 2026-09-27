import assert from "node:assert/strict"
import { existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  checkDbStatus,
  deleteEnvironment,
  deleteEnvPlatform,
  deleteFixture,
  deletePlatform,
  deleteScenario,
  deleteStepGroup,
  deleteStepPreset,
  getActiveEnvironment,
  getDefaultEnvironment,
  getEnvironments,
  getEnvPlatforms,
  getFixtures,
  getPlatforms,
  getPlatformsForEnv,
  getRun,
  getRuns,
  getScenario,
  getScenarios,
  getStepGroup,
  getStepGroups,
  getStepPreset,
  getStepPresets,
  getStepRuns,
  openDatabase,
  type PlatformRecord,
  platformsToTargetsAndServices,
  resolveDbPath,
  resolveProjectDir,
  saveEnvironment,
  saveEnvPlatform,
  saveFixture,
  savePlatform,
  saveRun,
  saveScenario,
  saveStepGroup,
  saveStepPreset,
  saveStepRun,
  setActiveEnvironment,
  setDefaultEnvironment,
  writeDbPointer,
} from "../src/db.ts"
import { tempDir } from "./temp-dir.ts"

describe("sqlite db configuration storage", () => {
  const dir = tempDir("db-test")

  it("resolves project directory from direct directory or db file paths", () => {
    assert.equal(resolveProjectDir(dir), dir)
    assert.equal(resolveProjectDir(join(dir, ".e2e", "e2e.db")), dir)
    assert.equal(resolveProjectDir(join(dir, ".e2e")), dir)
    assert.equal(resolveProjectDir(join(dir, "custom.sqlite")), dir)
  })

  it("resolves default db path to .e2e/e2e.db", () => {
    const path = resolveDbPath(dir)
    assert.equal(path, join(dir, ".e2e", "e2e.db"))
  })

  it("resolves custom directory path by appending e2e.db", () => {
    const path = resolveDbPath(dir, ".custom-e2e")
    assert.equal(path, join(dir, ".custom-e2e", "e2e.db"))
  })

  it("resolves custom file path directly", () => {
    const path = resolveDbPath(dir, "my-data.sqlite")
    assert.equal(path, join(dir, "my-data.sqlite"))
  })

  it("reads custom path from pointer file", () => {
    const custom = join(dir, "storage", "config.db")
    writeDbPointer(dir, custom)
    const resolved = resolveDbPath(dir)
    assert.equal(resolved, custom)
    unlinkSync(join(dir, ".e2e-db"))
  })

  it("checks db status when db does not exist", () => {
    const status = checkDbStatus(dir)
    assert.equal(status.dbExists, false)
    assert.equal(status.hasEnvironments, false)
    assert.equal(status.environmentsCount, 0)
  })

  it("creates tables and manages environments", () => {
    const dbPath = join(dir, "test.db")
    const db = openDatabase(dbPath)

    assert.ok(existsSync(dbPath))

    // Initially empty
    let envs = getEnvironments(db)
    assert.deepEqual(envs, {})

    // First environment saved becomes default & active automatically
    saveEnvironment(db, "main", {
      description: "Local development baseline",
      url: "http://localhost:5173",
      env: { APP_ENV: "main" },
    })

    envs = getEnvironments(db)
    assert.ok(envs.main)
    assert.equal(envs.main.description, "Local development baseline")
    assert.equal(envs.main.url, "http://localhost:5173")
    assert.equal(envs.main.env?.APP_ENV, "main")
    assert.equal(getActiveEnvironment(db), "main")
    assert.equal(getDefaultEnvironment(db), "main")

    // Save second environment
    saveEnvironment(db, "staging", {
      description: "Staging environment",
      url: "https://staging.example.com",
      env: { APP_ENV: "staging" },
    })

    envs = getEnvironments(db)
    assert.equal(Object.keys(envs).length, 2)
    assert.ok(envs.staging)

    // Switch active environment
    setActiveEnvironment(db, "staging")
    assert.equal(getActiveEnvironment(db), "staging")

    // Switch default environment
    setDefaultEnvironment(db, "staging")
    assert.equal(getDefaultEnvironment(db), "staging")

    // Delete environment
    deleteEnvironment(db, "staging")
    envs = getEnvironments(db)
    assert.equal(Object.keys(envs).length, 1)
    assert.equal(envs.staging, undefined)
    assert.equal(getActiveEnvironment(db), "main")

    db.close()
  })

  it("manages platforms and converts to targets and services", () => {
    const dbPath = join(dir, "platforms-test.db")
    const db = openDatabase(dbPath)

    const webPlatform: PlatformRecord = {
      id: "plat-web",
      name: "web",
      type: "web",
      url: "http://localhost:5173",
      startCmd: "pnpm dev",
      modules: "e2e/modules/web",
      slowMo: 100,
      headless: false,
    }

    const mobilePlatform: PlatformRecord = {
      id: "plat-android",
      name: "app",
      type: "android",
      appId: "com.example.app",
      flows: "e2e/flows",
      installCmd: "./gradlew installDebug",
      reversePorts: [8080],
    }

    const apiPlatform: PlatformRecord = {
      id: "plat-api",
      name: "api",
      type: "api",
      url: "http://localhost:4000",
      health: "/health",
      startCmd: "pnpm start",
    }

    savePlatform(db, webPlatform)
    savePlatform(db, mobilePlatform)
    savePlatform(db, apiPlatform)

    const platforms = getPlatforms(db)
    assert.equal(platforms.length, 3)

    const { targets, services } = platformsToTargetsAndServices(platforms)
    assert.ok(targets.web)
    assert.equal(targets.web.driver, "web")
    assert.ok(services.web)
    assert.equal(services.web.url, "http://localhost:5173")

    assert.ok(targets.app)
    assert.equal(targets.app.driver, "mobile")

    assert.ok(targets.api)
    assert.equal(targets.api.driver, "http")
    assert.ok(services.api)
    assert.equal(services.api.url, "http://localhost:4000")

    // Delete platform
    deletePlatform(db, "api")
    const remaining = getPlatforms(db)
    assert.equal(remaining.length, 2)
    assert.ok(!remaining.some((p) => p.name === "api"))

    db.close()
  })

  it("manages env_platform pivot relationships and environment overrides", () => {
    const dbPath = join(dir, "pivot-test.db")
    const db = openDatabase(dbPath)

    // Create environments
    saveEnvironment(db, "dev", {
      description: "Development baseline",
      url: "http://localhost:5173",
      env: { APP_ENV: "dev" },
    })
    saveEnvironment(db, "staging", {
      description: "Staging cluster",
      url: "https://staging.example.com",
      env: { APP_ENV: "staging" },
    })

    // Create platforms
    savePlatform(db, {
      id: "plat-web",
      name: "web",
      type: "web",
      url: "http://localhost:5173",
      startCmd: "pnpm dev",
      headless: false,
    })
    savePlatform(db, {
      id: "plat-api",
      name: "api",
      type: "api",
      url: "http://localhost:3000",
      health: "/health",
    })

    // Auto-seeding should create 4 pivot links: (dev, web), (dev, api), (staging, web), (staging, api)
    let links = getEnvPlatforms(db)
    assert.equal(links.length, 4)

    // Override staging web platform: remote URL, headless, no local start command
    saveEnvPlatform(db, {
      envName: "staging",
      platformId: "plat-web",
      enabled: true,
      url: "https://web.staging.example.com",
      headless: true,
      startCmd: undefined,
    })

    // Disable API platform in staging
    saveEnvPlatform(db, {
      envName: "staging",
      platformId: "plat-api",
      enabled: false,
    })

    // Check dev environment platforms (unmodified, base values)
    const devPlatforms = getPlatformsForEnv(db, "dev")
    const devWeb = devPlatforms.find((p) => p.name === "web")
    assert.ok(devWeb)
    assert.equal(devWeb.enabled, true)
    assert.equal(devWeb.url, "http://localhost:5173")
    assert.equal(devWeb.headless, false)
    assert.equal(devWeb.startCmd, "pnpm dev")

    // Check staging environment platforms (with overrides applied)
    const stagingPlatforms = getPlatformsForEnv(db, "staging")
    const stagingWeb = stagingPlatforms.find((p) => p.name === "web")
    const stagingApi = stagingPlatforms.find((p) => p.name === "api")

    assert.ok(stagingWeb)
    assert.equal(stagingWeb.enabled, true)
    assert.equal(stagingWeb.url, "https://web.staging.example.com")
    assert.equal(stagingWeb.headless, true)
    assert.equal(stagingWeb.hasOverrides, true)
    assert.ok(stagingWeb.overriddenFields.includes("url"))

    assert.ok(stagingApi)
    assert.equal(stagingApi.enabled, false)

    // Check target/service resolution for staging (disabled api is omitted)
    const { targets: stagingTargets, services: stagingServices } = platformsToTargetsAndServices(stagingPlatforms)
    assert.ok(stagingTargets.web)
    assert.equal(stagingServices.web.url, "https://web.staging.example.com")
    assert.equal(stagingTargets.api, undefined) // Disabled in staging!
    assert.equal(stagingServices.api, undefined)

    // Check getEnvironments has services attached from env_platform
    const envs = getEnvironments(db)
    assert.ok(envs.staging.services?.web)
    assert.equal(envs.staging.services?.web.url, "https://web.staging.example.com")

    // Deleting platform cascades to env_platform
    deletePlatform(db, "api")
    links = getEnvPlatforms(db)
    assert.equal(links.length, 2)
    assert.ok(!links.some((l) => l.platformId === "plat-api"))

    // Deleting environment cascades to env_platform
    deleteEnvironment(db, "dev")
    links = getEnvPlatforms(db)
    assert.equal(links.length, 1)
    assert.equal(links[0].envName, "staging")

    // Explicit deleteEnvPlatform
    deleteEnvPlatform(db, "staging", "plat-web")
    links = getEnvPlatforms(db)
    assert.equal(links.length, 0)

    db.close()
  })

  it("manages fixtures in the database", () => {
    const dbPath = join(dir, "fixtures-test.db")
    const db = openDatabase(dbPath)

    // Initially empty
    assert.deepEqual(getFixtures(db), {})

    // Save fixture
    saveFixture(db, "seed", {
      cmd: "pnpm run seed",
      cwd: "apps/backend",
    })

    let fixtures = getFixtures(db)
    assert.ok(fixtures.seed)
    assert.equal(fixtures.seed.cmd, "pnpm run seed")
    assert.equal(fixtures.seed.cwd, "apps/backend")

    // Update fixture
    saveFixture(db, "seed", {
      cmd: "pnpm run seed:v2",
    })
    fixtures = getFixtures(db)
    assert.equal(fixtures.seed.cmd, "pnpm run seed:v2")
    assert.equal(fixtures.seed.cwd, undefined)

    // Delete fixture
    deleteFixture(db, "seed")
    fixtures = getFixtures(db)
    assert.equal(fixtures.seed, undefined)

    db.close()
  })

  it("manages scenarios and steps in the database", () => {
    const dbPath = join(dir, "scenarios-test.db")
    const db = openDatabase(dbPath)

    // Initially empty
    assert.deepEqual(getScenarios(db), [])

    // Save scenario with multiple steps across drivers
    saveScenario(db, {
      id: "checkout-flow",
      name: "Checkout Flow",
      description: "Tests shopping cart to order completion",
      setup: ["reset-db", "seed-catalog"],
      vars: { itemId: "item-123" },
      steps: [
        {
          id: "step-1",
          name: "Add item to cart",
          target: "web",
          run: "cart/add",
          params: { id: "${ctx.itemId}" },
        },
        {
          id: "step-2",
          name: "Verify order status",
          target: "api",
          method: "GET",
          url: "/api/orders/1",
          assert: { status: 200, json_match: { status: "confirmed" } },
          extract: { orderId: "data.id" },
        },
        {
          id: "step-3",
          name: "Check device notification",
          target: "app",
          flow: "verify-notification.yaml",
          launch: "restart",
        },
      ],
    })

    const scenarios = getScenarios(db)
    assert.equal(scenarios.length, 1)
    const sc = scenarios[0]
    assert.equal(sc.id, "checkout-flow")
    assert.equal(sc.name, "Checkout Flow")
    assert.deepEqual(sc.setup, ["reset-db", "seed-catalog"])
    assert.equal(sc.vars?.itemId, "item-123")
    assert.equal(sc.steps.length, 3)

    // Verify step fields reconstruction
    const s1 = sc.steps[0]
    assert.equal(s1.name, "Add item to cart")
    assert.equal(s1.target, "web")
    assert.equal(s1.run, "cart/add")
    assert.deepEqual(s1.params, { id: "${ctx.itemId}" })

    const s2 = sc.steps[1]
    assert.equal(s2.name, "Verify order status")
    assert.equal(s2.target, "api")
    assert.equal(s2.method, "GET")
    assert.equal(s2.url, "/api/orders/1")
    assert.equal(s2.assert?.status, 200)
    assert.deepEqual(s2.assert?.json_match, { status: "confirmed" })
    assert.deepEqual(s2.extract, { orderId: "data.id" })

    // Query single scenario
    const single = getScenario(db, "checkout-flow")
    assert.ok(single)
    assert.equal(single.name, "Checkout Flow")
    assert.equal(single.steps.length, 3)

    // Delete scenario cascades to steps
    deleteScenario(db, "checkout-flow")
    assert.equal(getScenarios(db).length, 0)
    assert.equal(getScenario(db, "checkout-flow"), undefined)

    db.close()
  })

  it("manages runs and step_runs in the database", () => {
    const dbPath = join(dir, "runs-test.db")
    const db = openDatabase(dbPath)

    // Initially empty
    assert.deepEqual(getRuns(db), [])

    const runId = "2026-09-27T12-00-00-000Z"
    saveRun(db, {
      id: runId,
      environmentName: "staging",
      status: "RUNNING",
      totalScenarios: 2,
      passedScenarios: 0,
      failedScenarios: 0,
      startedAt: 1727438400000,
    })

    let runs = getRuns(db)
    assert.equal(runs.length, 1)
    assert.equal(runs[0].id, runId)
    assert.equal(runs[0].status, "RUNNING")
    assert.equal(runs[0].environmentName, "staging")

    // Record step runs
    saveStepRun(db, {
      id: `${runId}:login:0:1`,
      runId,
      stepId: "step-login",
      scenarioId: "login",
      iteration: 1,
      attempt: 1,
      status: "PASSED",
      durationMs: 145,
      statusCode: 200,
      resultData: { token: "abc" },
      createdAt: 1727438401000,
    })

    saveStepRun(db, {
      id: `${runId}:checkout:0:1`,
      runId,
      stepId: "step-checkout",
      scenarioId: "checkout",
      iteration: 1,
      attempt: 1,
      status: "FAILED",
      durationMs: 320,
      errorMessage: "Order timeout",
      artifactsPath: ".e2e/results/artifacts/run-1",
      createdAt: 1727438402000,
    })

    // Complete run
    saveRun(db, {
      id: runId,
      environmentName: "staging",
      status: "FAILED",
      totalScenarios: 2,
      passedScenarios: 1,
      failedScenarios: 1,
      durationMs: 465,
      startedAt: 1727438400000,
      completedAt: 1727438403000,
    })

    runs = getRuns(db)
    assert.equal(runs[0].status, "FAILED")
    assert.equal(runs[0].passedScenarios, 1)
    assert.equal(runs[0].failedScenarios, 1)

    // Query run with step runs
    const runDetails = getRun(db, runId)
    assert.ok(runDetails)
    assert.equal(runDetails.stepRuns.length, 2)
    assert.equal(runDetails.stepRuns[0].status, "PASSED")
    assert.equal(runDetails.stepRuns[1].status, "FAILED")
    assert.equal(runDetails.stepRuns[1].errorMessage, "Order timeout")

    // Query step runs by stepId
    const stepRuns = getStepRuns(db, { stepId: "step-checkout" })
    assert.equal(stepRuns.length, 1)
    assert.equal(stepRuns[0].errorMessage, "Order timeout")

    db.close()
  })

  it("manages step groups and reusable presets in the database", () => {
    const dbPath = join(dir, "step-groups.db")
    const db = openDatabase(dbPath)

    // Initially empty
    let groups = getStepGroups(db)
    assert.equal(groups.length, 0)

    // Save a step group
    saveStepGroup(db, {
      id: "preset-login",
      name: "Admin Web Login",
      description: "Navigates to login page and submits credentials",
      target: "web",
      steps: [
        { name: "Navigate to Login", target: "web", action: "navigate", url: "/admin/login" },
        { name: "Fill Email", target: "web", action: "fill", selector: "#email", value: "admin@example.com" },
        { name: "Fill Password", target: "web", action: "fill", selector: "#password", value: "secret123" },
        { name: "Click Submit", target: "web", action: "click", selector: "button[type='submit']" },
      ],
    })

    groups = getStepGroups(db)
    assert.equal(groups.length, 1)
    assert.equal(groups[0].id, "preset-login")
    assert.equal(groups[0].name, "Admin Web Login")
    assert.equal(groups[0].steps.length, 4)
    assert.equal(groups[0].steps[0].action, "navigate")
    assert.equal(groups[0].steps[1].selector, "#email")

    // Get specific group
    const group = getStepGroup(db, "preset-login")
    assert.ok(group)
    assert.equal(group.name, "Admin Web Login")

    // Delete step group
    deleteStepGroup(db, "preset-login")
    assert.equal(getStepGroups(db).length, 0)
    assert.equal(getStepGroup(db, "preset-login"), undefined)

    db.close()
  })

  it("manages composite step actions and reusable single-step presets in the database", () => {
    const dbPath = join(dir, "composite-presets.db")
    const db = openDatabase(dbPath)

    // 1. Scenario with composite actions
    saveScenario(db, {
      id: "web-checkout",
      name: "Web Checkout Scenario",
      steps: [
        {
          id: "step-auth",
          name: "Authenticate User",
          target: "web",
          actions: [
            { id: "act-1", action: "navigate", url: "/login" },
            { id: "act-2", action: "fill", selector: "#user", value: "alice" },
            { id: "act-3", action: "fill", selector: "#pass", value: "secret" },
            { id: "act-4", action: "click", selector: "button[type='submit']" },
          ],
        },
      ],
    })

    const scenarios = getScenarios(db)
    assert.equal(scenarios.length, 1)
    assert.equal(scenarios[0].steps.length, 1)
    const step = scenarios[0].steps[0]
    assert.equal(step.name, "Authenticate User")
    assert.equal(step.actions?.length, 4)
    assert.equal(step.actions[0].action, "navigate")
    assert.equal(step.actions[0].url, "/login")
    assert.equal(step.actions[1].action, "fill")
    assert.equal(step.actions[1].selector, "#user")
    assert.equal(step.actions[1].value, "alice")

    // 2. Step presets CRUD
    assert.equal(getStepPresets(db).length, 0)

    saveStepPreset(db, {
      id: "preset-web-login",
      name: "Admin Web Login Preset",
      description: "Standard admin login steps",
      target: "web",
      step: {
        name: "Admin Web Login",
        target: "web",
        actions: [
          { action: "navigate", url: "/admin/login" },
          { action: "fill", selector: "#admin-email", value: "admin@example.com" },
          { action: "click", selector: "#login-btn" },
        ],
      },
    })

    let presets = getStepPresets(db)
    assert.equal(presets.length, 1)
    assert.equal(presets[0].id, "preset-web-login")
    assert.equal(presets[0].name, "Admin Web Login Preset")
    assert.equal(presets[0].target, "web")
    assert.equal(presets[0].step.actions?.length, 3)
    assert.equal(presets[0].step.actions?.[0].action, "navigate")

    // Get specific preset
    const preset = getStepPreset(db, "preset-web-login")
    assert.ok(preset)
    assert.equal(preset.name, "Admin Web Login Preset")

    // Delete preset
    deleteStepPreset(db, "preset-web-login")
    presets = getStepPresets(db)
    assert.equal(presets.length, 0)
    assert.equal(getStepPreset(db, "preset-web-login"), undefined)

    db.close()
  })
})


