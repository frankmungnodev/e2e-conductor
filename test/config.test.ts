import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { loadConfig, resolveFromConfig, servicesNeeded } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { saveEnvPlatform } from "../src/db/env-platforms.ts"
import { saveEnvironment } from "../src/db/environments.ts"
import { savePlatform } from "../src/db/platforms.ts"
import { tempDir } from "./temp-dir.ts"

const dir = tempDir("config")

describe("loadConfig", () => {
  it("loads config from sqlite db, merges env and remembers project folder", async () => {
    process.env.E2E_TEST_FROM_PROCESS = "process"
    const projectDir = join(dir, "proj-1")
    const dbPath = join(projectDir, ".e2e", "e2e.db")
    const db = openDatabase(dbPath)

    saveEnvironment(db, "main", {
      description: "Development",
      url: "http://localhost:4000",
      env: { FROM_CONFIG: "config", E2E_TEST_FROM_PROCESS: "config" },
      scenarios: ".e2e/scenarios",
      results: ".e2e/results",
    })

    savePlatform(db, {
      id: "plat-api",
      name: "api",
      type: "api",
      url: "http://localhost:4000",
    })

    db.close()

    const config = await loadConfig(projectDir)
    assert.equal(config.configDir, projectDir)
    assert.equal(config.env.FROM_CONFIG, "config")
    assert.equal(config.env.E2E_TEST_FROM_PROCESS, "process", "process env wins")
    assert.equal(resolveFromConfig(config, config.scenarios), join(projectDir, ".e2e", "scenarios"))
    assert.ok(config.targets.api)
    assert.equal(config.targets.api.driver, "http")
  })

  it("fails when the database is missing", async () => {
    await assert.rejects(loadConfig(join(dir, "missing")), /Database not found/)
  })

  it("reserves the shell target name", async () => {
    const projectDir = join(dir, "proj-shell")
    const dbPath = join(projectDir, ".e2e", "e2e.db")
    const db = openDatabase(dbPath)

    saveEnvironment(db, "main", { description: "Main" })
    savePlatform(db, {
      id: "plat-shell",
      name: "shell",
      type: "web",
      url: "http://localhost:3000",
    })
    db.close()

    await assert.rejects(loadConfig(projectDir), /Target name "shell" is reserved/)
  })

  it("applies environment overrides for base URL, services and env variables", async () => {
    const projectDir = join(dir, "proj-multi")
    const dbPath = join(projectDir, ".e2e", "e2e.db")
    const db = openDatabase(dbPath)

    saveEnvironment(db, "main", {
      description: "Local dev",
      url: "http://localhost:5173",
      env: { APP_ENV: "main" },
    })

    saveEnvironment(db, "staging", {
      description: "Staging cluster",
      url: "https://staging.example.com",
      env: { APP_ENV: "staging" },
    })

    savePlatform(db, {
      id: "plat-web",
      name: "web",
      type: "web",
      url: "http://localhost:5173",
      headless: false,
    })

    saveEnvPlatform(db, {
      envName: "staging",
      platformId: "plat-web",
      enabled: true,
      url: "https://staging.example.com",
      headless: true,
    })

    db.close()

    const mainConfig = await loadConfig(projectDir)
    assert.equal(mainConfig.activeEnvironment, "main")
    assert.equal(mainConfig.services?.web.url, "http://localhost:5173")
    assert.equal(mainConfig.env.APP_ENV, "main")

    const stagingConfig = await loadConfig(projectDir, "staging")
    assert.equal(stagingConfig.activeEnvironment, "staging")
    assert.equal(stagingConfig.services?.web.url, "https://staging.example.com")
    assert.equal(stagingConfig.env.APP_ENV, "staging")
  })

  it("takes a service's URL from its platform, not the environment URL, and follows platform edits", async () => {
    const projectDir = join(dir, "proj-platform-edit")
    const db = openDatabase(join(projectDir, ".e2e", "e2e.db"))
    saveEnvironment(db, "dev", { url: "http://localhost:3000" })
    const api = { id: "plat-api", name: "api", type: "api" as const, url: "http://localhost:3000", health: "/" }
    savePlatform(db, api)
    savePlatform(db, { ...api, url: "http://localhost:8787", health: "/health" })
    db.close()

    const config = await loadConfig(projectDir)
    assert.equal(config.services?.api.url, "http://localhost:8787")
    assert.equal(config.services?.api.health, "/health")
  })

  it("clears link values an older version copied from the platform, so platform edits reach them", async () => {
    const projectDir = join(dir, "proj-copied-link")
    const dbPath = join(projectDir, ".e2e", "e2e.db")
    const db = openDatabase(dbPath)
    saveEnvironment(db, "dev", {})
    savePlatform(db, { id: "plat-api", name: "api", type: "api", url: "http://localhost:3000", health: "/" })
    db.prepare("UPDATE env_platform SET url = 'http://localhost:3000', health = '/', headless = 0").run()
    db.close()

    const reopened = openDatabase(dbPath)
    const link = reopened.prepare("SELECT url, health, headless FROM env_platform").get() as Record<string, unknown>
    assert.deepEqual({ ...link }, { url: null, health: null, headless: null })
    reopened.prepare("UPDATE platforms SET url = 'http://localhost:8787'").run()
    reopened.close()

    assert.equal((await loadConfig(projectDir)).services?.api.url, "http://localhost:8787")
  })
})

describe("target needs", () => {
  const dir = tempDir("e2e-config-needs-")

  it("prepares the services of needed targets, transitively, and rejects an unknown one", async () => {
    const projectDir = join(dir, "proj")
    const db = openDatabase(join(projectDir, ".e2e", "e2e.db"))
    saveEnvironment(db, "dev", {})
    savePlatform(db, { id: "p-db", name: "db", type: "api", url: "http://localhost:5432" })
    savePlatform(db, { id: "p-api", name: "api", type: "api", url: "http://localhost:8787", serviceName: "backend", needs: ["db"] })
    savePlatform(db, { id: "p-web", name: "admin", type: "web", url: "http://localhost:3000", needs: ["api"] })
    savePlatform(db, { id: "p-app", name: "app", type: "android", appId: "com.example", needs: ["api"] })
    db.close()

    const config = await loadConfig(projectDir)
    assert.deepEqual([...servicesNeeded(config, ["admin"])].sort(), ["admin", "backend", "db"])
    assert.deepEqual([...servicesNeeded(config, ["app"])].sort(), ["backend", "db"])

    const broken = openDatabase(join(projectDir, ".e2e", "e2e.db"))
    savePlatform(broken, { id: "p-web", name: "admin", type: "web", url: "http://localhost:3000", needs: ["nope"] })
    broken.close()
    await assert.rejects(loadConfig(projectDir), /Target "admin" needs unknown target "nope"/)
  })
})
