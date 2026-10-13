import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * A project keeps the files its team shares in a visible, tracked folder, and the files that belong to
 * one machine (database, results, env files) in a hidden folder that ignores itself.
 */
export const SUITE_DIR = "e2e-suite"
export const LOCAL_DIR = ".e2e"

export const SUITE_SCENARIOS = `${SUITE_DIR}/scenarios`
export const SUITE_PRESETS = `${SUITE_DIR}/presets`
export const SUITE_AGENT = `${SUITE_DIR}/agent`

/**
 * Writes `.gitignore` with `*` into a local state folder that has none, so git ignores the folder and
 * the file itself without a rule in the project's own `.gitignore`. A file the person already has stays.
 */
export function ignoreLocalDir(dir: string): void {
  const file = join(dir, ".gitignore")
  if (existsSync(file)) return
  try {
    writeFileSync(file, "*\n")
  } catch {
    // Best effort: a read-only folder still works, it is only visible to git.
  }
}
