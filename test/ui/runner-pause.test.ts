import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import { eventually, startUiSession, type UiSession } from "./helpers.ts"

type RunStatus = {
  isRunning: boolean
  currentRun?: { paused?: unknown } | null
  lastSummary?: { passed?: number; failed?: number; fixed?: number; reason?: string } | null
}

const SCENARIO_NAME = "Pause Smoke"

/** Seeds a scenario whose first step fails, starts it with Pause on Failure, and waits for the pause. */
async function startPausedRun({ url, page, projectDir, api }: UiSession) {
  writeFileSync(
    join(projectDir, "scenarios", "02-pause.json"),
    JSON.stringify({
      name: SCENARIO_NAME,
      steps: [
        { name: "Broken step", target: "shell", command: "exit 3" },
        { name: "After the fix", target: "shell", command: "echo after-the-fix" },
      ],
    }),
  )
  await page.goto(`${url}/?tab=runner`)
  await page.getByRole("button", { name: "Run Options" }).click()
  await setOption(page, "Pause on Failure", true)
  await page.getByRole("button", { name: `Run ${SCENARIO_NAME} only` }).click()
  await eventually(
    () => api<RunStatus>("/api/run/status"),
    (s) => Boolean(s.currentRun?.paused),
    20000,
  )
  const panel = page.getByRole("region", { name: "Paused on failure" })
  await panel.waitFor()
  return panel
}

/** The checkbox input is visually hidden, so this clicks its visible label, then confirms the new state. */
async function setOption(page: Page, label: string, checked: boolean) {
  const box = page.getByRole("checkbox", { name: label })
  if ((await box.isChecked()) !== checked) await page.getByText(label, { exact: true }).click()
  assert.equal(await box.isChecked(), checked, label)
}

describe("Runner view pause on failure", () => {
  it("fixes the failed step in the retry dialog, continues, and shows the run as fixed", async () => {
    const session = await startUiSession("runner-pause")
    const { page, api } = session
    const panel = await startPausedRun(session)
    assert.equal(await panel.getByRole("button", { name: "Continue" }).isDisabled(), true)

    await panel.getByRole("button", { name: "Edit and Retry Step" }).click()
    const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Retry Step" }) })
    await dialog.getByLabel("Step JSON").fill(JSON.stringify({ name: "Broken step", target: "shell", command: "echo fixed-now" }))
    await dialog.getByRole("button", { name: "Retry Step" }).click()

    await panel.getByText("Retry Passed", { exact: true }).waitFor()
    await panel.getByRole("button", { name: "Continue" }).click()

    const done = await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && s.lastSummary?.fixed === 1,
      20000,
    )
    assert.equal(done.lastSummary?.reason, "fixed during run")
    await page.getByText("Fixed During Run").first().waitFor()
    await page.getByText(/1 fixed/).first().waitFor()
    await page.getByText("Fixed By Retry").first().waitFor()

    const scenarios = await api<Array<{ name: string; steps: Array<{ command?: string }> }>>("/api/scenarios")
    assert.equal(scenarios.find((s) => s.name === SCENARIO_NAME)?.steps[0].command, "echo fixed-now")
  })

  it("ends the paused scenario as failed", async () => {
    const session = await startUiSession("runner-pause-end")
    const { page, api } = session
    const panel = await startPausedRun(session)

    await panel.getByRole("button", { name: "End Scenario" }).click()
    await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && s.lastSummary?.failed === 1,
      20000,
    )
    await page.getByText(/1 failed/).first().waitFor()
    assert.equal(await panel.count(), 0)
  })
})
