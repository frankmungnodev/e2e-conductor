import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { LOCAL_DIR, SUITE_DIR } from "../project-layout.ts"
import { withDb } from "./connection.ts"

export type DbStatus = {
  dbExists: boolean
  dbPath: string
  relativeDbPath: string
  hasEnvironments: boolean
  environmentsCount: number
  platformsCount: number
}

const POINTER_FILE = ".e2e-db"

const DEFAULT_DB_FILENAME = "e2e.db"

/** Resolves the root project directory from a directory path or database file path. */
export function resolveProjectDir(targetPath: string = process.cwd()): string {
  let rootDir = resolve(targetPath.trim() || process.cwd())
  if (rootDir.endsWith(".db") || rootDir.endsWith(".sqlite")) {
    rootDir = dirname(rootDir)
  }
  if (basename(rootDir) === LOCAL_DIR) {
    rootDir = dirname(rootDir)
  }
  return rootDir
}

/**
 * The project path and chosen database for the CLI's --dir, --config and --db. The project path is
 * what `loadConfig` takes. A --db file is used as is: it belongs to the project of the `.e2e` folder it
 * sits in, and any other --db file runs against --dir/--config or the current folder. A --db directory
 * names a project, as it did before --db reached every read.
 */
export function resolveCliPaths(
  options: { dir?: string; config?: string; db?: string },
  cwd: string = process.cwd(),
): { projectPath: string; dbPath?: string } {
  const db = options.db?.trim() ? resolve(cwd, options.db.trim()) : undefined
  const dbIsFile = db !== undefined && (db.endsWith(".db") || db.endsWith(".sqlite"))
  const named = options.dir?.trim() || options.config?.trim()
  const dbNamesProject = db !== undefined && (!dbIsFile || basename(dirname(db)) === LOCAL_DIR)
  const projectPath = named ? resolve(cwd, named) : dbNamesProject && db ? db : cwd
  const dbPath = dbIsFile ? db : db ? resolveDbPath(resolveProjectDir(db)) : undefined
  return { projectPath, dbPath }
}

/**
 * The nearest folder, from `start` upward, that holds a `.e2e` or `e2e-suite` folder: the project `e2e save`
 * works in, so an agent can run it from anywhere in the repo, including a fresh clone that has no `.e2e` yet.
 * Undefined when no folder up to the root has either.
 */
export function findProjectDir(start: string): string | undefined {
  let dir = resolve(start)
  while (true) {
    if ([LOCAL_DIR, SUITE_DIR].some((folder) => statSync(join(dir, folder), { throwIfNoEntry: false })?.isDirectory())) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function resolveDbPath(configDir: string, customPath?: string): string {
  if (customPath?.trim()) {
    const trimmed = customPath.trim()
    let resolved = isAbsolute(trimmed) ? trimmed : resolve(configDir, trimmed)
    if (!resolved.endsWith(".db") && !resolved.endsWith(".sqlite")) {
      resolved = join(resolved, DEFAULT_DB_FILENAME)
    }
    return resolved
  }

  if (process.env.E2E_DB_PATH) {
    const envPath = process.env.E2E_DB_PATH.trim()
    return isAbsolute(envPath) ? envPath : resolve(configDir, envPath)
  }

  const pointerPath = join(configDir, POINTER_FILE)
  if (existsSync(pointerPath)) {
    try {
      const stored = readFileSync(pointerPath, "utf8").trim()
      if (stored) {
        return isAbsolute(stored) ? stored : resolve(configDir, stored)
      }
    } catch {
      // Ignore read errors
    }
  }

  return resolve(configDir, LOCAL_DIR, DEFAULT_DB_FILENAME)
}

export function writeDbPointer(configDir: string, dbPath: string): void {
  try {
    const pointerPath = join(configDir, POINTER_FILE)
    const rel = relative(configDir, dbPath)
    writeFileSync(pointerPath, rel, "utf8")
  } catch {
    // Ignore pointer write errors
  }
}

export function checkDbStatus(configDir: string, chosenDbPath?: string): DbStatus {
  const dbPath = chosenDbPath ?? resolveDbPath(configDir)
  const relativeDbPath = relative(configDir, dbPath)
  const exists = existsSync(dbPath)

  if (!exists) {
    return {
      dbExists: false,
      dbPath,
      relativeDbPath,
      hasEnvironments: false,
      environmentsCount: 0,
      platformsCount: 0,
    }
  }

  try {
    const { envCount, platCount } = withDb(dbPath, (db) => {
      const envCountRow = db.prepare("SELECT COUNT(*) as cnt FROM environments").get() as { cnt: number } | undefined
      const platCountRow = db.prepare("SELECT COUNT(*) as cnt FROM platforms").get() as { cnt: number } | undefined
      return { envCount: Number(envCountRow?.cnt ?? 0), platCount: Number(platCountRow?.cnt ?? 0) }
    })

    return {
      dbExists: true,
      dbPath,
      relativeDbPath,
      hasEnvironments: envCount > 0,
      environmentsCount: envCount,
      platformsCount: platCount,
    }
  } catch {
    return {
      dbExists: false,
      dbPath,
      relativeDbPath,
      hasEnvironments: false,
      environmentsCount: 0,
      platformsCount: 0,
    }
  }
}
