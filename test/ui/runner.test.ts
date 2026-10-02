import { describe, it } from "node:test"
import { eventually, SHELL_OUTPUT, SHELL_SCENARIO_NAME, startUiSession } from "./helpers.ts"

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
