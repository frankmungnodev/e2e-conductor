import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { type LoadedConfig, resolveFromConfig } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { getScenario, type Scenario, saveScenario } from "./db/scenarios.ts"
import { getOrSeedScenarios } from "./scenario.ts"
import { scenarioVersion } from "./scenario-version.ts"
import { describeErrors, validateScenario } from "./schema.ts"

export type ImportResult = {
  added: string[]
  updated: string[]
  unchanged: string[]
  invalid: { file: string; problems: string[] }[]
}

/**
 * Saves every `<scenarios folder>/*.json` file into SQLite, keyed by file name: a new id is added,
 * an existing one is replaced when the file differs. The file wins because importing is an explicit
 * request. Scenarios with no file are left alone, and invalid files are reported, never saved.
 * Steps keep their ids when the file has them (an export writes them), which keeps their run history.
 */
export function importFromJson(config: LoadedConfig): ImportResult {
  const dbPath = config.dbPath
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath}. Run "e2e init" first.`)
  // Run the one-time import first, so it never re-adds a file this import skipped as invalid.
  getOrSeedScenarios(config)

  const dir = resolveFromConfig(config, config.scenarios)
  const result: ImportResult = { added: [], updated: [], unchanged: [], invalid: [] }
  if (!existsSync(dir)) return result
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()

  withDb(dbPath, (db) => {
    for (const file of files) {
      const path = join(dir, file)
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(path, "utf8"))
      } catch (error) {
        result.invalid.push({ file: path, problems: [`not valid JSON: ${(error as Error).message}`] })
        continue
      }
      if (!validateScenario(raw)) {
        result.invalid.push({ file: path, problems: describeErrors(validateScenario.errors) })
        continue
      }
      const scenario = { ...(raw as Omit<Scenario, "id">), id: basename(file, ".json") } as Scenario
      const existing = getScenario(db, scenario.id)
      if (existing && sameScenario(existing, scenario)) {
        result.unchanged.push(scenario.id)
        continue
      }
      saveScenario(db, scenario)
      ;(existing ? result.updated : result.added).push(scenario.id)
    }
  })
  return result
}

/** A file step with no id matches any stored id, so re-importing a hand-written file changes nothing. */
function sameScenario(stored: Scenario, file: Scenario): boolean {
  return (
    stored.name === file.name &&
    (stored.description ?? "") === (file.description ?? "") &&
    file.steps.every((step, index) => !step.id || step.id === stored.steps[index]?.id) &&
    scenarioVersion(stored).fingerprint === scenarioVersion(file).fingerprint
  )
}
