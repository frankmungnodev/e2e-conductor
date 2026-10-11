// Starts a seeded project server plus a headless browser for UI smoke tests.
// Run through `pnpm run test:ui`, which builds ui/dist first.
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import type { Server } from "node:http"
import { join, resolve } from "node:path"
import { after } from "node:test"
import { type Browser, chromium, type Page } from "playwright"
import { loadConfig } from "../../src/config.ts"
import { openDatabase } from "../../src/db/connection.ts"
import { saveDraft, saveDraftGroup, saveRevision } from "../../src/db/drafts.ts"
import { saveEnvironment, setActiveEnvironment } from "../../src/db/environments.ts"
import { saveFixture } from "../../src/db/fixtures.ts"
import { savePlatform } from "../../src/db/platforms.ts"
import { saveScenario } from "../../src/db/scenarios.ts"
import { saveStepPreset } from "../../src/db/step-presets.ts"
import { startServer } from "../../src/server.ts"
import { tempDir } from "../temp-dir.ts"

const repoRoot = resolve(import.meta.dirname, "../..")

export const SHELL_SCENARIO_ID = "01-shell-smoke"
export const SHELL_SCENARIO_NAME = "Shell Smoke"
export const SHELL_OUTPUT = "hello-from-smoke"
export const FIXTURE_NAME = "say-hello"
export const PRESET_NAME = "Print marker"

function seedProject(dir: string) {
  mkdirSync(join(dir, "scenarios"), { recursive: true })
  mkdirSync(join(dir, "results"), { recursive: true })
  mkdirSync(join(dir, "node_modules"), { recursive: true })
  symlinkSync(repoRoot, join(dir, "node_modules", "e2e-orchestrator"), "junction")

  const db = openDatabase(join(dir, ".e2e", "e2e.db"))
  saveEnvironment(db, "dev", { description: "Development", scenarios: "scenarios", results: "results" })
  saveEnvironment(db, "staging", { description: "Staging", scenarios: "scenarios", results: "results" })
  setActiveEnvironment(db, "dev")
  savePlatform(db, {
    id: "plat-admin",
    name: "admin",
    type: "web",
    url: "http://localhost:5173",
    modules: "./web",
    serviceName: "web",
  })
  saveFixture(db, FIXTURE_NAME, { cmd: `echo ${SHELL_OUTPUT}` })
  saveStepPreset(db, {
    id: "print-marker",
    name: PRESET_NAME,
    description: "Echo a marker",
    target: "shell",
    step: { name: PRESET_NAME, target: "shell", command: "echo preset" },
  })
  db.close()

  writeFileSync(
    join(dir, "scenarios", `${SHELL_SCENARIO_ID}.json`),
    JSON.stringify({
      $schema: "../../schema/v1/scenario.schema.json",
      name: SHELL_SCENARIO_NAME,
      steps: [{ name: "Say hello", target: "shell", command: `echo ${SHELL_OUTPUT}` }],
    }),
  )
}

export const DRAFT_PROMPT = "Use e2e testing to test all the features"
export const PASSING_DRAFT_NAME = "Greet Draft"
export const FAILING_DRAFT_NAME = "Broken Draft"

/**
 * Seeds one draft group as an agent save would: a draft that passes, a draft that fails, and a passing
 * revision of the kept shell scenario. No environment carries the draft mark.
 */
export function seedDrafts(projectDir: string) {
  const db = openDatabase(join(projectDir, ".e2e", "e2e.db"))
  try {
    saveScenario(db, {
      id: SHELL_SCENARIO_ID,
      name: SHELL_SCENARIO_NAME,
      steps: [{ name: "Say hello", target: "shell", command: `echo ${SHELL_OUTPUT}` }],
    })
    saveDraftGroup(db, { key: "all-features", prompt: DRAFT_PROMPT, agent: "claude-code" })
    saveDraft(
      db,
      { id: "draft-greet", name: PASSING_DRAFT_NAME, steps: [{ name: "Greet", target: "shell", command: "echo hello-draft" }] },
      "all-features",
    )
    saveDraft(
      db,
      { id: "draft-broken", name: FAILING_DRAFT_NAME, steps: [{ name: "Fail on purpose", target: "shell", command: "exit 3" }] },
      "all-features",
    )
    saveRevision(
      db,
      SHELL_SCENARIO_ID,
      { id: SHELL_SCENARIO_ID, name: SHELL_SCENARIO_NAME, steps: [{ name: "Say hello again", target: "shell", command: "echo revised" }] },
      "all-features",
    )
  } finally {
    db.close()
  }
}

export type UiSession = { url: string; page: Page; projectDir: string; api: <T = unknown>(path: string) => Promise<T> }

/** Seeds a temp project, starts its server and a browser page; both close when the test file ends. */
export async function startUiSession(prefix: string): Promise<UiSession> {
  if (!existsSync(join(repoRoot, "ui", "dist", "index.html"))) {
    throw new Error("ui/dist is missing. Run `pnpm run test:ui`, which builds the UI first.")
  }
  const projectDir = tempDir(`ui-${prefix}`)
  seedProject(projectDir)
  const config = await loadConfig(projectDir)
  const { server, url } = await startServer(config, { port: 0, host: "127.0.0.1", open: false })
  const browser: Browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  after(async () => {
    await browser.close()
    await new Promise<void>((resolveClose) => (server as Server).close(() => resolveClose()))
  })
  const api = async <T = unknown>(path: string) => (await (await fetch(`${url}${path}`)).json()) as T
  return { url, page, projectDir, api }
}

/** Polls `read` until `check` passes, for state the UI saves asynchronously (auto-save, background runs). */
export async function eventually<T>(read: () => Promise<T>, check: (value: T) => boolean, timeoutMs = 10000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last = await read()
  while (!check(last)) {
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms; last value: ${JSON.stringify(last)}`)
    await new Promise((r) => setTimeout(r, 200))
    last = await read()
  }
  return last
}
