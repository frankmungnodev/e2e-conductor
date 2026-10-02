import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import { eventually, startUiSession } from "./helpers.ts"

type ConfigSummary = { targets: Record<string, { driver: string }> }
type EnvPlatforms = { envPlatforms: Array<{ envName: string; platformId: string; url?: string | null }> }

async function openAddPlatform(page: Page, url: string) {
  await page.goto(`${url}/?tab=config&sub=platforms`)
  await page.getByRole("button", { name: "Add Platform" }).first().click()
  return page.getByRole("dialog")
}

describe("Platform modal", () => {
  it("adds a web, an Android, and a REST API platform", async () => {
    const { url, page, api } = await startUiSession("platform-add")

    let modal = await openAddPlatform(page, url)
    await modal.getByRole("button", { name: /^Web / }).click()
    await modal.getByRole("textbox", { name: "e.g. web" }).fill("site")
    await modal.getByRole("button", { name: "Add Platform" }).click()
    await eventually(() => api<ConfigSummary>("/api/config"), (c) => c.targets.site?.driver === "web")

    modal = await openAddPlatform(page, url)
    await modal.getByRole("button", { name: /^Android / }).click()
    const androidName = modal.getByRole("textbox").first()
    await androidName.fill("phone")
    await modal.getByRole("button", { name: "Add Platform" }).click()
    await eventually(() => api<ConfigSummary>("/api/config"), (c) => c.targets.phone?.driver === "mobile")

    modal = await openAddPlatform(page, url)
    await modal.getByRole("button", { name: /^REST API / }).click()
    await modal.getByRole("textbox").first().fill("backend")
    await modal.getByRole("button", { name: "Add Platform" }).click()
    await eventually(() => api<ConfigSummary>("/api/config"), (c) => c.targets.backend?.driver === "http")
  })

  it("saves an environment override for an existing platform", async () => {
    const { url, page, api } = await startUiSession("platform-override")
    await page.goto(`${url}/?tab=config&sub=platforms`)
    await page.getByRole("button", { name: "Overrides (Dev)" }).click()
    const modal = page.getByRole("dialog")
    await modal.getByRole("textbox", { name: "e.g. http://localhost:5173" }).fill("http://localhost:6100")
    await modal.getByRole("button", { name: "Save Overrides" }).click()
    const records = await eventually(
      () => api<EnvPlatforms>("/api/config/env-platforms"),
      (data) => data.envPlatforms.some((r) => r.envName === "dev" && r.url === "http://localhost:6100"),
    )
    assert.ok(records.envPlatforms.length > 0)
    await page.reload()
    await page.getByText("http://localhost:6100").first().waitFor()
  })
})
