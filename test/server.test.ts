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

      // 10. GET /api/config/code
      const codeRes = await fetch(`${url}/api/config/code`)
      assert.equal(codeRes.status, 200)
      const codeData = (await codeRes.json()) as any
      assert.equal(codeData.exists, false)

      // 11. POST /api/init
      const initRes = await fetch(`${url}/api/init`, { method: "POST" })
      assert.equal(initRes.status, 200)
      const initData = (await initRes.json()) as any
      assert.equal(initData.ok, true)

      // Verify code now exists
      const codeRes2 = await fetch(`${url}/api/config/code`)
      const codeData2 = (await codeRes2.json()) as any
      assert.equal(codeData2.exists, true)
      assert.ok(codeData2.content.includes("defineConfig"))

      // 12. POST /api/config/code
      const saveCodeRes = await fetch(`${url}/api/config/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `${codeData2.content}\n// test comment\n`,
        }),
      })
      assert.equal(saveCodeRes.status, 200)
      const saveCodeData = (await saveCodeRes.json()) as any
      assert.equal(saveCodeData.ok, true)
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }
  })
})
