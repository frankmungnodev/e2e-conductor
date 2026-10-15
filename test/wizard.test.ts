import assert from "node:assert/strict"
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase } from "../src/db/connection.ts"
import { validateScenario } from "../src/schema.ts"
import {
  detectWorkspace,
  saveWizardComponentsToDb,
  scaffoldWizardFiles,
  type WizardComponent,
} from "../src/wizard.ts"
import { tempDir } from "./temp-dir.ts"

function mockProject(): string {
  const dir = tempDir("wizard")
  mkdirSync(join(dir, "node_modules"))
  symlinkSync(resolve(import.meta.dirname, ".."), join(dir, "node_modules/e2e-conductor"), "dir")
  return dir
}

describe("wizard config generator", () => {
  it("sorts components by run order and saves to SQLite database", async () => {
    const components: WizardComponent[] = [
      {
        id: "comp-3",
        type: "android",
        name: "mobile_app",
        order: 3,
        appId: "com.example.mobile",
        flows: ".e2e/flows/mobile",
        installCmd: "./gradlew installDebug",
        reversePorts: [8080],
      },
      {
        id: "comp-1",
        type: "api",
        name: "backend_api",
        order: 1,
        url: "http://localhost:8080",
        health: "/healthz",
        startCmd: "pnpm dev",
      },
      {
        id: "comp-2",
        type: "web",
        name: "frontend_web",
        order: 2,
        service: "frontend_server",
        url: "http://localhost:5173",
        startCmd: "pnpm dev",
        modules: ".e2e/modules/web",
        slowMo: 100,
      },
    ]

    const dir = mockProject()
    const dbPath = join(dir, ".e2e", "e2e.db")
    const db = openDatabase(dbPath)

    saveWizardComponentsToDb(db, components, {
      defaultEnvironment: "dev",
      environments: {
        dev: {
          description: "Local dev baseline",
          url: "http://localhost:5173",
        },
        staging: {
          description: "Staging cluster",
          url: "https://staging.example.com",
        },
      },
    })
    db.close()

    // Test that the database loads with loadConfig
    const loaded = await loadConfig(dir)
    assert.ok(loaded.services?.backend_api)
    assert.ok(loaded.services?.frontend_server)
    assert.ok(loaded.targets.backend_api)
    assert.ok(loaded.targets.frontend_web)
    assert.ok(loaded.targets.mobile_app)
    assert.equal(loaded.defaultEnvironment, "dev")
    assert.ok(loaded.environments?.dev)
    assert.ok(loaded.environments?.staging)
  })

  it("scaffolds starter files under e2e-suite and generates a smoke scenario in run order", () => {
    const dir = mockProject()

    const components: WizardComponent[] = [
      {
        id: "api",
        type: "api",
        name: "core_api",
        order: 1,
        url: "http://localhost:3000",
        health: "/status",
      },
      {
        id: "web",
        type: "web",
        name: "admin_web",
        order: 2,
        modules: ".e2e/modules/admin",
      },
      {
        id: "mobile",
        type: "android",
        name: "driver_app",
        order: 3,
        appId: "com.example.driver",
        flows: ".e2e/flows/driver",
      },
    ]

    const res = scaffoldWizardFiles(dir, components)
    assert.deepEqual(res.created, ["e2e-suite/scenarios/smoke.json"], "steps are actions, with no module or flow files")

    // Verify smoke scenario steps follow the run order
    const smokeContent = JSON.parse(readFileSync(join(dir, "e2e-suite/scenarios/smoke.json"), "utf8"))
    assert.equal(smokeContent.steps.length, 3)
    assert.equal(smokeContent.steps[0].target, "core_api")
    assert.equal(smokeContent.steps[1].target, "admin_web")
    assert.equal(smokeContent.steps[2].target, "driver_app")
    assert.equal(smokeContent.steps[1].actions[0].action, "navigate")
    assert.equal(smokeContent.steps[2].launch, "fresh")
    assert.ok(validateScenario(smokeContent), "the starter scenario passes the schema")
    const schema = readFileSync(join(dir, "e2e-suite/scenarios", String(smokeContent.$schema)), "utf8")
    assert.ok(schema.includes("urn:e2e-conductor:scenario:v1"), "$schema resolves to the installed package")

    // Running again should skip existing files
    const res2 = scaffoldWizardFiles(dir, components)
    assert.equal(res2.created.length, 0)
    assert.equal(res2.skipped.length, 1)
  })

  it("detects projects in workspace directory", () => {
    const dir = tempDir("detect")
    mkdirSync(join(dir, "web-client"))
    writeFileSync(
      join(dir, "web-client/package.json"),
      JSON.stringify({ name: "web-client", dependencies: { react: "^19.0.0" }, scripts: { dev: "vite" } }),
    )

    mkdirSync(join(dir, "server-api"))
    writeFileSync(
      join(dir, "server-api/package.json"),
      JSON.stringify({ name: "server-api", dependencies: { express: "^4.0.0" }, scripts: { dev: "node index.js" } }),
    )

    mkdirSync(join(dir, "android-app/app"), { recursive: true })
    writeFileSync(
      join(dir, "android-app/build.gradle"),
      "// root gradle",
    )
    writeFileSync(
      join(dir, "android-app/app/build.gradle"),
      `android {
         defaultConfig {
           applicationId "com.test.app"
         }
       }`,
    )

    const detected = detectWorkspace(dir)
    assert.equal(detected.length, 3)

    const web = detected.find((d) => d.name === "web-client")
    const api = detected.find((d) => d.name === "server-api")
    const android = detected.find((d) => d.name === "android-app")

    assert.equal(web?.suggestedType, "web")
    assert.equal(api?.suggestedType, "api")
    assert.equal(android?.suggestedType, "android")
    assert.equal(android?.appId, "com.test.app")
  })
})
