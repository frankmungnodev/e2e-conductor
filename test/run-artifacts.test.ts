import assert from "node:assert/strict"
import { mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { loadConfig } from "../src/config.ts"
import { startServer } from "../src/server.ts"
import { project } from "./runner-project.ts"

type Details = { scenarios: Record<string, Array<{ name: string; url: string }>> }

describe("run artifact URLs", () => {
  it("change when a file is rewritten, so a retaken step screenshot is not served from cache", async () => {
    const dir = project([])
    const scenarioDir = join(dir, "results", "artifacts", "run-1", "flow")
    mkdirSync(scenarioDir, { recursive: true })
    const shot = join(scenarioDir, "step-1.png")
    writeFileSync(shot, "failed screen")
    utimesSync(shot, new Date(1_000_000), new Date(1_000_000))

    const { server, url } = await startServer(await loadConfig(dir), { port: 0, host: "127.0.0.1", open: false })
    try {
      const imageUrl = async () => {
        const details = (await (await fetch(`${url}/api/runs/run-1`)).json()) as Details
        return details.scenarios.flow.find((file) => file.name === "step-1.png")?.url ?? ""
      }
      const before = await imageUrl()
      writeFileSync(shot, "fixed screen")
      utimesSync(shot, new Date(2_000_000), new Date(2_000_000))
      const after = await imageUrl()

      assert.notEqual(after, before)
      assert.equal(await (await fetch(`${url}${after}`)).text(), "fixed screen")
    } finally {
      server.close()
    }
  })
})
