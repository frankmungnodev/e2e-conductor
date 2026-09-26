import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

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

/**
 * Generates clean, formatted e2e.config.ts TypeScript code based on sorted wizard components.
 */
export function generateConfigCode(
  components: WizardComponent[],
  options: { scenariosDir?: string; resultsDir?: string } = {},
): string {
  // Sort components by run order
  const sorted = [...components].sort((a, b) => a.order - b.order)

  const scenariosDir = options.scenariosDir ?? "e2e/scenarios"
  const resultsDir = options.resultsDir ?? "e2e/results"

  const servicesEntries: string[] = []
  const targetsEntries: string[] = []

  for (const comp of sorted) {
    if (comp.type === "api") {
      // Backend / API service + http target
      const url = comp.url || "http://localhost:3000"
      const healthProp = comp.health ? `\n      health: "${comp.health}",` : ""
      let startProp = ""
      if (comp.startCmd) {
        const cwdPart = comp.cwd ? `cwd: "${comp.cwd}", ` : ""
        startProp = `\n      start: { ${cwdPart}cmd: "${comp.startCmd}" },`
      }

      servicesEntries.push(`    ${comp.name}: {
      url: "${url}",${healthProp}${startProp}
    },`)

      targetsEntries.push(`    ${comp.name}: {
      driver: "http",
      service: "${comp.name}",
    },`)
    } else if (comp.type === "web") {
      // Web SPA dev service (if startCmd or url) + web target
      const serviceName = comp.service || `${comp.name}_server`
      const url = comp.url || "http://localhost:5173"
      let startProp = ""
      if (comp.startCmd) {
        const cwdPart = comp.cwd ? `cwd: "${comp.cwd}", ` : ""
        startProp = `\n      start: { ${cwdPart}cmd: "${comp.startCmd}" },`
      }

      // If user specified dev server parameters, add as a service
      if (comp.startCmd || comp.url) {
        servicesEntries.push(`    ${serviceName}: {
      url: "${url}",${startProp}
    },`)
      }

      const modulesDir = comp.modules || `e2e/modules/${comp.name}`
      const slowMoProp = comp.slowMo ? `\n      slowMo: ${comp.slowMo},` : ""
      const headlessProp = comp.headless !== undefined ? `\n      headless: ${comp.headless},` : ""

      targetsEntries.push(`    ${comp.name}: {
      driver: "web",
      service: "${serviceName}",
      modules: "${modulesDir}",${slowMoProp}${headlessProp}
    },`)
    } else if (comp.type === "android") {
      // Mobile target (adb)
      const flowsDir = comp.flows || `e2e/flows/${comp.name}`
      const appId = comp.appId || "com.example.app"
      let installProp = ""
      if (comp.installCmd) {
        const cwdPart = comp.cwd ? `cwd: "${comp.cwd}", ` : ""
        installProp = `\n      install: { ${cwdPart}cmd: "${comp.installCmd}" },`
      }
      let reversePortsProp = ""
      if (comp.reversePorts && comp.reversePorts.length > 0) {
        reversePortsProp = `\n      reversePorts: [${comp.reversePorts.join(", ")}],`
      }
      let permissionsProp = ""
      if (comp.grantPermissions && comp.grantPermissions.length > 0) {
        permissionsProp = `\n      grantPermissions: ${JSON.stringify(comp.grantPermissions)},`
      }

      targetsEntries.push(`    ${comp.name}: {
      driver: "mobile",
      platform: "android",
      appId: "${appId}",
      flows: "${flowsDir}",${reversePortsProp}${installProp}${permissionsProp}
    },`)
    }
  }

  const servicesBlock =
    servicesEntries.length > 0
      ? `  services: {\n${servicesEntries.join("\n")}\n  },\n`
      : "  services: {},\n"

  const targetsBlock =
    targetsEntries.length > 0
      ? `  targets: {\n${targetsEntries.join("\n")}\n  },\n`
      : "  targets: {},\n"

  return `import { defineConfig } from "e2e-orchestrator"

/**
 * E2E Orchestrator Configuration
 * Generated via Setup Wizard
 * Components arranged in startup / execution run order.
 */
export default defineConfig({
${servicesBlock}${targetsBlock}  scenarios: "${scenariosDir}",
  results: "${resultsDir}",
})
`
}

/**
 * Scaffolds starter folders and files for newly configured components.
 */
export function scaffoldWizardFiles(
  configPath: string,
  components: WizardComponent[],
): { created: string[]; skipped: string[] } {
  const configDir = dirname(resolve(configPath))
  const created: string[] = []
  const skipped: string[] = []

  const writeFile = (relPath: string, content: string) => {
    const fullPath = join(configDir, relPath)
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
      const modulesDir = comp.modules || `e2e/modules/${comp.name}`
      const stepFile = `${modulesDir}/sample_step.ts`
      writeFile(
        stepFile,
        `import { defineWebStep } from "e2e-orchestrator"

export default defineWebStep(async ({ page, baseUrl, log }) => {
  log("Navigating to home page")
  await page.goto(baseUrl)
  await page.waitForLoadState("domcontentloaded")
  return { title: await page.title() }
})
`,
      )

      smokeScenarioSteps.push({
        name: `load ${comp.name} home page`,
        target: comp.name,
        run: "sample_step",
      })
    } else if (comp.type === "android") {
      const flowsDir = comp.flows || `e2e/flows/${comp.name}`
      const flowFile = `${flowsDir}/smoke.yaml`
      writeFile(
        flowFile,
        `# Starter Android Mobile Flow for ${comp.name}
- launch
- wait: 2000
`,
      )

      smokeScenarioSteps.push({
        name: `launch ${comp.name} on device`,
        target: comp.name,
        flow: "smoke",
      })
    }
  }

  // Write smoke scenario
  const smokeScenario = {
    $schema: "../../node_modules/e2e-orchestrator/schema/v1/scenario.schema.json",
    name: "Full Stack Smoke Journey",
    steps: smokeScenarioSteps.length > 0 ? smokeScenarioSteps : [{ name: "initial placeholder", target: "shell", cmd: "echo ok" }],
  }

  writeFile("e2e/scenarios/smoke.json", `${JSON.stringify(smokeScenario, null, 2)}\n`)

  return { created, skipped }
}
