import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { saveEnvironment } from "./db/environments.ts"
import { resolveProjectDir } from "./db/paths.ts"
import { savePlatform } from "./db/platforms.ts"
import { scenarioSchemaRef } from "./schema.ts"

export type ComponentType = "api" | "web" | "android"

export type WizardComponent = {
  id: string
  type: ComponentType
  name: string
  order: number
  // REST API / Backend fields
  url?: string
  health?: string
  startCmd?: string
  cwd?: string
  // Web SPA / Playwright fields
  service?: string // name of backend or dev server service
  modules?: string
  slowMo?: number
  headless?: boolean
  // Android fields
  appId?: string
  installCmd?: string
  flows?: string
  reversePorts?: number[]
  grantPermissions?: string[]
  needs?: string[]
}

export type DetectedService = {
  suggestedType: ComponentType
  name: string
  path: string
  startCmd?: string
  port?: number
  appId?: string
}

/**
 * Scan the workspace directory for package.json, gradle, or cargo files to provide
 * intelligent starter hints for the wizard.
 */
export function detectWorkspace(cwd: string): DetectedService[] {
  const detected: DetectedService[] = []
  if (!existsSync(cwd)) return detected

  try {
    const entries = readdirSync(cwd, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue

      const subPath = join(cwd, entry.name)
      const relPath = `./${entry.name}`

      // Check for Android project
      if (existsSync(join(subPath, "build.gradle")) || existsSync(join(subPath, "build.gradle.kts"))) {
        let appId: string | undefined
        const appBuildGradle = join(subPath, "app", "build.gradle")
        const appBuildGradleKts = join(subPath, "app", "build.gradle.kts")
        const gradlePath = existsSync(appBuildGradle) ? appBuildGradle : existsSync(appBuildGradleKts) ? appBuildGradleKts : undefined
        if (gradlePath) {
          const content = readFileSync(gradlePath, "utf8")
          const match = content.match(/applicationId\s+["']([^"']+)["']/) || content.match(/namespace\s+["']([^"']+)["']/)
          if (match) appId = match[1]
        }
        detected.push({
          suggestedType: "android",
          name: entry.name,
          path: relPath,
          startCmd: "./gradlew installDebug",
          appId: appId || `com.example.${entry.name}`,
        })
        continue
      }

      // Check for Node/Frontend/Backend project
      const pkgPath = join(subPath, "package.json")
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
          const scripts = pkg.scripts || {}
          const deps = { ...pkg.dependencies, ...pkg.devDependencies }
          const isWeb = Boolean(deps.react || deps.vue || deps.vite || deps.next || deps.svelte || deps["@angular/core"])
          const devCmd = scripts.dev ? "pnpm run dev" : scripts.start ? "pnpm run start" : undefined

          if (isWeb) {
            detected.push({
              suggestedType: "web",
              name: entry.name,
              path: relPath,
              startCmd: devCmd,
              port: 5173,
            })
          } else {
            detected.push({
              suggestedType: "api",
              name: entry.name,
              path: relPath,
              startCmd: devCmd,
              port: 3000,
            })
          }
        } catch {
          // ignore malformed package.json
        }
      }
    }
  } catch {
    // ignore read errors
  }

  return detected
}

export type WizardEnvironment = {
  name: string
  url?: string
  description?: string
  scenarios?: string
  flows?: string
  results?: string
  env?: Record<string, string>
}

/**
 * Saves wizard components and environments directly to SQLite database.
 */
export function saveWizardComponentsToDb(
  db: DatabaseSync,
  components: WizardComponent[],
  options: {
    environment?: WizardEnvironment
    environments?: Record<string, { description?: string; url?: string; scenarios?: string; flows?: string; results?: string; env?: Record<string, string> }>
    defaultEnvironment?: string
  } = {},
): void {
  const selectedEnvName = options.defaultEnvironment || options.environment?.name || "dev"
  const envs = options.environments ?? (options.environment?.name ? { [options.environment.name]: options.environment } : {
    dev: {
      description: "Local development baseline",
      url: "http://localhost:5173",
      scenarios: ".e2e/scenarios",
      flows: ".e2e/flows",
      results: ".e2e/results",
      env: { APP_ENV: "dev" },
    },
  })

  for (const [envName, envData] of Object.entries(envs)) {
    saveEnvironment(
      db,
      envName,
      {
        description: envData.description,
        url: envData.url,
        scenarios: envData.scenarios || ".e2e/scenarios",
        flows: envData.flows || ".e2e/flows",
        results: envData.results || ".e2e/results",
        env: envData.env,
      },
      {
        isDefault: envName === selectedEnvName,
        isActive: envName === selectedEnvName,
      },
    )
  }

  for (const comp of components) {
    savePlatform(db, {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      orderNum: comp.order,
      url: comp.url,
      serviceName: comp.service || comp.name,
      health: comp.health,
      startCmd: comp.startCmd,
      cwd: comp.cwd,
      modules: comp.modules || (comp.type === "web" ? `.e2e/modules/${comp.name}` : undefined),
      slowMo: comp.slowMo,
      headless: comp.headless,
      appId: comp.appId,
      flows: comp.flows || (comp.type === "android" ? `.e2e/flows/${comp.name}` : undefined),
      installCmd: comp.installCmd,
      grantPermissions: comp.grantPermissions,
      reversePorts: comp.reversePorts,
      needs: comp.needs,
    })
  }
}

/**
 * Scaffolds starter folders and files under .e2e for newly configured components.
 */
export function scaffoldWizardFiles(
  projectDir: string,
  components: WizardComponent[],
): { created: string[]; skipped: string[] } {
  const rootDir = resolveProjectDir(projectDir)

  const created: string[] = []
  const skipped: string[] = []

  const writeFile = (relPath: string, content: string) => {
    const fullPath = join(rootDir, relPath)
    if (existsSync(fullPath)) {
      skipped.push(relPath)
      return
    }
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
    created.push(relPath)
  }

  // Scenarios directory & starter smoke test
  const smokeScenarioSteps: Array<{ name: string; target: string; [key: string]: unknown }> = []

  const sorted = [...components].sort((a, b) => a.order - b.order)
  for (const comp of sorted) {
    if (comp.type === "api") {
      smokeScenarioSteps.push({
        name: `verify ${comp.name} responds`,
        target: comp.name,
        url: comp.health || "/",
        assert: { status: 200 },
      })
    } else if (comp.type === "web") {
      smokeScenarioSteps.push({
        name: `load ${comp.name} home page`,
        target: comp.name,
        actions: [
          { action: "navigate", url: "/" },
          { action: "wait_for_load_state", value: "domcontentloaded" },
        ],
      })
    } else if (comp.type === "android") {
      smokeScenarioSteps.push({
        name: `launch ${comp.name} on device`,
        target: comp.name,
        launch: "fresh",
        actions: [{ action: "wait", ms: 2000 }],
      })
    }
  }

  // Write smoke scenario under .e2e/scenarios/smoke.json
  const smokeScenario = {
    $schema: scenarioSchemaRef(join(rootDir, ".e2e", "scenarios")),
    name: "Full Stack Smoke Journey",
    steps: smokeScenarioSteps.length > 0 ? smokeScenarioSteps : [{ name: "initial placeholder", target: "shell", command: "echo ok" }],
  }

  writeFile(".e2e/scenarios/smoke.json", `${JSON.stringify(smokeScenario, null, 2)}\n`)

  return { created, skipped }
}
