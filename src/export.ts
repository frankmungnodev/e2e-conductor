import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type LoadedConfig, resolveFromConfig } from "./config.ts"
import { resolveDbPath } from "./db/paths.ts"
import { getOrSeedPresets, getOrSeedScenarios } from "./scenario.ts"

export type ExportResult = { scenarios: string[]; presets: string[] }

/**
 * Writes every scenario and step preset in SQLite to JSON files: scenarios to
 * `<scenarios folder>/<id>.json`, presets to `<config folder>/presets/<id>.json`. Existing files with
 * the same id are overwritten. Files for ids no longer in the database are left alone.
 */
export function exportToJson(config: LoadedConfig): ExportResult {
  const dbPath = resolveDbPath(config.configDir)
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath}`)

  // Reading through the loaders runs the one-time JSON import, so the export matches what the GUI shows.
  const scenarios = getOrSeedScenarios(config)
  const presets = getOrSeedPresets(config)
  const result: ExportResult = { scenarios: [], presets: [] }

  const scenariosDir = resolveFromConfig(config, config.scenarios)
  if (scenarios.length > 0) mkdirSync(scenariosDir, { recursive: true })
  for (const { id, ...content } of scenarios) {
    const file = join(scenariosDir, `${id}.json`)
    writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`)
    result.scenarios.push(file)
  }

  const presetsDir = join(config.configDir, "presets")
  if (presets.length > 0) mkdirSync(presetsDir, { recursive: true })
  for (const preset of presets) {
    const file = join(presetsDir, `${preset.id}.json`)
    writeFileSync(file, `${JSON.stringify(preset, null, 2)}\n`)
    result.presets.push(file)
  }

  return result
}
