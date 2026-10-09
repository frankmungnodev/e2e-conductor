import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { type LoadedConfig, resolveFromConfig, SHELL_TARGET } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { type Assert, getScenarios, type Scenario, type Step, saveScenario } from "./db/scenarios.ts"
import { getSetting, setSetting } from "./db/settings.ts"
import { getStepPresets, type StepPreset, saveStepPreset } from "./db/step-presets.ts"
import { describeErrors, validateScenario } from "./schema.ts"

export type { Assert, Scenario, Step, StepPreset }

/** Settings keys recording that the one-time JSON import already ran for this database. */
const SCENARIOS_IMPORTED = "scenarios_imported_at"
const PRESETS_IMPORTED = "presets_imported_at"

/** Fields each driver accepts on top of the common step fields. */
const DRIVER_FIELDS: Record<string, string[]> = {
  http: ["actions", "method", "url", "headers", "body"],
  web: ["actions", "action", "selector", "target_selector", "value", "key", "url", "ms", "width", "height"],
  mobile: ["actions", "action", "selector", "value", "key", "ms", "launch"],
  shell: ["actions", "command", "cwd"],
}
/** Fields older versions ran and the drivers no longer do: a step that has one would fail at run time. */
const REMOVED_FIELDS: Record<string, string> = {
  run: 'web modules are no longer run; write the step as "actions"',
  flow: 'YAML flows are no longer run; write the step as "actions"',
  params: '"params" only fed web modules and YAML flows, which are no longer run',
}
const NEEDS: Record<string, string> = {
  http: '"actions" or "url"',
  web: '"actions" or "action"',
  mobile: '"actions", "action", or "launch"',
  shell: '"actions" or "command"',
}
const COMMON = new Set(["id", "name", "target", "extract", "assert", "timeout_ms", "retry"])

function driverOf(config: LoadedConfig, target: string): string {
  if (target === SHELL_TARGET) return SHELL_TARGET
  const found = config.targets[target]
  if (!found) {
    throw new Error(`unknown target "${target}" (config has: ${[...Object.keys(config.targets), SHELL_TARGET].join(", ")})`)
  }
  return found.driver
}

export function checkSteps(config: LoadedConfig, scenario: Scenario): string[] {
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
      if (REMOVED_FIELDS[key]) errors.push(`${where}: "${key}": ${REMOVED_FIELDS[key]}`)
      else if (!COMMON.has(key) && !allowed.includes(key)) {
        errors.push(`${where}: "${key}" is not valid for a ${driver} target`)
      }
    }
    const hasRequired =
      (step.actions !== undefined && step.actions.length > 0) ||
      (driver === "web" && step.action !== undefined) ||
      (driver === "mobile" && (step.action !== undefined || step.launch !== undefined)) ||
      (driver === "http" && step.url !== undefined) ||
      (driver === "shell" && step.command !== undefined)
    if (!hasRequired) errors.push(`${where}: ${driver} step needs ${NEEDS[driver]}`)
  })
  return errors
}

/**
 * Loads scenarios from the SQLite database. The first time it opens a database, it imports
 * valid JSON scenarios from the scenarios folder whose ids the database does not have yet.
 * After that the database is the only source: saves and deletes never touch the JSON files.
 * Falls back to reading directly from the filesystem if the database does not exist.
 */
export function getOrSeedScenarios(config: LoadedConfig): Scenario[] {
  const dbPath = config.dbPath
  if (existsSync(dbPath)) {
    try {
      const dbScenarios = withDb(dbPath, (db) => {
        if (getSetting(db, SCENARIOS_IMPORTED) !== undefined) return getScenarios(db)
        const dir = resolveFromConfig(config, config.scenarios)
        const known = new Set(getScenarios(db).map((scenario) => scenario.id))
        const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")).sort() : []
        for (const file of files) {
          try {
            const raw = JSON.parse(readFileSync(join(dir, file), "utf8"))
            const sc = { ...raw, id: basename(file, ".json") } as Scenario
            if (!known.has(sc.id) && validateScenario(raw)) {
              saveScenario(db, sc)
            }
          } catch {
            // ignore seeding error
          }
        }
        setSetting(db, SCENARIOS_IMPORTED, new Date().toISOString())
        return getScenarios(db)
      })
      return dbScenarios
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
  for (const scenario of filtered) {
    const label = `${scenario.id}.json`
    if (!validateScenario(scenario)) {
      for (const error of describeErrors(validateScenario.errors)) problems.push(`${label}: ${error}`)
    }
    for (const error of checkSteps(config, scenario)) {
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

/**
 * Loads step presets from the SQLite database. The first time it opens a database, it imports
 * JSON presets from .e2e/presets/*.json whose ids the database does not have yet.
 * After that the database is the only source: saves and deletes never touch the JSON files.
 * Falls back to reading directly from the filesystem if the database does not exist.
 */
export function getOrSeedPresets(config: LoadedConfig): StepPreset[] {
  const dbPath = config.dbPath
  const presetsDir = join(config.configDir, "presets")

  if (existsSync(dbPath)) {
    try {
      const presets = withDb(dbPath, (db) => {
        if (getSetting(db, PRESETS_IMPORTED) !== undefined) return getStepPresets(db)
        const known = new Set(getStepPresets(db).map((preset) => preset.id))
        const files = existsSync(presetsDir) ? readdirSync(presetsDir).filter((file) => file.endsWith(".json")).sort() : []
        for (const file of files) {
          try {
            const raw = JSON.parse(readFileSync(join(presetsDir, file), "utf8"))
            const id = raw.id || basename(file, ".json")
            if (known.has(id)) continue
            const preset: StepPreset = {
              id,
              name: raw.name || id,
              description: raw.description,
              target: raw.target || raw.step?.target || "web",
              step: raw.step || { name: raw.name || id, target: raw.target || "web", actions: raw.actions },
            }
            saveStepPreset(db, preset)
          } catch {
            // ignore preset seed errors
          }
        }
        setSetting(db, PRESETS_IMPORTED, new Date().toISOString())
        return getStepPresets(db)
      })
      return presets
    } catch {
      // fallback to disk
    }
  }

  if (!existsSync(presetsDir)) return []
  const files = readdirSync(presetsDir).filter((file) => file.endsWith(".json")).sort()
  const list: StepPreset[] = []
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(presetsDir, file), "utf8"))
      const id = raw.id || basename(file, ".json")
      list.push({
        id,
        name: raw.name || id,
        description: raw.description,
        target: raw.target || raw.step?.target || "web",
        step: raw.step || { name: raw.name || id, target: raw.target || "web", actions: raw.actions },
      })
    } catch {
      // ignore
    }
  }
  return list
}
