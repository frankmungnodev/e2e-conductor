import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { type LoadedConfig, resolveFromConfig } from "./config.ts"
import { getOrSeedPresets, getOrSeedScenarios } from "./scenario.ts"
import { sortKeys } from "./scenario-version.ts"

export type ExportResult = { scenarios: string[]; presets: string[] }

export type ExportDrift = {
  /** In SQLite, no file yet. */
  missing: string[]
  /** The file holds different content than SQLite, or is not valid JSON. */
  changed: string[]
  /** A file for an id SQLite no longer has. An export leaves it in place, so it must be deleted by hand. */
  stale: string[]
}

type PlannedFile = { file: string; content: unknown }

/**
 * Writes every kept scenario and step preset in SQLite to JSON files: scenarios to
 * `<scenarios folder>/<id>.json`, presets to `<config folder>/presets/<id>.json`. Existing files with
 * the same id are overwritten. Files for ids no longer in the database are left alone. Drafts and draft
 * revisions are never written: they live only in SQLite until the person keeps them.
 */
export function exportToJson(config: LoadedConfig): ExportResult {
  const { scenarios, presets } = planExport(config)
  for (const { file, content } of [...scenarios, ...presets]) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`)
  }
  return { scenarios: scenarios.map(({ file }) => file), presets: presets.map(({ file }) => file) }
}

/**
 * Compares the JSON files with what an export would write, without writing anything. Whitespace and
 * key order are ignored; everything else, including a step name or a missing step id, is a change.
 */
export function checkExport(config: LoadedConfig): ExportDrift {
  const { scenarios, presets } = planExport(config)
  const drift: ExportDrift = { missing: [], changed: [], stale: [] }
  for (const { file, content } of [...scenarios, ...presets]) {
    if (!existsSync(file)) drift.missing.push(file)
    else if (!sameJson(readFileSync(file, "utf8"), content)) drift.changed.push(file)
  }
  drift.stale.push(
    ...staleFiles(resolveFromConfig(config, config.scenarios), scenarios),
    ...staleFiles(join(config.configDir, "presets"), presets),
  )
  return drift
}

function planExport(config: LoadedConfig): { scenarios: PlannedFile[]; presets: PlannedFile[] } {
  const dbPath = config.dbPath
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath}`)

  // Reading through the loaders runs the one-time JSON import, so the export matches what the GUI shows.
  // A database error must surface: the loaders' fallback reads the JSON files, and a check would then
  // compare each file with itself and report no drift.
  const scenariosDir = resolveFromConfig(config, config.scenarios)
  const presetsDir = join(config.configDir, "presets")
  return {
    scenarios: getOrSeedScenarios(config, { throwOnDbError: true, keptOnly: true }).map(({ id, ...content }) => ({ file: join(scenariosDir, `${id}.json`), content })),
    presets: getOrSeedPresets(config, { throwOnDbError: true }).map((preset) => ({ file: join(presetsDir, `${preset.id}.json`), content: preset })),
  }
}

function staleFiles(dir: string, planned: PlannedFile[]): string[] {
  if (!existsSync(dir)) return []
  const expected = new Set(planned.map(({ file }) => file))
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name))
    .filter((file) => !expected.has(file))
}

function sameJson(text: string, content: unknown): boolean {
  try {
    // A round trip drops undefined fields, as writing the file would.
    return JSON.stringify(sortKeys(JSON.parse(text))) === JSON.stringify(sortKeys(JSON.parse(JSON.stringify(content))))
  } catch {
    return false
  }
}
