import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import { eventually, FIXTURE_NAME, PRESET_NAME, SHELL_OUTPUT, SHELL_SCENARIO_ID, SHELL_SCENARIO_NAME, startUiSession } from "./helpers.ts"

type ConfigSummary = {
  activeEnvironment?: string
  fixtures: string[]
  fixturesMap: Record<string, { cmd: string; cwd?: string }>
}

/** The open dialog with this heading; another dialog may still be animating closed. */
function dialogTitled(page: Page, title: string) {
  return page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: title, exact: true }) })
}

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

describe("Config view fixtures", () => {
  it("edits and then removes a fixture", async () => {
    const { url, page, api } = await startUiSession("config-fixture-edit")
    await page.goto(`${url}/?tab=config&sub=fixtures`)

    await page.getByRole("button", { name: "Edit" }).click()
    const edit = dialogTitled(page, "Edit Fixture")
    await edit.getByRole("textbox", { name: "e.g. pnpm run db:seed" }).fill("echo edited")
    await edit.getByRole("textbox", { name: "e.g. apps/backend (defaults to project root)" }).fill("scenarios")
    await edit.getByRole("button", { name: "Save Fixture" }).click()
    await eventually(
      () => api<ConfigSummary>("/api/config"),
      (c) => c.fixturesMap[FIXTURE_NAME]?.cmd === "echo edited" && c.fixturesMap[FIXTURE_NAME]?.cwd === "scenarios",
    )

    await page.getByRole("button", { name: "Delete" }).click()
    await dialogTitled(page, "Remove Fixture").getByRole("button", { name: "Remove Fixture" }).click()
    await eventually(
      () => api<ConfigSummary>("/api/config"),
      (c) => !c.fixtures.includes(FIXTURE_NAME),
    )
  })
})

describe("Config view database tab", () => {
  it("shows the database location and stored record counts", async () => {
    const { url, page } = await startUiSession("config-database")
    await page.goto(`${url}/?tab=config&sub=database`)
    // Scope to the page body: the header also shows connection status.
    const main = page.getByRole("main")
    await main.getByRole("heading", { name: "SQLite Database & Storage" }).waitFor()
    await main.getByText("Ready", { exact: true }).waitFor()
    // The innermost block holding a label also holds its value.
    const tile = (label: string) => main.locator("div").filter({ has: page.getByText(label, { exact: true }) }).last()
    assert.match(await tile("Database File:").innerText(), /\.e2e\/e2e\.db/)
    // Seeded with dev and staging environments and one platform.
    assert.match(await tile("Stored Environments").innerText(), /\b2\b/)
    assert.match(await tile("Stored Platforms").innerText(), /\b1\b/)
    assert.match(await tile("Active Profile").innerText(), /Dev/)
  })

  it("exports scenarios and presets to JSON files", async () => {
    const { url, page, projectDir } = await startUiSession("config-export")
    const presetFile = join(projectDir, "e2e-suite", "presets", "print-marker.json")
    assert.equal(existsSync(presetFile), false)

    await page.goto(`${url}/?tab=config&sub=database`)
    await page.getByRole("button", { name: "Export to JSON" }).click()
    await page.getByText("Exported 1 scenario and 1 preset to JSON files").waitFor()

    assert.equal(JSON.parse(readFileSync(presetFile, "utf8")).name, PRESET_NAME)
    const scenario = JSON.parse(readFileSync(join(projectDir, "scenarios", `${SHELL_SCENARIO_ID}.json`), "utf8"))
    assert.equal(scenario.name, SHELL_SCENARIO_NAME)
  })
})
