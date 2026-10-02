import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import { eventually, PRESET_NAME, startUiSession } from "./helpers.ts"

/** The open dialog with this heading; another dialog may still be animating closed. */
function dialogTitled(page: Page, title: string) {
  return page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: title, exact: true }) })
}

type ScenarioSummary = { id: string; name: string; steps: Array<{ name: string; target: string }> }

describe("Scenario builder", () => {
  it("creates, renames, and adds steps from a driver and a preset, and the scenario persists", async () => {
    const { url, page, api } = await startUiSession("scenario-builder")
    await page.goto(`${url}/?tab=scenarios`)
    const before = await api<ScenarioSummary[]>("/api/scenarios")

    await page.getByRole("button", { name: "New Scenario" }).click()
    const created = await eventually(
      () => api<ScenarioSummary[]>("/api/scenarios"),
      (list) => list.length === before.length + 1,
    )
    const id = created.find((s) => !before.some((b) => b.id === s.id))?.id
    assert.ok(id, "new scenario was saved")

    await page.getByRole("button", { name: "Scenario Settings & Fixtures" }).click()
    const settings = dialogTitled(page, "Scenario Settings & Fixtures")
    await settings.getByRole("textbox", { name: "Scenario Name" }).fill("UI Smoke Scenario")
    await settings.getByRole("button", { name: "Done" }).click()
    await settings.waitFor({ state: "detached" })

    await page.getByRole("button", { name: "Add Step" }).first().click()
    const addStep = dialogTitled(page, "Add Step")
    // Driver cards list Web, HTTP, Shell, Mobile in that order; the third is Shell.
    await addStep.getByRole("button", { name: "Add Step" }).nth(2).click()
    await addStep.waitFor({ state: "detached" })

    await page.getByRole("button", { name: "Add Step" }).first().click()
    const addPreset = dialogTitled(page, "Add Step")
    await addPreset.getByRole("button", { name: /^Presets/ }).click()
    await addPreset.getByRole("button", { name: "Insert" }).click()

    const saved = await eventually(
      () => api<ScenarioSummary[]>("/api/scenarios"),
      (list) => {
        const s = list.find((x) => x.id === id)
        return s?.name === "UI Smoke Scenario" && s.steps.length === 2
      },
    )
    const scenario = saved.find((x) => x.id === id)
    assert.equal(scenario?.steps[0].target, "shell")
    assert.equal(scenario?.steps[1].name, PRESET_NAME)

    await page.reload()
    await page.getByText("UI Smoke Scenario").first().waitFor()
  })
})
