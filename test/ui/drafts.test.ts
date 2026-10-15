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
  it("shows the empty card with copyable steps and the draft-run warning", async () => {
    const { url, page } = await startUiSession("drafts-empty")
    await page.goto(`${url}/?tab=drafts`)
    const card = page.getByRole("region", { name: "No Drafts" })
    await card.waitFor()
    await card.locator("code", { hasText: "npx e2e-conductor kit" }).waitFor()
    await card.getByRole("button", { name: "Copy command" }).waitFor()
    await card.locator("code", { hasText: "e2e-conductor save" }).waitFor()
    await card.getByText("No environment allows draft runs yet").waitFor()
    assert.equal((await page.locator("body").innerText()).includes("`"), false, "no literal backticks")
  })

  it("lists drafts collapsed, runs a group, keeps the passing ones, marks and discards", async () => {
    const { url, page, projectDir, api } = await startUiSession("drafts-flow")
    seedDrafts(projectDir)
    await page.goto(`${url}/?tab=drafts`)

    const group = page.getByRole("region", { name: DRAFT_PROMPT })
    await group.getByText("claude-code · 3 drafts · 0 passed").waitFor()
    const revision = draftRow(page, SHELL_SCENARIO_NAME)
    await revision.getByText(`Revision of ${SHELL_SCENARIO_NAME}`).waitFor()

    // Rows start collapsed; clicking one shows its steps, clicking again hides them.
    const greet = draftRow(page, PASSING_DRAFT_NAME)
    // The row's toggle is named by the draft; the menu trigger's name starts with "More actions".
    const greetToggle = greet.getByRole("button", { name: new RegExp(`^${PASSING_DRAFT_NAME}`) })
    await greet.getByText("Not Run", { exact: true }).waitFor()
    assert.equal(await greet.getByText("Runs the shell command: echo hello-draft").count(), 0)
    await greetToggle.click()
    await greet.getByText("Runs the shell command: echo hello-draft").waitFor()
    assert.equal(await greetToggle.getAttribute("aria-expanded"), "true")
    await greetToggle.click()
    await greet.getByText("Runs the shell command: echo hello-draft").waitFor({ state: "detached" })

    // A never-run draft offers neither Keep nor Mark Bug Found (AE2).
    assert.equal(await greet.getByRole("button", { name: "Keep" }).count(), 0)
    assert.equal(await greet.getByRole("button", { name: "Mark Bug Found" }).count(), 0)

    // With no environment marked, the warning shows once and Run is disabled (AE3).
    assert.equal(await page.getByText("No environment allows draft runs yet").count(), 1)
    assert.equal(await group.getByRole("button", { name: "Run", exact: true }).isDisabled(), true)
    await page.getByRole("button", { name: "Open Environments" }).click()
    assert.match(page.url(), /tab=config/)
    assert.match(page.url(), /sub=environments/)
    await page.getByText("Allow Draft Runs", { exact: true }).click()
    await eventually(
      () => api<{ environments: Record<string, { allowDrafts?: boolean }> }>("/api/config"),
      (config) => config.environments.dev?.allowDrafts === true,
    )

    // Run on the group shows the run in the Runner.
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    await group.getByRole("button", { name: "Run", exact: true }).click()
    await page.waitForURL(/tab=runner/)
    const batch = await finished(api, (s) => s.lastSummary?.failed === 1)
    assert.equal(batch.lastSummary?.passed, 2)
    // A failing draft batch is not a suite run, so the header's last-run status stays off.
    assert.equal(await page.getByRole("banner").getByText("Last Run Failed").count(), 0)

    // The failing draft says why on its collapsed row (AE1).
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    const broken = draftRow(page, FAILING_DRAFT_NAME)
    await greet.getByText("Passed", { exact: true }).waitFor()
    await broken.getByText("Failed", { exact: true }).waitFor()
    await broken.getByText("Last run: Step 1, Fail on purpose: exit code: expected 0, got 3").waitFor()
    assert.equal(await broken.getByText("Runs the shell command: exit 3").count(), 0)

    // Keep 2 Passing moves the passing drafts out of the Drafts tab.
    await group.getByRole("button", { name: "Keep 2 Passing" }).click()
    await greet.waitFor({ state: "detached" })
    await revision.waitFor({ state: "detached" })
    const left = await api<DraftsResponse>("/api/drafts")
    assert.deepEqual(
      left.groups.flatMap((g) => g.drafts.map((d) => d.name)),
      [FAILING_DRAFT_NAME],
    )

    // Bug found on the failed draft.
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

    // Discard Group sits in the group's menu and asks first.
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    await group.getByRole("button", { name: `More actions for ${DRAFT_PROMPT}` }).click()
    await page.getByRole("menuitem", { name: "Discard Group" }).click()
    const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Discard Group" }) })
    await dialog.getByRole("button", { name: "Discard Group" }).click()
    await page.getByRole("region", { name: "No Drafts" }).waitFor()
    assert.equal(await group.count(), 0)
  })

  it("runs every draft from the run bar and keeps Edit and Discard in the row menu", async () => {
    const { url, page, projectDir, api } = await startUiSession("drafts-menu")
    seedDrafts(projectDir)
    await page.goto(`${url}/?tab=config&sub=environments`)
    await page.getByText("Allow Draft Runs", { exact: true }).click()
    await eventually(
      () => api<{ environments: Record<string, { allowDrafts?: boolean }> }>("/api/config"),
      (config) => config.environments.dev?.allowDrafts === true,
    )
    await page.getByRole("button", { name: "Drafts", exact: true }).click()

    // The row menu opens, closes on Escape, and holds Edit in Builder and Discard.
    const broken = draftRow(page, FAILING_DRAFT_NAME)
    const more = broken.getByRole("button", { name: `More actions for ${FAILING_DRAFT_NAME}` })
    await more.click()
    await page.getByRole("menuitem", { name: "Edit in Builder" }).waitFor()
    await page.keyboard.press("Escape")
    await page.getByRole("menuitem", { name: "Edit in Builder" }).waitFor({ state: "detached" })
    await more.click()
    await page.getByRole("menuitem", { name: "Discard" }).click()
    const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Discard Draft" }) })
    await dialog.getByRole("button", { name: "Discard" }).click()
    await broken.waitFor({ state: "detached" })

    // Run All runs both remaining drafts.
    await page.getByRole("button", { name: "Run All 2" }).click()
    await page.waitForURL(/tab=runner/)
    const done = await finished(api, (s) => s.lastSummary?.passed !== undefined)
    assert.equal(done.lastSummary?.passed, 2)

    // Edit in Builder opens the draft in the builder.
    await page.getByRole("button", { name: "Drafts", exact: true }).click()
    await draftRow(page, PASSING_DRAFT_NAME).getByRole("button", { name: `More actions for ${PASSING_DRAFT_NAME}` }).click()
    await page.getByRole("menuitem", { name: "Edit in Builder" }).click()
    await page.waitForURL(/tab=scenarios/)
    // The open draft shows in the list, marked, while the other draft stays in the Drafts tab.
    await page.getByText(PASSING_DRAFT_NAME).first().waitFor()
    await page.getByText("Draft", { exact: true }).first().waitFor()
  })

  it("leaves drafts out of the Scenarios list", async () => {
    const { url, page, projectDir } = await startUiSession("drafts-builder-list")
    seedDrafts(projectDir)
    await page.goto(`${url}/?tab=scenarios`)
    await page.getByText(SHELL_SCENARIO_NAME).first().waitFor()
    assert.equal(await page.getByText(PASSING_DRAFT_NAME).count(), 0)
    assert.equal(await page.getByText(FAILING_DRAFT_NAME).count(), 0)
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
