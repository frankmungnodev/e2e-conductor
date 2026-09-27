import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, it } from "node:test"
import { loadConfig, resolveFromConfig } from "../src/config.ts"
import { openDatabase, saveEnvironment, saveEnvPlatform, savePlatform } from "../src/db.ts"
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
})
