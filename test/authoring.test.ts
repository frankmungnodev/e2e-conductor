import assert from "node:assert/strict"
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { openDatabase, saveEnvironment, saveFixture, savePlatform } from "../src/db.ts"
import { startServer } from "../src/server.ts"
import { tempDir } from "./temp-dir.ts"

function setupProject(dir: string) {
  mkdirSync(join(dir, "scenarios"), { recursive: true })
  mkdirSync(join(dir, "flows"), { recursive: true })
  mkdirSync(join(dir, "web", "admin"), { recursive: true })
  mkdirSync(join(dir, "fixtures"), { recursive: true })

  // Link e2e-orchestrator in node_modules so imports resolve
  mkdirSync(join(dir, "node_modules"), { recursive: true })
  const pkgRoot = resolve(import.meta.dirname, "..")
  symlinkSync(pkgRoot, join(dir, "node_modules", "e2e-orchestrator"), "junction")

  // SQLite configuration in .e2e/e2e.db
  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  saveEnvironment(db, "dev", {
    description: "Development baseline",
    scenarios: "scenarios",
    results: "results",
  })
  savePlatform(db, {
    id: "plat-api",
    name: "api",
    type: "api",
    url: "http://localhost:3000",
    health: "/health",
    serviceName: "backend",
  })
  savePlatform(db, {
    id: "plat-admin",
    name: "admin",
    type: "web",
    url: "http://localhost:5173",
    modules: "./web",
    serviceName: "web",
  })
  savePlatform(db, {
    id: "plat-app",
    name: "app",
    type: "android",
    appId: "com.example",
    flows: "./flows",
  })
  saveFixture(db, "reset-db", { cmd: "node -e 'console.log()'" })
  saveFixture(db, "seed-admin", { cmd: "node -e 'console.log()'" })
  db.close()

  // Seed scenario
  writeFileSync(
    join(dir, "scenarios", "01-smoke.json"),
    JSON.stringify(
      {
        $schema: "../../schema/v1/scenario.schema.json",
        name: "Smoke Test",
        setup: ["reset-db"],
        vars: { testVar: "init" },
        steps: [
          {
            name: "Check health",
            target: "api",
            method: "GET",
            url: "/health",
            assert: { status: 200, json_match: { ok: true } },
            extract: { statusVal: "ok" },
          },
        ],
      },
      null,
      2,
    ),
  )

  // Web step
  writeFileSync(
    join(dir, "web", "admin", "login.ts"),
    `import { defineWebStep } from "e2e-orchestrator"
export default defineWebStep(async ({ page }) => {
  return { status: "logged-in" }
})
`,
  )

  // Fixture script
  writeFileSync(
    join(dir, "fixtures", "database.ts"),
    `import type { FixtureFn } from "e2e-orchestrator"
export const resetDb: FixtureFn = async () => {}
`,
  )

  // Mobile flow
  writeFileSync(join(dir, "flows", "test.yaml"), "- tapOn: Continue\n")
}

describe("Full Test Suite Authoring via API", () => {
  it("creates, modifies, and validates complete scenarios", async () => {
    const dir = tempDir("authoring")
    setupProject(dir)

    const config = await loadConfig(dir)
    const { server, url } = await startServer(config, { port: 0, host: "127.0.0.1", open: false })

    try {
      // 1. Check existing project metadata
      const cfgRes = await fetch(`${url}/api/config`)
      assert.equal(cfgRes.status, 200)
      const cfg = (await cfgRes.json()) as any
      assert.deepEqual(cfg.fixtures, ["reset-db", "seed-admin"])
      assert.ok(cfg.targets.admin)

      // 2. Read scenarios and verify loaded data
      const scRes = await fetch(`${url}/api/scenarios`)
      assert.equal(scRes.status, 200)
      const scenarios = (await scRes.json()) as any[]
      assert.equal(scenarios.length, 1)
      assert.deepEqual(scenarios[0].setup, ["reset-db"])
      assert.equal(scenarios[0].vars.testVar, "init")

      // 3. Create a comprehensive new scenario (like Zomilabu scenarios)
      const newScenario = {
        $schema: "../../schema/v1/scenario.schema.json",
        name: "Admin publish and mobile sync",
        setup: ["reset-db", "seed-admin"],
        vars: { songTitle: "New Praise Song", releaseVersion: "v1.2.0" },
        steps: [
          {
            name: "Admin logs in",
            target: "admin",
            run: "admin/login",
            params: { user: "admin@example.com" },
          },
          {
            name: "API creates song",
            target: "api",
            method: "POST",
            url: "/api/songs",
            headers: { "Content-Type": "application/json" },
            body: { title: "${ctx.songTitle}" },
            assert: {
              status: 201,
              json_match: { "data.id": { $exists: true }, "data.title": "${ctx.songTitle}" },
            },
            extract: { songId: "data.id" },
          },
          {
            name: "Mobile app syncs",
            target: "app",
            flow: "test.yaml",
            launch: "fresh",
          },
        ],
      }

      const saveScRes = await fetch(`${url}/api/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "02-admin-publish", content: newScenario }),
      })
      assert.equal(saveScRes.status, 200)
      const saveScData = (await saveScRes.json()) as any
      assert.equal(saveScData.ok, true)
      assert.equal(saveScData.isValid, true)

      // 4. Verify file exists on disk and is re-read correctly
      const reloadedRes = await fetch(`${url}/api/scenarios`)
      const reloadedScenarios = (await reloadedRes.json()) as any[]
      assert.equal(reloadedScenarios.length, 2)
      const created = reloadedScenarios.find((s) => s.id === "02-admin-publish")
      assert.ok(created)
      assert.deepEqual(created.setup, ["reset-db", "seed-admin"])
      assert.equal(created.vars.songTitle, "New Praise Song")
      assert.equal(created.steps.length, 3)

      // 8. Delete scenario
      const delScRes = await fetch(`${url}/api/scenarios/02-admin-publish`, { method: "DELETE" })
      assert.equal(delScRes.status, 200)
      assert.equal(existsSync(join(dir, "scenarios", "02-admin-publish.json")), false)
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }
  })
})
