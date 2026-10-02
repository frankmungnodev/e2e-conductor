import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { eventually, FIXTURE_NAME, SHELL_OUTPUT, startUiSession } from "./helpers.ts"

type ConfigSummary = { activeEnvironment?: string; fixtures: string[] }

describe("Config view", () => {
  it("switches the active environment", async () => {
    const { url, page, api } = await startUiSession("config-env")
    await page.goto(`${url}/?tab=config&sub=environments`)
    await page.getByRole("button", { name: "Staging Staging" }).click()
    await page.getByRole("button", { name: "Set as Active Target" }).click()
    await eventually(
      () => api<ConfigSummary>("/api/config"),
      (cfg) => cfg.activeEnvironment === "staging",
    )
    await page.getByRole("heading", { name: "Staging Profile" }).waitFor()
  })

  it("test-runs an existing fixture and adds a new one", async () => {
    const { url, page, api } = await startUiSession("config-fixtures")
    await page.goto(`${url}/?tab=config&sub=fixtures`)

    // Test-run the seeded fixture while it is the only one listed.
    await page.getByRole("button", { name: "Run Test" }).click()
    const output = page.getByRole("dialog")
    await output.getByRole("heading", { name: `Fixture Test: ${FIXTURE_NAME}` }).waitFor()
    await output.getByText("Passed").waitFor()
    await output.getByText(SHELL_OUTPUT).first().waitFor()
    await output.getByRole("button", { name: "Close" }).first().click()

    await page.getByRole("button", { name: "Add Fixture" }).click()
    const modal = page.getByRole("dialog")
    await modal.getByRole("textbox", { name: "e.g. db:seed" }).fill("ui-smoke-fixture")
    await modal.getByRole("textbox", { name: "e.g. pnpm run db:seed" }).fill("echo added")
    await modal.getByRole("button", { name: "Save Fixture" }).click()
    const cfg = await eventually(
      () => api<ConfigSummary>("/api/config"),
      (c) => c.fixtures.includes("ui-smoke-fixture"),
    )
    assert.ok(cfg.fixtures.includes(FIXTURE_NAME))

  })
})
