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
  getActiveEnvironment,
  getDefaultEnvironment,
  getEnvironments,
  getEnvPlatforms,
  getFixtures,
  getPlatforms,
  getPlatformsForEnv,
  openDatabase,
  type PlatformRecord,
  platformsToTargetsAndServices,
  resolveDbPath,
  saveEnvironment,
  saveEnvPlatform,
  saveFixture,
  savePlatform,
  setActiveEnvironment,
  setDefaultEnvironment,
  writeDbPointer,
} from "../src/db.ts"
import { tempDir } from "./temp-dir.ts"

describe("sqlite db configuration storage", () => {
  const dir = tempDir("db-test")

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
})

