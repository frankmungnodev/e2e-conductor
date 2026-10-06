import type { DatabaseSync } from "node:sqlite"
import type { EnvironmentConfig, ServiceConfig } from "../config.ts"
import { safeJsonParse } from "./connection.ts"
import { getPlatformsForEnv, linkPlatform } from "./env-platforms.ts"
import { platformsToTargetsAndServices } from "./platforms.ts"
import { deleteSetting, getSetting, setSetting } from "./settings.ts"

export function getEnvironments(db: DatabaseSync): Record<string, EnvironmentConfig> {
  const rows = db.prepare("SELECT * FROM environments ORDER BY name ASC").all() as Array<{
    name: string
    description?: string | null
    url?: string | null
    scenarios?: string | null
    flows?: string | null
    results?: string | null
    env_vars?: string | null
  }>

  const environments: Record<string, EnvironmentConfig> = {}
  for (const row of rows) {
    const envObj = safeJsonParse<Record<string, string>>(row.env_vars)

    // Attach services from env_platform overrides
    let services: Record<string, ServiceConfig> | undefined
    try {
      const envPlatforms = getPlatformsForEnv(db, row.name)
      const platRes = platformsToTargetsAndServices(envPlatforms)
      if (Object.keys(platRes.services).length > 0) {
        services = platRes.services
      }
    } catch {
      // ignore
    }

    environments[row.name] = {
      description: row.description || undefined,
      url: row.url || undefined,
      scenarios: row.scenarios || undefined,
      flows: row.flows || undefined,
      results: row.results || undefined,
      env: envObj,
      services,
    }
  }

  return environments
}

export function saveEnvironment(
  db: DatabaseSync,
  name: string,
  data: Partial<EnvironmentConfig>,
  options?: { isDefault?: boolean; isActive?: boolean },
): void {
  const now = Date.now()
  const envVars = data.env ? JSON.stringify(data.env) : null

  const existing = db.prepare("SELECT is_default, is_active FROM environments WHERE name = ?").get(name) as
    | { is_default: number; is_active: number }
    | undefined

  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM environments").get() as { cnt: number } | undefined
  const isFirst = (countRow?.cnt ?? 0) === 0

  const isDefault = options?.isDefault !== undefined ? (options.isDefault ? 1 : 0) : existing?.is_default ?? (isFirst ? 1 : 0)
  const isActive = options?.isActive !== undefined ? (options.isActive ? 1 : 0) : existing?.is_active ?? (isFirst ? 1 : 0)

  if (isActive === 1) {
    db.prepare("UPDATE environments SET is_active = 0").run()
    setSetting(db, "active_environment", name)
  }

  if (isDefault === 1) {
    db.prepare("UPDATE environments SET is_default = 0").run()
    setSetting(db, "default_environment", name)
  }

  db.prepare(`
    INSERT INTO environments (
      name, description, url, scenarios, flows, results, env_vars, is_default, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      url = excluded.url,
      scenarios = excluded.scenarios,
      flows = excluded.flows,
      results = excluded.results,
      env_vars = excluded.env_vars,
      is_default = excluded.is_default,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).run(
    name,
    data.description || null,
    data.url || null,
    data.scenarios || null,
    data.flows || null,
    data.results || null,
    envVars,
    isDefault,
    isActive,
    now,
    now,
  )

  // Link every existing platform, inheriting all of its fields
  const platRows = db.prepare("SELECT id FROM platforms").all() as Array<{ id: string }>
  for (const p of platRows) linkPlatform(db, name, p.id, now)
}

export function deleteEnvironment(db: DatabaseSync, name: string): void {
  db.prepare("DELETE FROM env_platform WHERE env_name = ?").run(name)
  db.prepare("DELETE FROM environments WHERE name = ?").run(name)

  const active = getActiveEnvironment(db)
  if (active === name) {
    const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
    if (first) {
      setActiveEnvironment(db, first.name)
    } else {
      deleteSetting(db, "active_environment")
    }
  }

  const def = getDefaultEnvironment(db)
  if (def === name) {
    const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
    if (first) {
      setDefaultEnvironment(db, first.name)
    } else {
      deleteSetting(db, "default_environment")
    }
  }
}

export function getActiveEnvironment(db: DatabaseSync): string | undefined {
  const setting = getSetting(db, "active_environment")
  if (setting) return setting

  const row = db.prepare("SELECT name FROM environments WHERE is_active = 1 LIMIT 1").get() as { name: string } | undefined
  if (row?.name) return row.name

  const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
  return first?.name
}

export function setActiveEnvironment(db: DatabaseSync, name: string): void {
  db.prepare("UPDATE environments SET is_active = CASE WHEN name = ? THEN 1 ELSE 0 END").run(name)
  setSetting(db, "active_environment", name)
}

export function getDefaultEnvironment(db: DatabaseSync): string | undefined {
  const setting = getSetting(db, "default_environment")
  if (setting) return setting

  const row = db.prepare("SELECT name FROM environments WHERE is_default = 1 LIMIT 1").get() as { name: string } | undefined
  if (row?.name) return row.name

  const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
  return first?.name
}

export function setDefaultEnvironment(db: DatabaseSync, name: string): void {
  db.prepare("UPDATE environments SET is_default = CASE WHEN name = ? THEN 1 ELSE 0 END").run(name)
  setSetting(db, "default_environment", name)
}
