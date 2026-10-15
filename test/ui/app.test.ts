import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { startUiSession } from "./helpers.ts"

describe("UI harness", () => {
  it("serves the built app against a seeded project", async () => {
    const { url, page } = await startUiSession("app")
    await page.goto(url)
    await page.getByText("e2e-conductor").first().waitFor()
    assert.ok(await page.title())
  })
})
