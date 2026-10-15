import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import type { Page } from "playwright"
import {
  DRAFT_PROMPT,
  eventually,
  FAILING_DRAFT_NAME,
  PASSING_DRAFT_NAME,
  SHELL_SCENARIO_NAME,
  seedDrafts,
  startUiSession,
} from "./helpers.ts"

type RunStatus = {
  isRunning: boolean
  currentRun?: { paused?: unknown } | null
  lastSummary?: { passed?: number; failed?: number } | null
}
type DraftsResponse = { groups: Array<{ drafts: Array<{ name: string; state: string }> }> }

const finished = (api: <T>(path: string) => Promise<T>, check: (s: RunStatus) => boolean) =>
  eventually(
    () => api<RunStatus>("/api/run/status"),
    (s) => !s.isRunning && check(s),
    20000,
  )

const draftRow = (page: Page, name: string) => page.getByRole("article", { name })

describe("Drafts view", () => {
  it("shows the empty state when no agent saved drafts", async () => {
    const { url, page } = await startUiSession("drafts-empty")
    await page.goto(`${url}/?tab=drafts`)
    await page.getByText("No Drafts", { exact: true }).waitFor()
    await page.getByText(/save them with `e2e-conductor save`/).waitFor()
  })

  it("reviews, runs, keeps, marks, re-runs and discards a prompt group", async () => {
    const { url, page, projectDir, api } = await startUiSession("drafts-flow")
    seedDrafts(projectDir)
    await page.goto(`${url}/?tab=drafts`)

    // The group shows its prompt and each draft's readback, and the revision names its kept scenario.
    const group = page.getByRole("region", { name: DRAFT_PROMPT })
    await group.getByText("Saved by claude-code · 3 drafts · 0 passed").waitFor()
    await draftRow(page, PASSING_DRAFT_NAME).getByText("Runs the shell command: echo hello-draft").waitFor()
    await draftRow(page, FAILING_DRAFT_NAME).getByText("Runs the shell command: exit 3").waitFor()
    const revision = draftRow(page, SHELL_SCENARIO_NAME)
    await revision.getByText(`Revision of ${SHELL_SCENARIO_NAME}`).waitFor()
    await revision.getByText("Runs the shell command: echo revised").waitFor()

    // With no environment marked, the card refuses and points at the Config view.
    await group.getByText("No environment allows draft runs yet").waitFor()
    assert.equal(await group.getByRole("button", { name: "Run Batch" }).count(), 0)
    await group.getByRole("button", { name: "Open Environments" }).click()
    assert.match(page.url(), /tab=config/)
    assert.match(page.url(), /sub=environments/)

    await page.getByText("Allow Draft Runs", { exact: true }).click()
    await eventually(
      () => api<{ environments: Record<string, { allowDrafts?: boolean }> }>("/api/config"),
      (config) => config.environments.dev?.allowDrafts === true,
    )

    // Run batch on the marked environment shows the run in the Runner.
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    await group.getByRole("button", { name: "Run Batch" }).click()
    await page.waitForURL(/tab=runner/)
    const batch = await finished(api, (s) => s.lastSummary?.failed === 1)
    assert.equal(batch.lastSummary?.passed, 2)

    // Keep all passing moves the two passing drafts out of the Drafts tab.
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    await draftRow(page, PASSING_DRAFT_NAME).getByText("Passed", { exact: true }).waitFor()
    await draftRow(page, FAILING_DRAFT_NAME).getByText("Not Yet Passed", { exact: true }).waitFor()
    await group.getByRole("button", { name: "Keep All Passing" }).click()
    await draftRow(page, PASSING_DRAFT_NAME).waitFor({ state: "detached" })
    await draftRow(page, SHELL_SCENARIO_NAME).waitFor({ state: "detached" })
    const left = await api<DraftsResponse>("/api/drafts")
    assert.deepEqual(
      left.groups.flatMap((g) => g.drafts.map((d) => d.name)),
      [FAILING_DRAFT_NAME],
    )

    // Bug found on the failed draft.
    const broken = draftRow(page, FAILING_DRAFT_NAME)
    await broken.getByRole("button", { name: "Mark Bug Found" }).click()
    await broken.getByText("Bug Found", { exact: true }).waitFor()

    // Re-running the failed draft from Reports runs exactly that draft, paused on its failure.
    await page.goto(`${url}/?tab=artifacts`)
    await page.getByRole("button", { name: "Re-run with Pause on Failure" }).first().click()
    const panel = page.getByRole("region", { name: "Paused on failure" })
    await panel.waitFor()
    assert.match(page.url(), /tab=runner/)
    await panel.getByRole("button", { name: "End Scenario" }).click()
    const rerun = await finished(api, (s) => s.lastSummary?.failed === 1)
    assert.equal(rerun.lastSummary?.passed, 0)

    // Discarding the group asks first, then removes it.
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    await group.getByRole("button", { name: "Discard Group" }).click()
    const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Discard Group" }) })
    await dialog.getByRole("button", { name: "Discard Group" }).click()
    await page.getByText("No Drafts", { exact: true }).waitFor()
    assert.equal(await group.count(), 0)
  })

  it("leaves drafts out of the Runner's list and its select-all run", async () => {
    const { url, page, projectDir, api } = await startUiSession("drafts-runner")
    seedDrafts(projectDir)
    await page.goto(`${url}/?tab=runner`)
    await page.getByRole("button", { name: `Run ${SHELL_SCENARIO_NAME} only` }).waitFor()
    // The header counts the one kept scenario, not the drafts, and names the package version.
    const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }
    await page.getByRole("banner").getByText("1 scenario", { exact: true }).waitFor()
    await page.getByRole("banner").getByText(`v${version}`, { exact: true }).waitFor()
    assert.equal(await page.getByText(PASSING_DRAFT_NAME).count(), 0)
    assert.equal(await page.getByText(FAILING_DRAFT_NAME).count(), 0)

    await page.getByRole("button", { name: /^Start Run/ }).click()
    const done = await finished(api, (s) => s.lastSummary?.passed !== undefined)
    assert.equal(done.lastSummary?.passed, 1)
    assert.equal(done.lastSummary?.failed, 0)
  })
})
