import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import { eventually, FIXTURE_NAME, PRESET_NAME, SHELL_SCENARIO_ID, SHELL_SCENARIO_NAME, startUiSession, type UiSession } from "./helpers.ts"

/** The open dialog with this heading; another dialog may still be animating closed. */
function dialogTitled(page: Page, title: string) {
  return page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: title, exact: true }) })
}

type ScenarioSummary = {
  id: string
  name: string
  vars?: Record<string, unknown>
  raw: { read_only?: boolean }
  steps: Array<{ name: string; target: string }>
}

const SECOND_SCENARIO_NAME = "Second Scenario"

/**
 * Opens the builder on the seeded shell scenario, with a second scenario to switch to. The page clock is
 * frozen, so the debounced auto-save never fires and any save must come from the flow under test.
 */
async function openBuilderWithFrozenClock(prefix: string): Promise<UiSession> {
  const session = await startUiSession(prefix)
  writeFileSync(
    join(session.projectDir, "scenarios", "02-second.json"),
    JSON.stringify({ name: SECOND_SCENARIO_NAME, steps: [{ name: "Second step", target: "shell", command: "echo second" }] }),
  )
  await session.page.clock.install()
  await session.page.goto(`${session.url}/?tab=scenarios`)
  await session.page.getByRole("textbox", { name: "Step milestone name..." }).waitFor()
  return session
}

async function shellScenario(api: UiSession["api"], check: (s: ScenarioSummary | undefined) => boolean) {
  const list = await eventually(
    () => api<ScenarioSummary[]>("/api/scenarios"),
    (l) => check(l.find((s) => s.id === SHELL_SCENARIO_ID)),
  )
  return list.find((s) => s.id === SHELL_SCENARIO_ID)
}

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
    await settings.getByRole("button", { name: "Add Variable" }).click()
    await settings.getByRole("textbox", { name: "e.g. API_KEY" }).pressSequentially("BASE_URL")
    await settings.getByRole("textbox", { name: "e.g. secret_val" }).fill("http://localhost")
    // The native input is visually hidden under its label, so click the label text.
    // Read-only needs a setup fixture to apply to.
    await settings.getByRole("button", { name: FIXTURE_NAME }).click()
    await settings.getByText("Read-only", { exact: true }).click()
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
    assert.deepEqual(scenario?.vars, { BASE_URL: "http://localhost" })
    assert.equal(scenario?.raw.read_only, true)

    await page.reload()
    await page.getByText("UI Smoke Scenario").first().waitFor()
  })
})

describe("Scenario builder saving", () => {
  it("saves edits made in the raw-JSON editor", async () => {
    const { page, api } = await openBuilderWithFrozenClock("builder-json")
    await page.getByRole("button", { name: "Raw JSON" }).click()
    const json = page.getByRole("textbox", { name: "Scenario JSON" })
    const edited = { ...JSON.parse(await json.inputValue()), name: "Edited As JSON" }
    await json.fill(JSON.stringify(edited, null, 2))
    await page.clock.runFor(1000)
    await shellScenario(api, (s) => s?.name === "Edited As JSON")
  })

  it("saves unsaved changes before switching to another scenario", async () => {
    const { page, api } = await openBuilderWithFrozenClock("builder-switch")
    await page.getByRole("textbox", { name: "Step milestone name..." }).fill("Renamed before switch")
    await page.getByText(SECOND_SCENARIO_NAME).click()
    await shellScenario(api, (s) => s?.steps[0]?.name === "Renamed before switch")
  })

  it("saves unsaved changes when leaving the builder", async () => {
    const { page, api } = await openBuilderWithFrozenClock("builder-unmount")
    await page.getByRole("textbox", { name: "Step milestone name..." }).fill("Renamed before leaving")
    await page.getByRole("button", { name: "Runner" }).click()
    await shellScenario(api, (s) => s?.steps[0]?.name === "Renamed before leaving")
  })

  it("deletes a scenario and selects the remaining one", async () => {
    const { page, api } = await openBuilderWithFrozenClock("builder-delete")
    await page.getByRole("button", { name: "Scenario Settings & Fixtures" }).click()
    await dialogTitled(page, "Scenario Settings & Fixtures").getByRole("button", { name: "Delete Scenario" }).click()
    await dialogTitled(page, "Delete Scenario").getByRole("button", { name: "Delete Scenario" }).click()
    const list = await eventually(
      () => api<ScenarioSummary[]>("/api/scenarios"),
      (l) => !l.some((s) => s.id === SHELL_SCENARIO_ID),
    )
    assert.deepEqual(
      list.map((s) => s.name),
      [SECOND_SCENARIO_NAME],
    )
    // List entries and the step list header carry the scenario name as their title; dialogs do not.
    await page.getByTitle(SHELL_SCENARIO_NAME, { exact: true }).first().waitFor({ state: "detached" })
  })
})

describe("Step presets", () => {
  type Presets = { presets: Array<{ id: string; name: string; step: { command?: string } }> }

  it("saves the selected step as a preset, then deletes it", async () => {
    const { url, page, api } = await startUiSession("builder-presets")
    await page.goto(`${url}/?tab=scenarios`)

    await page.getByRole("button", { name: "Save as Preset" }).click()
    const save = dialogTitled(page, "Save Current Step as Reusable Preset")
    await save.getByRole("textbox", { name: "Preset Name" }).fill("Smoke preset")
    await save.getByRole("button", { name: "Save Preset" }).click()
    const saved = await eventually(
      () => api<Presets>("/api/presets"),
      (p) => p.presets.some((x) => x.name === "Smoke preset"),
    )
    assert.match(saved.presets.find((x) => x.name === "Smoke preset")?.step.command ?? "", /echo/)

    await page.getByRole("button", { name: "Add Step" }).first().click()
    const addStep = dialogTitled(page, "Add Step")
    await addStep.getByRole("button", { name: /^Presets/ }).click()
    // The innermost element holding both the preset's name and its delete button is that preset's row.
    const row = addStep
      .locator("div")
      .filter({ hasText: "Smoke preset" })
      .filter({ has: page.getByRole("button", { name: "Delete preset" }) })
      .last()
    await row.getByRole("button", { name: "Delete preset" }).click()
    await dialogTitled(page, "Delete Preset").getByRole("button", { name: "Delete Preset" }).click()
    const after = await eventually(
      () => api<Presets>("/api/presets"),
      (p) => !p.presets.some((x) => x.name === "Smoke preset"),
    )
    assert.ok(after.presets.some((x) => x.name === PRESET_NAME), "other presets are kept")
  })
})
