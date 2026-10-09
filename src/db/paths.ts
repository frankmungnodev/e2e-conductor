import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
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

const DEFAULT_DB_DIR = ".e2e"

const DEFAULT_DB_FILENAME = "e2e.db"

/** Resolves the root project directory from a directory path or database file path. */
export function resolveProjectDir(targetPath: string = process.cwd()): string {
  let rootDir = resolve(targetPath.trim() || process.cwd())
  if (rootDir.endsWith(".db") || rootDir.endsWith(".sqlite")) {
    rootDir = dirname(rootDir)
  }
  if (basename(rootDir) === ".e2e") {
    rootDir = dirname(rootDir)
  }
  return rootDir
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

  return resolve(configDir, DEFAULT_DB_DIR, DEFAULT_DB_FILENAME)
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
