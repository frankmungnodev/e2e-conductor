import assert from "node:assert/strict"
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import {
  detectWorkspace,
  generateConfigCode,
  scaffoldWizardFiles,
  type WizardComponent,
} from "../src/wizard.ts"
import { tempDir } from "./temp-dir.ts"

function mockProject(): string {
  const dir = tempDir("wizard")
  mkdirSync(join(dir, "node_modules"))
  symlinkSync(resolve(import.meta.dirname, ".."), join(dir, "node_modules/e2e-orchestrator"), "dir")
  return dir
}

describe("wizard config generator", () => {
  it("sorts components by run order and generates valid TypeScript config", async () => {
    const components: WizardComponent[] = [
      {
        id: "comp-3",
        type: "android",
        name: "mobile_app",
        order: 3,
        appId: "com.example.mobile",
        flows: "e2e/flows/mobile",
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
        modules: "e2e/modules/web",
        slowMo: 100,
      },
    ]

    const code = generateConfigCode(components)

    // Check run order in the output: backend_api before frontend_server/frontend_web, before mobile_app
    const backendIdx = code.indexOf("backend_api:")
    const frontendIdx = code.indexOf("frontend_web:")
    const mobileIdx = code.indexOf("mobile_app:")

    assert.ok(backendIdx < frontendIdx, "Backend API should appear before frontend web in run order")
    assert.ok(frontendIdx < mobileIdx, "Frontend web should appear before mobile in run order")

    // Test that the generated code actually compiles and loads with loadConfig
    const dir = mockProject()
    const configPath = join(dir, "e2e.config.ts")
    writeFileSync(configPath, code, "utf8")

    const loaded = await loadConfig(configPath)
    assert.ok(loaded.services?.backend_api)
    assert.ok(loaded.services?.frontend_server)
    assert.ok(loaded.targets.backend_api)
    assert.ok(loaded.targets.frontend_web)
    assert.ok(loaded.targets.mobile_app)
  })

  it("scaffolds starter files and generates a smoke scenario in run order", () => {
    const dir = mockProject()
    const configPath = join(dir, "e2e.config.ts")

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
        modules: "e2e/modules/admin",
      },
      {
        id: "mobile",
        type: "android",
        name: "driver_app",
        order: 3,
        appId: "com.example.driver",
        flows: "e2e/flows/driver",
      },
    ]

    const res = scaffoldWizardFiles(configPath, components)
    assert.ok(res.created.includes("e2e/scenarios/smoke.json"))
    assert.ok(res.created.includes("e2e/modules/admin/sample_step.ts"))
    assert.ok(res.created.includes("e2e/flows/driver/smoke.yaml"))

    // Verify smoke scenario steps follow the run order
    const smokeContent = JSON.parse(readFileSync(join(dir, "e2e/scenarios/smoke.json"), "utf8"))
    assert.equal(smokeContent.steps.length, 3)
    assert.equal(smokeContent.steps[0].target, "core_api")
    assert.equal(smokeContent.steps[1].target, "admin_web")
    assert.equal(smokeContent.steps[2].target, "driver_app")

    // Running again should skip existing files
    const res2 = scaffoldWizardFiles(configPath, components)
    assert.equal(res2.created.length, 0)
    assert.equal(res2.skipped.length, 3)
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
