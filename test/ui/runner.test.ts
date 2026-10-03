import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import { eventually, SHELL_OUTPUT, SHELL_SCENARIO_ID, SHELL_SCENARIO_NAME, startUiSession } from "./helpers.ts"

type RunStatus = { isRunning: boolean; lastSummary?: { passed?: number; failed?: number } | null }

describe("Runner view", () => {
  it("runs a shell scenario and shows its steps and logs", async () => {
    const { url, page, api } = await startUiSession("runner")
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: `Run ${SHELL_SCENARIO_NAME} only` }).waitFor()
    await page.getByRole("button", { name: /^Start Run/ }).click()

    await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && (s.lastSummary?.passed ?? 0) >= 1,
      20000,
    )
    await page.getByText(/Passed: 1/).first().waitFor()
    await page.getByText(SHELL_OUTPUT).first().waitFor()
  })
})

/** The checkbox input is visually hidden, so this clicks its visible label, then confirms the new state. */
async function setOption(page: Page, label: string, checked: boolean) {
  const box = page.getByRole("checkbox", { name: label })
  if ((await box.isChecked()) !== checked) await page.getByText(label, { exact: true }).click()
  assert.equal(await box.isChecked(), checked, label)
}

describe("Runner view options and failures", () => {
  it("sends the chosen run options and repeats the scenario", async () => {
    const { url, page, api } = await startUiSession("runner-options")
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: "Run Options" }).click()
    await page.getByLabel("Repeat iterations").fill("2")
    // Flip every toggle from its default. Install only affects mobile targets, so a shell scenario is safe.
    await setOption(page, "Auto-Start Servers", false)
    await setOption(page, "Silent Browser (Headless)", true)
    await setOption(page, "Detailed Output Logs", false)
    await setOption(page, "Install Mobile App", true)

    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith("/api/run") && r.method() === "POST"),
      page.getByRole("button", { name: /^Start Run/ }).click(),
    ])
    assert.deepEqual(request.postDataJSON(), {
      scenarios: [SHELL_SCENARIO_ID],
      repeat: 2,
      start: false,
      install: true,
      headless: true,
      verbose: false,
    })

    await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && s.lastSummary?.passed === 2,
      20000,
    )
    await page.getByText(/Passed: 2/).first().waitFor()
  })

  it("reports a scenario whose step fails", async () => {
    const { url, page, api, projectDir } = await startUiSession("runner-failure")
    writeFileSync(
      join(projectDir, "scenarios", "02-failing.json"),
      JSON.stringify({ name: "Failing Smoke", steps: [{ name: "Exit non-zero", target: "shell", command: "exit 3" }] }),
    )
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: "Run Failing Smoke only" }).click()
    await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && (s.lastSummary?.failed ?? 0) >= 1,
      20000,
    )
    await page.getByText(/Failed: 1/).first().waitFor()
    await page.getByText("Exit non-zero").first().waitFor()
  })
})
