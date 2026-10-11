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
    await page.getByText(/1 passed/).first().waitFor()
    await page.getByText(SHELL_OUTPUT).first().waitFor()

    // After a run, clicking a scenario shows it, and the run's results stay one click away.
    await page.locator("aside").getByText(SHELL_SCENARIO_NAME).first().click()
    await page.getByRole("button", { name: "Back to Run Results" }).click()
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
      pauseOnFailure: false,
      stepScreenshots: false,
    })

    await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && s.lastSummary?.passed === 2,
      20000,
    )
    await page.getByText(/2 passed/).first().waitFor()
  })

  it("sends Screenshot Every Step with the run and shows each step's screenshot in Reports", async () => {
    const { url, page, api } = await startUiSession("runner-screenshots")
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: "Run Options" }).click()
    assert.equal(await page.getByRole("checkbox", { name: "Screenshot Every Step" }).isChecked(), false, "off by default")
    await setOption(page, "Screenshot Every Step", true)

    const started = page.waitForRequest((req) => req.url().endsWith("/api/run") && req.method() === "POST")
    await page.getByRole("button", { name: `Run ${SHELL_SCENARIO_NAME} only` }).click()
    assert.equal((await started).postDataJSON().stepScreenshots, true)
    const done = await eventually(
      () => api<RunStatus & { lastSummary?: { artifacts?: string } }>("/api/run/status"),
      (s) => !s.isRunning && s.lastSummary?.passed === 1,
      20000,
    )

    // The seeded project has no web or Android target, so the test saves the step image itself.
    const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    writeFileSync(join(done.lastSummary?.artifacts ?? "", SHELL_SCENARIO_ID, "step-1.png"), Buffer.from(onePixelPng, "base64"))

    await page.goto(`${url}/?tab=artifacts`)
    await page.getByRole("button", { name: new RegExp(SHELL_SCENARIO_NAME) }).click()
    await page.getByRole("button", { name: "Screenshot of step 1" }).click()
    await page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Screenshot" }) }).waitFor()
    assert.equal(await page.getByText("Saved when it failed").count(), 0, "a step image is not listed again as failure evidence")

    // Like the other run options, it is not kept across a reload.
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: "Run Options" }).click()
    assert.equal(await page.getByRole("checkbox", { name: "Screenshot Every Step" }).isChecked(), false)
  })

  it("reports a scenario whose step fails", async () => {
    const { url, page, api, projectDir } = await startUiSession("runner-failure")
    writeFileSync(
      join(projectDir, "scenarios", "02-failing.json"),
      JSON.stringify({ name: "Failing Smoke", steps: [{ name: "Exit non-zero", target: "shell", command: "exit 3" }] }),
    )
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: "Run Failing Smoke only" }).click()
    const done = await eventually(
      () => api<RunStatus & { lastSummary?: { artifacts?: string } }>("/api/run/status"),
      (s) => !s.isRunning && (s.lastSummary?.failed ?? 0) >= 1,
      20000,
    )
    await page.getByText(/1 failed/).first().waitFor()
    await page.getByText("Exit non-zero").first().waitFor()
    // A shell command exiting non-zero is a check the scenario expects, so it is an assertion failure.
    await page.getByText("Assertion Failed", { exact: true }).first().waitFor()

    // Reports leads with the outcome and opens the failed scenario on its failing step and label.
    await page.goto(`${url}/?tab=artifacts`)
    await page.getByRole("heading", { name: "1 scenario passed" }).or(page.getByRole("heading", { name: /failed/ })).waitFor()
    await page.getByText("Failed at step 1: Exit non-zero").waitFor()
    await page.getByText("Assertion Failed", { exact: true }).waitFor()

    // The timeline puts the step's attempt and the scenario's requests on one clock. The seeded
    // project has no HTTP target, so the test saves the requests file itself.
    writeFileSync(
      join(done.lastSummary?.artifacts ?? "", "02-failing", "http-exchanges.json"),
      JSON.stringify([
        { step: "Exit non-zero", startedAt: new Date().toISOString(), durationMs: 3, request: { method: "GET", url: "http://api.local/health" }, response: { status: 503 } },
      ]),
    )
    await page.getByRole("button", { name: "Show Timeline" }).click()
    const timeline = page.getByRole("list", { name: "Failure timeline" })
    await timeline.getByText("1. Exit non-zero").waitFor()
    await timeline.getByText("GET /health").waitFor()
    await timeline.getByText("503 · Exit non-zero").waitFor()
  })

  it("marks a step that passed on retry as recovered and still passes the run", async () => {
    const { url, page, api, projectDir } = await startUiSession("runner-recovered")
    const marker = join(projectDir, "flaky-marker")
    writeFileSync(
      join(projectDir, "scenarios", "03-flaky.json"),
      JSON.stringify({
        name: "Flaky Smoke",
        steps: [
          {
            name: "Fail once",
            target: "shell",
            // The first attempt leaves the marker and fails; the retry finds it and passes.
            command: `if [ -f "${marker}" ]; then echo ok; else touch "${marker}"; exit 1; fi`,
            retry: { times: 1 },
          },
        ],
      }),
    )
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: "Run Flaky Smoke only" }).click()
    const status = await eventually(
      () => api<RunStatus>("/api/run/status"),
      (s) => !s.isRunning && s.lastSummary != null,
      20000,
    )
    assert.equal(status.lastSummary?.failed, 0)
    assert.equal(status.lastSummary?.passed, 1)
    await page.getByText("Recovered", { exact: true }).first().waitFor()
    await page.getByText("Recovered 1", { exact: true }).waitFor()
    await page.getByText(/Recovered: 1/).waitFor()
  })

  it("marks a scenario whose content changed since it last passed", async () => {
    const { url, page, api } = await startUiSession("runner-changed")
    const post = (path: string, body: unknown) =>
      fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    type Runs = { runs: Array<{ runId: string; status?: string }> }
    const runToEnd = async (count: number) => {
      await post("/api/run", { scenarios: ["04-edited"] })
      return eventually(
        () => api<Runs>("/api/runs"),
        (data) => data.runs.length >= count && data.runs.every((r) => r.status && r.status !== "RUNNING"),
        20000,
      )
    }
    const scenario = (command: string) => ({ name: "Edited Smoke", steps: [{ name: "Edited step", target: "shell", command }] })

    await post("/api/scenarios", { id: "04-edited", content: scenario("true") })
    const first = await runToEnd(1)
    await post("/api/scenarios", { id: "04-edited", content: scenario("exit 1") })
    const second = await runToEnd(2)

    await page.goto(`${url}/?tab=artifacts`)
    await page.getByText(`Run ${second.runs[0].runId}`).waitFor()
    await page.getByText("Changed Since Last Pass", { exact: true }).waitFor()

    // The run that passed with the original content has nothing to compare against.
    await page.getByRole("navigation", { name: "Run history" }).getByRole("button").nth(1).click()
    await page.getByText(`Run ${first.runs[0].runId}`).waitFor()
    // The header switches before the new run's details load, so wait for the badge to go.
    await page.getByText("Changed Since Last Pass").waitFor({ state: "detached" })
    await page.getByText("Edited Smoke", { exact: true }).waitFor()
  })
})
