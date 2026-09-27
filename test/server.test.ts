import assert from "node:assert/strict"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import type { LoadedConfig } from "../src/config.ts"
import { startServer } from "../src/server.ts"
import { tempDir } from "./temp-dir.ts"

function mockProject(): LoadedConfig {
  const dir = tempDir("server-test")
  mkdirSync(join(dir, "node_modules"), { recursive: true })
  symlinkSync(resolve(import.meta.dirname, ".."), join(dir, "node_modules/e2e-orchestrator"), "dir")
  mkdirSync(join(dir, "scenarios"), { recursive: true })
  mkdirSync(join(dir, "results"), { recursive: true })
  mkdirSync(join(dir, "flows"), { recursive: true })

  writeFileSync(
    join(dir, "scenarios", "test-scenario.json"),
    JSON.stringify({
      $schema: "../../schema/v1/scenario.schema.json",
      name: "Mock Test Scenario",
      steps: [{ name: "shell step", target: "shell", command: "echo test" }],
    }),
  )

  mkdirSync(join(dir, "web", "admin"), { recursive: true })
  mkdirSync(join(dir, "fixtures"), { recursive: true })
  writeFileSync(join(dir, "web", "admin", "login.ts"), "export default () => {}")
  writeFileSync(join(dir, "fixtures", "seed.ts"), "export const seed = () => {}")

  writeFileSync(join(dir, "flows", "test.yaml"), "- tap: Button\n")

  return {
    configDir: dir,
    env: {},
    scenarios: "scenarios",
    results: "results",
    services: {
      backend: { url: "http://localhost:5000", health: "/health" },
    },
    targets: {
      backend: { driver: "http", service: "backend" },
      web: { driver: "web", service: "backend", modules: "web" },
      mobile: { driver: "mobile", platform: "android", appId: "com.test", flows: "flows" },
    },
    fixtures: {},
  }
}

describe("startServer", () => {
  it("starts the server and serves API endpoints and static assets", async () => {
    const config = mockProject()
    const { server, url } = await startServer(config, { port: 0, host: "127.0.0.1", open: false })

    try {
      // 1. GET /api/config
      const cfgRes = await fetch(`${url}/api/config`)
      assert.equal(cfgRes.status, 200)
      const cfg = (await cfgRes.json()) as any
      assert.equal(cfg.services.backend.url, "http://localhost:5000")
      assert.ok(cfg.targets.mobile)

      // 2. GET /api/scenarios
      const scRes = await fetch(`${url}/api/scenarios`)
      assert.equal(scRes.status, 200)
      const scenarios = (await scRes.json()) as any[]
      assert.equal(scenarios.length, 1)
      assert.equal(scenarios[0].id, "test-scenario")
      assert.equal(scenarios[0].name, "Mock Test Scenario")
      assert.equal(scenarios[0].isValid, true)

      // 3. POST /api/scenarios
      const postScRes = await fetch(`${url}/api/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "created-scenario",
          content: {
            name: "Created Scenario",
            steps: [{ name: "run shell", target: "shell", command: "echo 'hello world'" }],
          },
        }),
      })
      assert.equal(postScRes.status, 200)
      const postResult = (await postScRes.json()) as any
      assert.equal(postResult.ok, true)
      assert.equal(postResult.id, "created-scenario")

      // Verify it exists in scenarios list
      const scRes2 = await fetch(`${url}/api/scenarios`)
      const scenarios2 = (await scRes2.json()) as any[]
      assert.equal(scenarios2.length, 2)

      // 4. DELETE /api/scenarios/:id
      const delRes = await fetch(`${url}/api/scenarios/created-scenario`, { method: "DELETE" })
      assert.equal(delRes.status, 200)

      // 5. GET /api/flows
      const flowRes = await fetch(`${url}/api/flows`)
      assert.equal(flowRes.status, 200)
      const flows = (await flowRes.json()) as any[]
      assert.equal(flows.length, 1)
      assert.equal(flows[0].file, "test.yaml")
      assert.equal(flows[0].target, "mobile")

      // 5b. GET /api/modules
      const modRes = await fetch(`${url}/api/modules`)
      assert.equal(modRes.status, 200)
      const modules = (await modRes.json()) as any[]
      assert.ok(modules.some((m) => m.name === "admin/login.ts" && m.category === "web"))
      assert.ok(modules.some((m) => m.name === "seed.ts" && m.category === "fixture"))

      // 5c. POST /api/modules (create new web module)
      const createModRes = await fetch(`${url}/api/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "web",
          target: "web",
          name: "admin/logout.ts",
          content: "export default defineWebStep(() => {})",
        }),
      })
      assert.equal(createModRes.status, 200)
      const createModData = (await createModRes.json()) as any
      assert.equal(createModData.ok, true)
      assert.equal(createModData.file.name, "admin/logout.ts")

      // 5d. POST /api/modules with path traversal is blocked
      const badPathRes = await fetch(`${url}/api/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "web",
          target: "web",
          name: "../../danger.ts",
          content: "evil",
        }),
      })
      assert.equal(badPathRes.status, 400)

      // 5e. DELETE /api/modules
      const delModRes = await fetch(`${url}/api/modules?category=web&target=web&name=admin/logout.ts`, {
        method: "DELETE",
      })
      assert.equal(delModRes.status, 200)
      const delModData = (await delModRes.json()) as any
      assert.equal(delModData.ok, true)

      // 6. GET /api/preflight
      const preflightRes = await fetch(`${url}/api/preflight`)
      assert.equal(preflightRes.status, 200)
      const preflight = (await preflightRes.json()) as any
      assert.ok(Array.isArray(preflight.services))
      assert.ok(preflight.services.some((s: any) => s.name === "backend"))

      // 7. GET /api/runs
      const runsRes = await fetch(`${url}/api/runs`)
      assert.equal(runsRes.status, 200)

      // 8. GET /api/run/status
      const statusRes = await fetch(`${url}/api/run/status`)
      assert.equal(statusRes.status, 200)
      const runStatus = (await statusRes.json()) as any
      assert.equal(runStatus.isRunning, false)

      // 9. GET / (serves HTML page)
      const indexRes = await fetch(`${url}/`)
      assert.equal(indexRes.status, 200)
      const html = await indexRes.text()
      assert.ok(html.includes("<!DOCTYPE html>"))

      // 9. GET /api/nonexistent returns 404
      const unknownRes = await fetch(`${url}/api/nonexistent`)
      assert.equal(unknownRes.status, 404)

      // 10. POST /api/init initializes project sqlite db under .e2e
      const initRes = await fetch(`${url}/api/init`, { method: "POST" })
      assert.equal(initRes.status, 200)
      const initData = (await initRes.json()) as any
      assert.equal(initData.ok, true)
      assert.ok(initData.created.some((p: string) => p.includes("e2e.db") || p.includes("smoke.json")))

      // 11. Verify dbExists is true in GET /api/config
      const postInitCfgRes = await fetch(`${url}/api/config`)
      const postInitCfg = (await postInitCfgRes.json()) as any
      assert.equal(postInitCfg.dbExists, true)
      assert.ok(postInitCfg.targets.api)

      // 12. GET /api/wizard/detect
      const detectRes = await fetch(`${url}/api/wizard/detect`)
      assert.equal(detectRes.status, 200)
      const detectData = (await detectRes.json()) as any
      assert.ok(Array.isArray(detectData.detected))

      // 14. POST /api/wizard/apply
      const wizardRes = await fetch(`${url}/api/wizard/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          components: [
            {
              id: "comp-api",
              type: "api",
              name: "server_api",
              order: 1,
              url: "http://localhost:4000",
              startCmd: "node index.js",
            },
            {
              id: "comp-web",
              type: "web",
              name: "frontend_app",
              order: 2,
              modules: "web",
            },
          ],
          scaffoldFiles: true,
        }),
      })
      assert.equal(wizardRes.status, 200)
      const wizardData = (await wizardRes.json()) as any
      assert.equal(wizardData.ok, true)
      assert.ok(wizardData.created.length > 0)

      // 15. POST /api/config/fixture
      const addFixtureRes = await fetch(`${url}/api/config/fixture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "db:seed",
          cmd: "echo 'seeding db ok'",
        }),
      })
      assert.equal(addFixtureRes.status, 200)
      const addFixtureData = (await addFixtureRes.json()) as any
      assert.equal(addFixtureData.ok, true)
      assert.ok(addFixtureData.fixtures.includes("db:seed"))

      // 16. POST /api/fixtures/run
      const runFixtureRes = await fetch(`${url}/api/fixtures/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "db:seed" }),
      })
      assert.equal(runFixtureRes.status, 200)
      const runFixtureData = (await runFixtureRes.json()) as any
      assert.equal(runFixtureData.ok, true)
      assert.equal(runFixtureData.exitCode, 0)
      assert.ok(runFixtureData.output.includes("seeding db ok"))

      // 17. DELETE /api/config/fixture
      const delFixtureRes = await fetch(`${url}/api/config/fixture?name=db:seed`, {
        method: "DELETE",
      })
      assert.equal(delFixtureRes.status, 200)
      const delFixtureData = (await delFixtureRes.json()) as any
      assert.equal(delFixtureData.ok, true)
      assert.ok(!delFixtureData.fixtures.includes("db:seed"))

      // 18. POST /api/config/environment (save staging environment)
      const addEnvRes = await fetch(`${url}/api/config/environment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "staging",
          url: "https://staging.example.com",
          description: "Staging cluster",
          env: { APP_ENV: "staging" },
        }),
      })
      assert.equal(addEnvRes.status, 200)
      const addEnvData = (await addEnvRes.json()) as any
      assert.equal(addEnvData.ok, true)
      assert.ok(addEnvData.environments.staging)

      // 19. POST /api/config/environment/active
      const activeEnvRes = await fetch(`${url}/api/config/environment/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "staging" }),
      })
      assert.equal(activeEnvRes.status, 200)
      const activeEnvData = (await activeEnvRes.json()) as any
      assert.equal(activeEnvData.ok, true)
      assert.equal(activeEnvData.activeEnvironment, "staging")

      // 20. DELETE /api/config/environment
      const delEnvRes = await fetch(`${url}/api/config/environment?name=staging`, {
        method: "DELETE",
      })
      assert.equal(delEnvRes.status, 200)
      const delEnvData = (await delEnvRes.json()) as any
      assert.equal(delEnvData.ok, true)
      assert.ok(!delEnvData.environments.staging)

      // 21. Verify SQLite db fields in GET /api/config
      const cfgWithDbRes = await fetch(`${url}/api/config`)
      assert.equal(cfgWithDbRes.status, 200)
      const cfgWithDb = (await cfgWithDbRes.json()) as any
      assert.equal(typeof cfgWithDb.dbExists, "boolean")
      assert.equal(typeof cfgWithDb.dbPath, "string")
      assert.equal(typeof cfgWithDb.hasEnvironments, "boolean")

      // 22. POST /api/config/platform
      const addPlatformRes = await fetch(`${url}/api/config/platform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "web_admin",
          type: "web",
          url: "http://localhost:8080",
          startCmd: "pnpm start",
        }),
      })
      assert.equal(addPlatformRes.status, 200)
      const addPlatformData = (await addPlatformRes.json()) as any
      assert.equal(addPlatformData.ok, true)
      assert.ok(addPlatformData.targets.web_admin)
      assert.equal(addPlatformData.targets.web_admin.driver, "web")

      // 23. DELETE /api/config/platform
      const delPlatformRes = await fetch(`${url}/api/config/platform?name=web_admin`, {
        method: "DELETE",
      })
      assert.equal(delPlatformRes.status, 200)
      const delPlatformData = (await delPlatformRes.json()) as any
      assert.equal(delPlatformData.ok, true)
      assert.ok(!delPlatformData.targets.web_admin)
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }
  })
})
