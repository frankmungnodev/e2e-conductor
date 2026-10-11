import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { type LoadedConfig, resolveFromConfig, SHELL_TARGET } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { type Assert, getScenarios, type Scenario, type Step, saveScenario } from "./db/scenarios.ts"
import { getSetting, setSetting } from "./db/settings.ts"
import { getStepPresets, type StepPreset, saveStepPreset } from "./db/step-presets.ts"
import { formatProblem, type Problem, problem } from "./problems.ts"
import { describeErrors, validateScenario } from "./schema.ts"
import {
  ACTIONS,
  actionFields,
  COMMON_STEP_FIELDS,
  DRIVER_STEP_FIELDS,
  type DriverName,
  findAction,
  REMOVED_FIELDS,
  STEP_NEEDS,
} from "./vocabulary.ts"

export type { Assert, Scenario, Step, StepPreset }

/** Settings keys recording that the one-time JSON import already ran for this database. */
const SCENARIOS_IMPORTED = "scenarios_imported_at"
const PRESETS_IMPORTED = "presets_imported_at"

function driverOf(config: LoadedConfig, target: string): DriverName | undefined {
  if (target === SHELL_TARGET) return SHELL_TARGET
  return config.targets[target]?.driver
}

/**
 * The base check: setup fixtures, targets, step and action fields, action names and removed fields.
 * It runs wherever a scenario is validated, next to the schema.
 */
export function checkSteps(config: LoadedConfig, scenario: Scenario): Problem[] {
  const problems: Problem[] = []
  const fixtures = Object.keys(config.fixtures ?? {})
  ;(scenario.setup ?? []).forEach((fixture, index) => {
    if (!config.fixtures?.[fixture]) {
      problems.push(
        problem("unknown-fixture", { pointer: `/setup/${index}`, message: `unknown fixture "${fixture}"`, value: fixture, allowed: fixtures }),
      )
    }
  })
  scenario.steps.forEach((step, stepIndex) => {
    const at = { stepIndex, stepName: step.name }
    const pointer = `/steps/${stepIndex}`
    const driver = driverOf(config, step.target)
    if (!driver) {
      const targets = [...Object.keys(config.targets), SHELL_TARGET]
      problems.push(
        problem("unknown-target", {
          ...at,
          pointer: `${pointer}/target`,
          message: `unknown target "${step.target}" (config has: ${targets.join(", ")})`,
          value: step.target,
          allowed: targets,
        }),
      )
      return
    }
    const stepFields = [...COMMON_STEP_FIELDS, ...DRIVER_STEP_FIELDS[driver]]
    for (const key of Object.keys(step)) {
      if (REMOVED_FIELDS[key]) {
        problems.push(problem("field-removed", { ...at, pointer: `${pointer}/${key}`, message: `"${key}": ${REMOVED_FIELDS[key]}`, value: key }))
      } else if (!stepFields.includes(key)) {
        problems.push(
          problem("field-not-allowed", {
            ...at,
            pointer: `${pointer}/${key}`,
            message: `"${key}" is not valid for a ${driver} target`,
            value: key,
            allowed: stepFields,
          }),
        )
      }
    }
    if (typeof step.action === "string") problems.push(...checkActionName(driver, step.action, { ...at, pointer: `${pointer}/action` }, ""))
    const fields = actionFields(driver)
    ;(Array.isArray(step.actions) ? step.actions : []).forEach((item, actionIndex) => {
      const actionPointer = `${pointer}/actions/${actionIndex}`
      const label = `actions[${actionIndex}]: `
      if (typeof item?.action === "string") {
        problems.push(...checkActionName(driver, item.action, { ...at, pointer: `${actionPointer}/action` }, label))
      }
      for (const key of Object.keys(item ?? {})) {
        if (REMOVED_FIELDS[key]) {
          problems.push(
            problem("field-removed", { ...at, pointer: `${actionPointer}/${key}`, message: `${label}"${key}": ${REMOVED_FIELDS[key]}`, value: key }),
          )
        } else if (!fields.includes(key)) {
          problems.push(
            problem("field-not-allowed", {
              ...at,
              pointer: `${actionPointer}/${key}`,
              message: `${label}"${key}" is not valid for a ${driver} action`,
              value: key,
              allowed: fields,
            }),
          )
        }
      }
    })
    const hasRequired =
      (step.actions !== undefined && step.actions.length > 0) ||
      (driver === "web" && step.action !== undefined) ||
      (driver === "mobile" && (step.action !== undefined || step.launch !== undefined)) ||
      (driver === "http" && step.url !== undefined) ||
      (driver === "shell" && step.command !== undefined)
    if (!hasRequired) {
      problems.push(problem("step-needs-action", { ...at, pointer, message: `${driver} step needs ${STEP_NEEDS[driver]}` }))
    }
  })
  return problems
}

/** An `unknown-action` problem when `driver` runs no action called `name`. */
function checkActionName(
  driver: DriverName,
  name: string,
  at: { stepIndex: number; stepName: string; pointer: string },
  label: string,
): Problem[] {
  if (findAction(driver, name)) return []
  const allowed = ACTIONS[driver].map((spec) => spec.name)
  return [problem("unknown-action", { ...at, message: `${label}unknown ${driver} action "${name}"`, value: name, allowed })]
}

/**
 * Loads scenarios from the SQLite database. The first time it opens a database, it imports
 * valid JSON scenarios from the scenarios folder whose ids the database does not have yet.
 * After that the database is the only source: saves and deletes never touch the JSON files.
 * Falls back to reading directly from the filesystem if the database does not exist, or if it
 * cannot be read unless `throwOnDbError` is set.
 */
export function getOrSeedScenarios(config: LoadedConfig, { throwOnDbError = false, keptOnly = false } = {}): Scenario[] {
  const dbPath = config.dbPath
  if (existsSync(dbPath)) {
    try {
      const dbScenarios = withDb(dbPath, (db) => {
        if (getSetting(db, SCENARIOS_IMPORTED) !== undefined) return getScenarios(db, { keptOnly })
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
        return getScenarios(db, { keptOnly })
      })
      return dbScenarios
    } catch (error) {
      if (throwOnDbError) throw error
      // otherwise fall back to the filesystem
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
    for (const found of checkSteps(config, scenario)) {
      problems.push(`${label}: ${formatProblem(found)}`)
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
 * Falls back to reading directly from the filesystem if the database does not exist, or if it
 * cannot be read unless `throwOnDbError` is set.
 */
export function getOrSeedPresets(config: LoadedConfig, { throwOnDbError = false } = {}): StepPreset[] {
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
    } catch (error) {
      if (throwOnDbError) throw error
      // otherwise fall back to disk
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
