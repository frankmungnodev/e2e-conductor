import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { type LoadedConfig, type MobileTarget, resolveFromConfig, SHELL_TARGET } from "./config.ts"
import {
  type Assert,
  getScenarios,
  openDatabase,
  resolveDbPath,
  type Scenario,
  type Step,
  saveScenario,
} from "./db.ts"
import { checkFlow } from "./flow.ts"
import { describeErrors, validateScenario } from "./schema.ts"

export type { Assert, Scenario, Step }

/** Fields each driver accepts on top of the common step fields. */
const DRIVER_FIELDS: Record<string, string[]> = {
  http: ["method", "url", "headers", "body"],
  web: ["run", "params"],
  mobile: ["flow", "launch", "params"],
  shell: ["command", "cwd"],
}
const REQUIRED: Record<string, string> = { http: "url", web: "run", mobile: "flow", shell: "command" }
const COMMON = new Set(["id", "name", "target", "extract", "assert", "timeout_ms", "retry"])

function driverOf(config: LoadedConfig, target: string): string {
  if (target === SHELL_TARGET) return SHELL_TARGET
  const found = config.targets[target]
  if (!found) {
    throw new Error(`unknown target "${target}" (config has: ${[...Object.keys(config.targets), SHELL_TARGET].join(", ")})`)
  }
  return found.driver
}

/** Problems in the flow a mobile step names. `checked` holds flows already reported, so each is reported once. */
function checkStepFlow(config: LoadedConfig, step: Step, checked: Set<string>): string[] {
  const target = config.targets[step.target] as MobileTarget
  const file = join(resolveFromConfig(config, target.flows), step.flow as string)
  if (checked.has(file)) return []
  checked.add(file)
  if (!existsSync(file)) return [`flow not found: ${file}`]
  return checkFlow(file).map((problem) => `flow ${step.flow}: ${problem}`)
}

export function checkSteps(config: LoadedConfig, scenario: Scenario, checkedFlows: Set<string> = new Set()): string[] {
  const errors: string[] = []
  for (const fixture of scenario.setup ?? []) {
    if (!config.fixtures?.[fixture]) errors.push(`setup: unknown fixture "${fixture}"`)
  }
  scenario.steps.forEach((step, index) => {
    const where = `steps[${index}] "${step.name}"`
    let driver: string
    try {
      driver = driverOf(config, step.target)
    } catch (error) {
      errors.push(`${where}: ${(error as Error).message}`)
      return
    }
    const allowed = DRIVER_FIELDS[driver]
    for (const key of Object.keys(step)) {
      if (!COMMON.has(key) && !allowed.includes(key)) {
        errors.push(`${where}: "${key}" is not valid for a ${driver} target`)
      }
    }
    const hasRequired = step[REQUIRED[driver] as keyof Step] !== undefined || (driver === "mobile" && step.launch !== undefined)
    if (!hasRequired) {
      errors.push(`${where}: ${driver} step needs "${REQUIRED[driver]}"${driver === "mobile" ? ' or "launch"' : ""}`)
    }
    // A flow name with a placeholder is only known at run time; the mobile driver checks it then.
    if (driver === "mobile" && step.flow !== undefined && !step.flow.includes("${")) {
      for (const problem of checkStepFlow(config, step, checkedFlows)) errors.push(`${where}: ${problem}`)
    }
  })
  return errors
}

/**
 * Loads scenarios from the SQLite database. If the database exists but contains no
 * scenarios, seeds them by importing valid JSON scenarios from the filesystem.
 * Falls back to reading directly from the filesystem if the database does not exist.
 */
export function getOrSeedScenarios(config: LoadedConfig): Scenario[] {
  const dbPath = resolveDbPath(config.configDir)
  if (existsSync(dbPath)) {
    try {
      const db = openDatabase(dbPath)
      try {
        let dbScenarios = getScenarios(db)
        if (dbScenarios.length === 0) {
          const dir = resolveFromConfig(config, config.scenarios)
          if (existsSync(dir)) {
            const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort()
            for (const file of files) {
              try {
                const raw = JSON.parse(readFileSync(join(dir, file), "utf8"))
                const sc = { ...raw, id: basename(file, ".json") } as Scenario
                if (validateScenario(raw)) {
                  saveScenario(db, sc)
                }
              } catch {
                // ignore seeding error
              }
            }
            dbScenarios = getScenarios(db)
          }
        }
        if (dbScenarios.length > 0) {
          return dbScenarios
        }
      } finally {
        db.close()
      }
    } catch {
      // ignore db error, fall back to filesystem
    }
  }

  // Filesystem fallback
  const dir = resolveFromConfig(config, config.scenarios)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((file) => file.endsWith(".json")).sort()
  const list: Scenario[] = []
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8"))
      list.push({ ...raw, id: basename(file, ".json") } as Scenario)
    } catch {
      // ignore
    }
  }
  return list
}

export function loadScenarios(config: LoadedConfig, filters: string[] = []): Scenario[] {
  const all = getOrSeedScenarios(config)
  const filtered = all.filter((s) => filters.length === 0 || filters.some((filter) => s.id.includes(filter)))

  if (filtered.length === 0) {
    const dir = resolveFromConfig(config, config.scenarios)
    throw new Error(`No scenarios in ${dir}${filters.length ? ` matching ${filters.join(", ")}` : ""}`)
  }

  const problems: string[] = []
  const checkedFlows = new Set<string>()
  for (const scenario of filtered) {
    const label = `${scenario.id}.json`
    if (!validateScenario(scenario)) {
      for (const error of describeErrors(validateScenario.errors)) problems.push(`${label}: ${error}`)
    }
    for (const error of checkSteps(config, scenario, checkedFlows)) {
      problems.push(`${label}: ${error}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid scenarios:\n  ${problems.join("\n  ")}`)
  }
  return filtered
}

export function targetsUsed(scenarios: Scenario[]): Set<string> {
  return new Set(scenarios.flatMap((scenario) => scenario.steps.map((step) => step.target)))
}
