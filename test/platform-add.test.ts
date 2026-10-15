import assert from "node:assert/strict"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { writeAgentKit } from "../src/agent-kit.ts"
import { loadConfig } from "../src/config.ts"
import { withDb } from "../src/db/connection.ts"
import { saveEnvironment } from "../src/db/environments.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { getPlatforms } from "../src/db/platforms.ts"
import { initProject } from "../src/init.ts"
import { addPlatform } from "../src/platform-add.ts"
import { tempDir } from "./temp-dir.ts"

/** A project straight after `e2e-conductor init`. */
function project(): string {
  const dir = tempDir("platform-add")
  initProject(dir)
  return dir
}

describe("e2e-conductor platform add", () => {
  it("adds a web platform that the active environment compiles into a target", async () => {
    const dir = project()
    const result = addPlatform({ cwd: dir, name: "web", type: "web", url: "http://localhost:8000" })
    assert.deepEqual(result.environments, ["dev"])
    const config = await loadConfig(dir)
    assert.equal(config.targets.web?.driver, "web")
    assert.equal(config.services?.web?.url, "http://localhost:8000")
  })

  it("finds the project from a folder inside it and links the platform to every environment", () => {
    const dir = project()
    withDb(resolveDbPath(dir), (db) => saveEnvironment(db, "staging", {}))
    const inside = join(dir, "app/src")
    mkdirSync(inside, { recursive: true })
    const result = addPlatform({ cwd: inside, name: "api", type: "api", url: "http://localhost:8000", health: "/up" })
    assert.deepEqual(result.environments.sort(), ["dev", "staging"])
    const [saved] = withDb(resolveDbPath(dir), (db) => getPlatforms(db))
    assert.equal(saved.health, "/up")
  })

  it("adds an android platform by package name, with the platforms it needs", async () => {
    const dir = project()
    addPlatform({ cwd: dir, name: "api", type: "api", url: "http://localhost:8000" })
    addPlatform({ cwd: dir, name: "mobile", type: "android", appId: "com.example.app", needs: "api" })
    const config = await loadConfig(dir)
    assert.equal(config.targets.mobile?.driver, "mobile")
  })

  it("refreshes an existing kit so the agent sees the new target", () => {
    const dir = project()
    writeAgentKit(dir)
    const result = addPlatform({ cwd: dir, name: "web", type: "web", url: "http://localhost:8000" })
    assert.equal(result.kitRefreshed, true)
    assert.ok(readFileSync(join(dir, "e2e-suite/agent/kit.md"), "utf8").includes("- `web` (web)"))
  })

  it("never changes an existing platform", () => {
    const dir = project()
    addPlatform({ cwd: dir, name: "web", type: "web", url: "http://localhost:8000" })
    assert.throws(() => addPlatform({ cwd: dir, name: "web", type: "web", url: "http://localhost:9999" }), /already exists/)
    const [saved] = withDb(resolveDbPath(dir), (db) => getPlatforms(db))
    assert.equal(saved.url, "http://localhost:8000")
  })

  it("rejects bad input before touching the database", () => {
    const dir = project()
    const add = (request: Partial<Parameters<typeof addPlatform>[0]>) => () => addPlatform({ cwd: dir, ...request })
    assert.throws(add({ type: "web", url: "http://localhost:8000" }), /Name the platform/)
    assert.throws(add({ name: "shell", type: "api", url: "http://localhost:8000" }), /built-in target/)
    assert.throws(add({ name: "my web", type: "web", url: "http://localhost:8000" }), /letters, digits/)
    assert.throws(add({ name: "web", type: "ios", url: "http://localhost:8000" }), /--type must be one of/)
    assert.throws(add({ name: "web", type: "web", url: "localhost:8000" }), /needs --url/)
    assert.throws(add({ name: "mobile", type: "android" }), /needs --app-id/)
    assert.throws(add({ name: "web", type: "web", url: "http://localhost:8000", needs: "api" }), /do not exist: api/)
    assert.deepEqual(
      withDb(resolveDbPath(dir), (db) => getPlatforms(db)),
      [],
    )
  })

  it("asks for init when there is no project", () => {
    assert.throws(() => addPlatform({ cwd: tempDir("platform-add-none"), name: "web", type: "web", url: "http://localhost:8000" }), /e2e-conductor init/)
  })
})
