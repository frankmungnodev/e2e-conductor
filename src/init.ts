import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { stdin as input, stdout as output } from "node:process"
import * as readline from "node:readline/promises"
import type { DatabaseSync } from "node:sqlite"
import { openDatabase } from "./db/connection.ts"
import { getEnvironments, saveEnvironment } from "./db/environments.ts"
import { resolveDbPath, resolveProjectDir } from "./db/paths.ts"
import { savePlatform } from "./db/platforms.ts"
import { getScenario, saveScenario } from "./db/scenarios.ts"
import { color } from "./logger.ts"
import { scenarioSchemaRef } from "./schema.ts"
import {
  detectWorkspace,
  saveWizardComponentsToDb,
  scaffoldWizardFiles,
  type WizardComponent,
} from "./wizard.ts"

/**
 * The database to seed: a new one, or an existing one with no environment yet. Undefined when the
 * database already has an environment, or exists but cannot be read, so it is left untouched.
 */
function openSeedTarget(dbPath: string): DatabaseSync | undefined {
  const existed = existsSync(dbPath)
  let db: DatabaseSync | undefined
  try {
    db = openDatabase(dbPath)
    if (!existed || Object.keys(getEnvironments(db)).length === 0) return db
  } catch {
    // Not a database we can read: never overwrite it.
  }
  db?.close()
  return undefined
}

const SMOKE = {
  name: "Smoke",
  steps: [{ name: "home responds", target: "api", url: "/", assert: { status: 200 } }],
}

/**
 * Write a starter SQLite database and smoke scenario under .e2e.
 * Never overwrites: a database that already has an environment, or a file that exists, is skipped.
 */
export function initProject(targetPath: string = process.cwd()): { created: string[]; skipped: string[] } {
  const rootDir = resolveProjectDir(targetPath)

  const created: string[] = []
  const skipped: string[] = []

  // Seed by content, not file presence: saving a scenario in the GUI before initializing creates an
  // empty database, and skipping it would leave the project with no environment or platform.
  const dbPath = resolveDbPath(rootDir)
  const db = openSeedTarget(dbPath)
  if (!db) {
    skipped.push(dbPath)
  } else {
    saveEnvironment(
      db,
      "dev",
      {
        description: "Local development baseline",
        scenarios: ".e2e/scenarios",
        flows: ".e2e/flows",
        results: ".e2e/results",
        env: { APP_ENV: "dev" },
      },
      { isDefault: true, isActive: true },
    )
    savePlatform(db, {
      id: "plat-api",
      name: "api",
      type: "api",
      orderNum: 1,
      url: "http://localhost:3000",
      serviceName: "api",
      health: "/",
    })
    // Never overwrite a smoke scenario the user already saved.
    if (!getScenario(db, "smoke")) saveScenario(db, { id: "smoke", name: SMOKE.name, steps: SMOKE.steps })
    db.close()
    created.push(dbPath)
  }

  const smokePath = join(rootDir, ".e2e", "scenarios", "smoke.json")
  if (existsSync(smokePath)) {
    skipped.push(smokePath)
  } else {
    mkdirSync(dirname(smokePath), { recursive: true })
    const file = { $schema: scenarioSchemaRef(dirname(smokePath)), ...SMOKE }
    writeFileSync(smokePath, `${JSON.stringify(file, null, 2)}\n`)
    created.push(smokePath)
  }

  return { created, skipped }
}

/**
 * Interactive terminal configuration wizard.
 * Prompts user step-by-step for components, captures types & run orders,
 * then saves configuration directly into SQLite database under .e2e.
 */
export async function runInteractiveInit(
  targetPath: string = process.cwd(),
): Promise<{ created: string[]; skipped: string[] }> {
  const rl = readline.createInterface({ input, output })
  const rootDir = resolveProjectDir(targetPath)

  const ask = async (query: string, defaultValue = ""): Promise<string> => {
    const promptText = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `
    const answer = await rl.question(promptText)
    return answer.trim() ? answer.trim() : defaultValue
  }

  const askBool = async (query: string, defaultYes = false): Promise<boolean> => {
    const hint = defaultYes ? "[Y/n]" : "[y/N]"
    const answer = (await rl.question(`${query} ${hint}: `)).trim().toLowerCase()
    if (!answer) return defaultYes
    return answer === "y" || answer === "yes"
  }

  console.log(`\n${color.bold("🔧 E2E Orchestrator Configuration Wizard")}`)
  console.log(color.dim("Define your backend services, web applications, and mobile apps."))

  const detected = detectWorkspace(rootDir)
  if (detected.length > 0) {
    console.log(`\n${color.cyan("💡 Detected projects in workspace:")}`)
    for (const d of detected) {
      console.log(`  • ${d.suggestedType.toUpperCase()}: ${color.bold(d.name)} (${d.path})`)
    }
  }

  const components: WizardComponent[] = []
  let nextOrder = 1

  try {
    // 1. Backend / REST API
    const addApi = await askBool("\n1. Configure a Backend / REST API service?", true)
    if (addApi) {
      const defaultApi = detected.find((d) => d.suggestedType === "api")
      const name = await ask("   Service / Target name", defaultApi?.name || "api")
      const cwd = await ask("   Project directory path", defaultApi?.path || "./backend")
      const startCmd = await ask("   Start command", defaultApi?.startCmd || "pnpm run dev")
      const url = await ask("   Base URL", defaultApi?.port ? `http://localhost:${defaultApi.port}` : "http://localhost:3000")
      const health = await ask("   Health check endpoint", "/health")

      components.push({
        id: `comp-${Date.now()}-1`,
        type: "api",
        name,
        order: nextOrder++,
        cwd: cwd !== "." && cwd !== "./" ? cwd : undefined,
        startCmd: startCmd || undefined,
        url,
        health: health || undefined,
      })
    }

    // 2. Web App (Playwright)
    const addWeb = await askBool("\n2. Configure a Web SPA / Admin application (Playwright)?", true)
    if (addWeb) {
      const defaultWeb = detected.find((d) => d.suggestedType === "web")
      const name = await ask("   Web target name", defaultWeb?.name || "web")
      const cwd = await ask("   Project directory path", defaultWeb?.path || "./frontend")
      const startCmd = await ask("   Dev server start command", defaultWeb?.startCmd || "pnpm run dev")
      const url = await ask("   Dev server URL", defaultWeb?.port ? `http://localhost:${defaultWeb.port}` : "http://localhost:5173")
      const modules = await ask("   Web steps directory", `.e2e/modules/${name}`)

      components.push({
        id: `comp-${Date.now()}-2`,
        type: "web",
        name,
        order: nextOrder++,
        cwd: cwd !== "." && cwd !== "./" ? cwd : undefined,
        startCmd: startCmd || undefined,
        url,
        modules,
      })
    }

    // 3. Android Mobile App (adb)
    const addAndroid = await askBool("\n3. Configure an Android Mobile application (adb)?", false)
    if (addAndroid) {
      const defaultAndroid = detected.find((d) => d.suggestedType === "android")
      const name = await ask("   Mobile target name", defaultAndroid?.name || "mobile_app")
      const appId = await ask("   Application ID (package)", defaultAndroid?.appId || "com.example.app")
      const cwd = await ask("   Android project path", defaultAndroid?.path || "./android")
      const installCmd = await ask("   Build & install command", defaultAndroid?.startCmd || "./gradlew installDebug")
      const flows = await ask("   Mobile flows directory", `.e2e/flows/${name}`)
      const reversePortStr = await ask("   Reverse ports (comma separated, e.g. 3000)", "")
      const reversePorts = reversePortStr
        ? reversePortStr
            .split(",")
            .map((p) => Number(p.trim()))
            .filter((n) => !Number.isNaN(n))
        : undefined

      components.push({
        id: `comp-${Date.now()}-3`,
        type: "android",
        name,
        order: nextOrder++,
        cwd: cwd !== "." && cwd !== "./" ? cwd : undefined,
        appId,
        installCmd: installCmd || undefined,
        flows,
        reversePorts,
      })
    }

    if (components.length === 0) {
      console.log(color.yellow("\nNo components configured. Falling back to default starter config."))
      return initProject(rootDir)
    }

    // Run Order Confirmation
    console.log(`\n${color.bold("📋 Configured Run Order:")}`)
    for (const [idx, comp] of components.entries()) {
      console.log(`  ${idx + 1}. [${comp.type.toUpperCase()}] ${comp.name}`)
    }

    const reorder = await askBool("\nDo you want to reorder any component?", false)
    if (reorder) {
      for (const comp of components) {
        const orderStr = await ask(`Run order priority for ${comp.name}`, String(comp.order))
        const num = Number(orderStr)
        if (!Number.isNaN(num)) comp.order = num
      }
      components.sort((a, b) => a.order - b.order)
    }

    const dbPath = resolveDbPath(rootDir)
    const db = openDatabase(dbPath)
    saveWizardComponentsToDb(db, components)
    db.close()

    const created: string[] = [dbPath]
    const skipped: string[] = []

    // Scaffold starter files under .e2e
    const scaffoldRes = scaffoldWizardFiles(rootDir, components)
    created.push(...scaffoldRes.created)
    skipped.push(...scaffoldRes.skipped)

    return { created, skipped }
  } finally {
    rl.close()
  }
}
