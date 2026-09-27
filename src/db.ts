import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { EnvironmentConfig, HttpTarget, MobileTarget, ServiceConfig, TargetConfig, WebTarget } from "./config.ts"

export type PlatformRecord = {
  id: string
  name: string
  type: "web" | "android" | "api"
  orderNum?: number
  url?: string
  serviceName?: string
  health?: string
  startCmd?: string
  cwd?: string
  modules?: string
  slowMo?: number
  headless?: boolean
  exclusive?: boolean
  appId?: string
  flows?: string
  installCmd?: string
  grantPermissions?: string[]
  reversePorts?: number[]
  configJson?: Record<string, unknown>
}

export type EnvPlatformRecord = {
  envName: string
  platformId: string
  enabled: boolean
  url?: string
  health?: string
  startCmd?: string
  cwd?: string
  headless?: boolean
  slowMo?: number
  appId?: string
  configJson?: Record<string, unknown>
}

export type PlatformWithEnvOverrides = PlatformRecord & {
  envName: string
  enabled: boolean
  isLinked: boolean
  hasOverrides: boolean
  overriddenFields: string[]
}

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

export function openDatabase(dbPath: string): DatabaseSync {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new DatabaseSync(dbPath)

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS environments (
      name TEXT PRIMARY KEY,
      description TEXT,
      url TEXT,
      scenarios TEXT,
      flows TEXT,
      results TEXT,
      env_vars TEXT,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      order_num INTEGER DEFAULT 1,
      url TEXT,
      service_name TEXT,
      health TEXT,
      start_cmd TEXT,
      cwd TEXT,
      modules TEXT,
      slow_mo INTEGER,
      headless INTEGER DEFAULT 0,
      exclusive INTEGER DEFAULT 0,
      app_id TEXT,
      flows TEXT,
      install_cmd TEXT,
      grant_permissions TEXT,
      reverse_ports TEXT,
      config_json TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS env_platform (
      env_name TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      url TEXT,
      health TEXT,
      start_cmd TEXT,
      cwd TEXT,
      headless INTEGER,
      slow_mo INTEGER,
      app_id TEXT,
      config_json TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (env_name, platform_id)
    );

    CREATE TABLE IF NOT EXISTS fixtures (
      name TEXT PRIMARY KEY,
      cmd TEXT NOT NULL,
      cwd TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
  `)

  // Backfill env_platform if it's empty but platforms and environments exist
  try {
    const epCountRow = db.prepare("SELECT COUNT(*) as cnt FROM env_platform").get() as { cnt: number } | undefined
    if ((epCountRow?.cnt ?? 0) === 0) {
      const envRows = db.prepare("SELECT name FROM environments").all() as Array<{ name: string }>
      const platRows = db.prepare("SELECT * FROM platforms").all() as Array<{
        id: string
        url?: string | null
        health?: string | null
        start_cmd?: string | null
        cwd?: string | null
        headless?: number | null
        slow_mo?: number | null
        app_id?: string | null
        config_json?: string | null
      }>

      if (envRows.length > 0 && platRows.length > 0) {
        const now = Date.now()
        for (const env of envRows) {
          for (const p of platRows) {
            db.prepare(`
              INSERT OR IGNORE INTO env_platform (
                env_name, platform_id, enabled, url, health, start_cmd, cwd, headless, slow_mo, app_id, config_json, created_at, updated_at
              ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              env.name,
              p.id,
              p.url || null,
              p.health || null,
              p.start_cmd || null,
              p.cwd || null,
              p.headless ?? 0,
              p.slow_mo ?? null,
              p.app_id || null,
              p.config_json || null,
              now,
              now,
            )
          }
        }
      }
    }
  } catch {
    // Ignore migration backfill errors
  }

  return db
}

export function checkDbStatus(configDir: string): DbStatus {
  const dbPath = resolveDbPath(configDir)
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
    const db = openDatabase(dbPath)
    const envCountRow = db.prepare("SELECT COUNT(*) as cnt FROM environments").get() as { cnt: number } | undefined
    const platCountRow = db.prepare("SELECT COUNT(*) as cnt FROM platforms").get() as { cnt: number } | undefined
    const envCount = Number(envCountRow?.cnt ?? 0)
    const platCount = Number(platCountRow?.cnt ?? 0)
    db.close()

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
    let envObj: Record<string, string> | undefined
    if (row.env_vars) {
      try {
        envObj = JSON.parse(row.env_vars)
      } catch {
        // ignore JSON parse error
      }
    }

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
    db.prepare("INSERT INTO settings (key, value) VALUES ('active_environment', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(name)
  }

  if (isDefault === 1) {
    db.prepare("UPDATE environments SET is_default = 0").run()
    db.prepare("INSERT INTO settings (key, value) VALUES ('default_environment', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(name)
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

  // Seed env_platform links for all existing platforms
  try {
    const platRows = db.prepare("SELECT * FROM platforms").all() as Array<{
      id: string
      url?: string | null
      health?: string | null
      start_cmd?: string | null
      cwd?: string | null
      headless?: number | null
      slow_mo?: number | null
      app_id?: string | null
      config_json?: string | null
    }>

    for (const p of platRows) {
      const existingLink = db.prepare("SELECT 1 FROM env_platform WHERE env_name = ? AND platform_id = ?").get(name, p.id)
      if (!existingLink) {
        db.prepare(`
          INSERT INTO env_platform (
            env_name, platform_id, enabled, url, health, start_cmd, cwd, headless, slow_mo, app_id, config_json, created_at, updated_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          name,
          p.id,
          p.url || null,
          p.health || null,
          p.start_cmd || null,
          p.cwd || null,
          p.headless ?? 0,
          p.slow_mo ?? null,
          p.app_id || null,
          p.config_json || null,
          now,
          now,
        )
      }
    }
  } catch {
    // ignore
  }
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
      db.prepare("DELETE FROM settings WHERE key = 'active_environment'").run()
    }
  }

  const def = getDefaultEnvironment(db)
  if (def === name) {
    const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
    if (first) {
      setDefaultEnvironment(db, first.name)
    } else {
      db.prepare("DELETE FROM settings WHERE key = 'default_environment'").run()
    }
  }
}

export function getActiveEnvironment(db: DatabaseSync): string | undefined {
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'active_environment'").get() as { value: string } | undefined
  if (setting?.value) return setting.value

  const row = db.prepare("SELECT name FROM environments WHERE is_active = 1 LIMIT 1").get() as { name: string } | undefined
  if (row?.name) return row.name

  const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
  return first?.name
}

export function setActiveEnvironment(db: DatabaseSync, name: string): void {
  db.prepare("UPDATE environments SET is_active = CASE WHEN name = ? THEN 1 ELSE 0 END").run(name)
  db.prepare("INSERT INTO settings (key, value) VALUES ('active_environment', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(name)
}

export function getDefaultEnvironment(db: DatabaseSync): string | undefined {
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'default_environment'").get() as { value: string } | undefined
  if (setting?.value) return setting.value

  const row = db.prepare("SELECT name FROM environments WHERE is_default = 1 LIMIT 1").get() as { name: string } | undefined
  if (row?.name) return row.name

  const first = db.prepare("SELECT name FROM environments ORDER BY name ASC LIMIT 1").get() as { name: string } | undefined
  return first?.name
}

export function setDefaultEnvironment(db: DatabaseSync, name: string): void {
  db.prepare("UPDATE environments SET is_default = CASE WHEN name = ? THEN 1 ELSE 0 END").run(name)
  db.prepare("INSERT INTO settings (key, value) VALUES ('default_environment', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(name)
}

export function getPlatforms(db: DatabaseSync): PlatformRecord[] {
  const rows = db.prepare("SELECT * FROM platforms ORDER BY order_num ASC, name ASC").all() as Array<{
    id: string
    name: string
    type: "web" | "android" | "api"
    order_num?: number | null
    url?: string | null
    service_name?: string | null
    health?: string | null
    start_cmd?: string | null
    cwd?: string | null
    modules?: string | null
    slow_mo?: number | null
    headless?: number | null
    exclusive?: number | null
    app_id?: string | null
    flows?: string | null
    install_cmd?: string | null
    grant_permissions?: string | null
    reverse_ports?: string | null
    config_json?: string | null
  }>

  return rows.map((r) => {
    let grantPermissions: string[] | undefined
    let reversePorts: number[] | undefined
    let configJson: Record<string, unknown> | undefined

    if (r.grant_permissions) {
      try {
        grantPermissions = JSON.parse(r.grant_permissions)
      } catch {
        // ignore
      }
    }
    if (r.reverse_ports) {
      try {
        reversePorts = JSON.parse(r.reverse_ports)
      } catch {
        // ignore
      }
    }
    if (r.config_json) {
      try {
        configJson = JSON.parse(r.config_json)
      } catch {
        // ignore
      }
    }

    return {
      id: r.id,
      name: r.name,
      type: r.type,
      orderNum: r.order_num ?? 1,
      url: r.url || undefined,
      serviceName: r.service_name || undefined,
      health: r.health || undefined,
      startCmd: r.start_cmd || undefined,
      cwd: r.cwd || undefined,
      modules: r.modules || undefined,
      slowMo: r.slow_mo ?? undefined,
      headless: r.headless === 1,
      exclusive: r.exclusive === 1,
      appId: r.app_id || undefined,
      flows: r.flows || undefined,
      installCmd: r.install_cmd || undefined,
      grantPermissions,
      reversePorts,
      configJson,
    }
  })
}

export function savePlatform(db: DatabaseSync, platform: PlatformRecord): void {
  const now = Date.now()
  const grantPermsJson = platform.grantPermissions ? JSON.stringify(platform.grantPermissions) : null
  const reversePortsJson = platform.reversePorts ? JSON.stringify(platform.reversePorts) : null
  const configJson = platform.configJson ? JSON.stringify(platform.configJson) : null

  db.prepare(`
    INSERT INTO platforms (
      id, name, type, order_num, url, service_name, health, start_cmd, cwd,
      modules, slow_mo, headless, exclusive, app_id, flows, install_cmd,
      grant_permissions, reverse_ports, config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      type = excluded.type,
      order_num = excluded.order_num,
      url = excluded.url,
      service_name = excluded.service_name,
      health = excluded.health,
      start_cmd = excluded.start_cmd,
      cwd = excluded.cwd,
      modules = excluded.modules,
      slow_mo = excluded.slow_mo,
      headless = excluded.headless,
      exclusive = excluded.exclusive,
      app_id = excluded.app_id,
      flows = excluded.flows,
      install_cmd = excluded.install_cmd,
      grant_permissions = excluded.grant_permissions,
      reverse_ports = excluded.reverse_ports,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).run(
    platform.id,
    platform.name,
    platform.type,
    platform.orderNum ?? 1,
    platform.url || null,
    platform.serviceName || platform.name,
    platform.health || null,
    platform.startCmd || null,
    platform.cwd || null,
    platform.modules || null,
    platform.slowMo ?? null,
    platform.headless ? 1 : 0,
    platform.exclusive ? 1 : 0,
    platform.appId || null,
    platform.flows || null,
    platform.installCmd || null,
    grantPermsJson,
    reversePortsJson,
    configJson,
    now,
    now,
  )

  // Seed env_platform links for all existing environments
  try {
    const envRows = db.prepare("SELECT name FROM environments").all() as Array<{ name: string }>
    for (const env of envRows) {
      const existingLink = db.prepare("SELECT 1 FROM env_platform WHERE env_name = ? AND platform_id = ?").get(env.name, platform.id)
      if (!existingLink) {
        db.prepare(`
          INSERT INTO env_platform (
            env_name, platform_id, enabled, url, health, start_cmd, cwd, headless, slow_mo, app_id, config_json, created_at, updated_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          env.name,
          platform.id,
          platform.url || null,
          platform.health || null,
          platform.startCmd || null,
          platform.cwd || null,
          platform.headless ? 1 : 0,
          platform.slowMo ?? null,
          platform.appId || null,
          configJson,
          now,
          now,
        )
      }
    }
  } catch {
    // ignore
  }
}

export function deletePlatform(db: DatabaseSync, name: string): void {
  const row = db.prepare("SELECT id FROM platforms WHERE name = ?").get(name) as { id: string } | undefined
  if (row?.id) {
    db.prepare("DELETE FROM env_platform WHERE platform_id = ?").run(row.id)
  }
  db.prepare("DELETE FROM platforms WHERE name = ?").run(name)
}

export function getEnvPlatforms(db: DatabaseSync, envName?: string): EnvPlatformRecord[] {
  const query = envName
    ? "SELECT * FROM env_platform WHERE env_name = ? ORDER BY env_name ASC, platform_id ASC"
    : "SELECT * FROM env_platform ORDER BY env_name ASC, platform_id ASC"
  const rows = (envName ? db.prepare(query).all(envName) : db.prepare(query).all()) as Array<{
    env_name: string
    platform_id: string
    enabled: number
    url?: string | null
    health?: string | null
    start_cmd?: string | null
    cwd?: string | null
    headless?: number | null
    slow_mo?: number | null
    app_id?: string | null
    config_json?: string | null
  }>

  return rows.map((r) => {
    let configJson: Record<string, unknown> | undefined
    if (r.config_json) {
      try {
        configJson = JSON.parse(r.config_json)
      } catch {
        // ignore
      }
    }
    return {
      envName: r.env_name,
      platformId: r.platform_id,
      enabled: r.enabled === 1,
      url: r.url || undefined,
      health: r.health || undefined,
      startCmd: r.start_cmd || undefined,
      cwd: r.cwd || undefined,
      headless: r.headless !== null ? r.headless === 1 : undefined,
      slowMo: r.slow_mo ?? undefined,
      appId: r.app_id || undefined,
      configJson,
    }
  })
}

export function getPlatformsForEnv(db: DatabaseSync, envName: string): PlatformWithEnvOverrides[] {
  const rows = db.prepare(`
    SELECT
      p.*,
      ep.enabled as ep_enabled,
      ep.url as ep_url,
      ep.health as ep_health,
      ep.start_cmd as ep_start_cmd,
      ep.cwd as ep_cwd,
      ep.headless as ep_headless,
      ep.slow_mo as ep_slow_mo,
      ep.app_id as ep_app_id,
      ep.config_json as ep_config_json,
      CASE WHEN ep.platform_id IS NOT NULL THEN 1 ELSE 0 END as is_linked
    FROM platforms p
    LEFT JOIN env_platform ep ON ep.platform_id = p.id AND ep.env_name = ?
    ORDER BY p.order_num ASC, p.name ASC
  `).all(envName) as Array<{
    id: string
    name: string
    type: "web" | "android" | "api"
    order_num?: number | null
    url?: string | null
    service_name?: string | null
    health?: string | null
    start_cmd?: string | null
    cwd?: string | null
    modules?: string | null
    slow_mo?: number | null
    headless?: number | null
    exclusive?: number | null
    app_id?: string | null
    flows?: string | null
    install_cmd?: string | null
    grant_permissions?: string | null
    reverse_ports?: string | null
    config_json?: string | null
    ep_enabled?: number | null
    ep_url?: string | null
    ep_health?: string | null
    ep_start_cmd?: string | null
    ep_cwd?: string | null
    ep_headless?: number | null
    ep_slow_mo?: number | null
    ep_app_id?: string | null
    ep_config_json?: string | null
    is_linked: number
  }>

  return rows.map((r) => {
    let grantPermissions: string[] | undefined
    let reversePorts: number[] | undefined

    if (r.grant_permissions) {
      try {
        grantPermissions = JSON.parse(r.grant_permissions)
      } catch {
        // ignore
      }
    }
    if (r.reverse_ports) {
      try {
        reversePorts = JSON.parse(r.reverse_ports)
      } catch {
        // ignore
      }
    }

    const overriddenFields: string[] = []
    const isLinked = r.is_linked === 1
    const enabled = isLinked ? r.ep_enabled !== 0 : true

    // Check overrides
    let effectiveUrl = r.url || undefined
    if (isLinked && r.ep_url !== null && r.ep_url !== undefined) {
      effectiveUrl = r.ep_url || undefined
      if (r.ep_url !== r.url) overriddenFields.push("url")
    }

    let effectiveHealth = r.health || undefined
    if (isLinked && r.ep_health !== null && r.ep_health !== undefined) {
      effectiveHealth = r.ep_health || undefined
      if (r.ep_health !== r.health) overriddenFields.push("health")
    }

    let effectiveStartCmd = r.start_cmd || undefined
    if (isLinked && r.ep_start_cmd !== null && r.ep_start_cmd !== undefined) {
      effectiveStartCmd = r.ep_start_cmd || undefined
      if (r.ep_start_cmd !== r.start_cmd) overriddenFields.push("startCmd")
    }

    let effectiveCwd = r.cwd || undefined
    if (isLinked && r.ep_cwd !== null && r.ep_cwd !== undefined) {
      effectiveCwd = r.ep_cwd || undefined
      if (r.ep_cwd !== r.cwd) overriddenFields.push("cwd")
    }

    let effectiveHeadless = r.headless === 1
    if (isLinked && r.ep_headless !== null && r.ep_headless !== undefined) {
      effectiveHeadless = r.ep_headless === 1
      if ((r.ep_headless === 1) !== (r.headless === 1)) overriddenFields.push("headless")
    }

    let effectiveSlowMo = r.slow_mo ?? undefined
    if (isLinked && r.ep_slow_mo !== null && r.ep_slow_mo !== undefined) {
      effectiveSlowMo = r.ep_slow_mo
      if (r.ep_slow_mo !== r.slow_mo) overriddenFields.push("slowMo")
    }

    let effectiveAppId = r.app_id || undefined
    if (isLinked && r.ep_app_id !== null && r.ep_app_id !== undefined) {
      effectiveAppId = r.ep_app_id || undefined
      if (r.ep_app_id !== r.app_id) overriddenFields.push("appId")
    }

    let epConfigJson: Record<string, unknown> | undefined
    if (r.ep_config_json) {
      try {
        epConfigJson = JSON.parse(r.ep_config_json)
      } catch {
        // ignore
      }
    }

    let baseConfigJson: Record<string, unknown> | undefined
    if (r.config_json) {
      try {
        baseConfigJson = JSON.parse(r.config_json)
      } catch {
        // ignore
      }
    }

    const configJson = epConfigJson || baseConfigJson

    let effectiveModules = r.modules || undefined
    if (isLinked && epConfigJson && typeof epConfigJson.modules === "string") {
      effectiveModules = epConfigJson.modules || undefined
      if (effectiveModules !== (r.modules || undefined)) overriddenFields.push("modules")
    }

    let effectiveExclusive = r.exclusive === 1
    if (isLinked && epConfigJson && typeof epConfigJson.exclusive === "boolean") {
      effectiveExclusive = epConfigJson.exclusive
      if (effectiveExclusive !== (r.exclusive === 1)) overriddenFields.push("exclusive")
    }

    let effectiveFlows = r.flows || undefined
    if (isLinked && epConfigJson && typeof epConfigJson.flows === "string") {
      effectiveFlows = epConfigJson.flows || undefined
      if (effectiveFlows !== (r.flows || undefined)) overriddenFields.push("flows")
    }

    let effectiveInstallCmd = r.install_cmd || undefined
    if (isLinked && epConfigJson && typeof epConfigJson.installCmd === "string") {
      effectiveInstallCmd = epConfigJson.installCmd || undefined
      if (effectiveInstallCmd !== (r.install_cmd || undefined)) overriddenFields.push("installCmd")
    }

    let effectiveGrantPermissions = grantPermissions
    if (isLinked && epConfigJson && Array.isArray(epConfigJson.grantPermissions)) {
      effectiveGrantPermissions = epConfigJson.grantPermissions as string[]
      overriddenFields.push("grantPermissions")
    }

    let effectiveReversePorts = reversePorts
    if (isLinked && epConfigJson && Array.isArray(epConfigJson.reversePorts)) {
      effectiveReversePorts = epConfigJson.reversePorts as number[]
      overriddenFields.push("reversePorts")
    }

    return {
      id: r.id,
      name: r.name,
      type: r.type,
      orderNum: r.order_num ?? 1,
      url: effectiveUrl,
      serviceName: r.service_name || undefined,
      health: effectiveHealth,
      startCmd: effectiveStartCmd,
      cwd: effectiveCwd,
      modules: effectiveModules,
      slowMo: effectiveSlowMo,
      headless: effectiveHeadless,
      exclusive: effectiveExclusive,
      appId: effectiveAppId,
      flows: effectiveFlows,
      installCmd: effectiveInstallCmd,
      grantPermissions: effectiveGrantPermissions,
      reversePorts: effectiveReversePorts,
      configJson,
      envName,
      enabled,
      isLinked,
      hasOverrides: overriddenFields.length > 0,
      overriddenFields,
    }
  })
}

export function saveEnvPlatform(db: DatabaseSync, record: EnvPlatformRecord): void {
  const now = Date.now()
  const configJson = record.configJson ? JSON.stringify(record.configJson) : null
  const headlessVal = record.headless !== undefined ? (record.headless ? 1 : 0) : null
  const enabledVal = record.enabled ? 1 : 0

  db.prepare(`
    INSERT INTO env_platform (
      env_name, platform_id, enabled, url, health, start_cmd, cwd, headless, slow_mo, app_id, config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(env_name, platform_id) DO UPDATE SET
      enabled = excluded.enabled,
      url = excluded.url,
      health = excluded.health,
      start_cmd = excluded.start_cmd,
      cwd = excluded.cwd,
      headless = excluded.headless,
      slow_mo = excluded.slow_mo,
      app_id = excluded.app_id,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).run(
    record.envName,
    record.platformId,
    enabledVal,
    record.url !== undefined ? (record.url ? record.url.trim() : "") : null,
    record.health !== undefined ? (record.health ? record.health.trim() : "") : null,
    record.startCmd !== undefined ? (record.startCmd ? record.startCmd.trim() : "") : null,
    record.cwd !== undefined ? (record.cwd ? record.cwd.trim() : "") : null,
    headlessVal,
    record.slowMo ?? null,
    record.appId !== undefined ? (record.appId ? record.appId.trim() : "") : null,
    configJson,
    now,
    now,
  )
}

export function deleteEnvPlatform(db: DatabaseSync, envName: string, platformId: string): void {
  db.prepare("DELETE FROM env_platform WHERE env_name = ? AND platform_id = ?").run(envName, platformId)
}

export function getFixtures(db: DatabaseSync): Record<string, { cmd: string; cwd?: string }> {
  const rows = db.prepare("SELECT name, cmd, cwd FROM fixtures ORDER BY name ASC").all() as Array<{
    name: string
    cmd: string
    cwd?: string | null
  }>
  const fixtures: Record<string, { cmd: string; cwd?: string }> = {}
  for (const row of rows) {
    fixtures[row.name] = {
      cmd: row.cmd,
      cwd: row.cwd || undefined,
    }
  }
  return fixtures
}

export function saveFixture(db: DatabaseSync, name: string, data: { cmd: string; cwd?: string }): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO fixtures (name, cmd, cwd, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      cmd = excluded.cmd,
      cwd = excluded.cwd,
      updated_at = excluded.updated_at
  `).run(name, data.cmd, data.cwd || null, now, now)
}

export function deleteFixture(db: DatabaseSync, name: string): void {
  db.prepare("DELETE FROM fixtures WHERE name = ?").run(name)
}

export function platformsToTargetsAndServices(platforms: (PlatformRecord | PlatformWithEnvOverrides)[]): {
  targets: Record<string, TargetConfig>
  services: Record<string, ServiceConfig>
} {
  const targets: Record<string, TargetConfig> = {}
  const services: Record<string, ServiceConfig> = {}

  for (const p of platforms) {
    if ("enabled" in p && p.enabled === false) {
      continue
    }

    if (p.type === "web") {
      const srvName = p.serviceName || p.name
      services[srvName] = {
        url: p.url || "http://localhost:5173",
        health: p.health,
        start: p.startCmd ? { cmd: p.startCmd, cwd: p.cwd } : undefined,
        exclusive: p.exclusive,
      }
      targets[p.name] = {
        driver: "web",
        service: srvName,
        modules: p.modules || ".e2e/modules",
        slowMo: p.slowMo,
        headless: p.headless,
      } as WebTarget
    } else if (p.type === "android") {
      targets[p.name] = {
        driver: "mobile",
        platform: "android",
        appId: p.appId || "com.example.app",
        flows: p.flows || ".e2e/flows",
        install: p.installCmd ? { cmd: p.installCmd, cwd: p.cwd } : undefined,
        grantPermissions: p.grantPermissions,
        reversePorts: p.reversePorts,
      } as MobileTarget
    } else if (p.type === "api") {
      const srvName = p.serviceName || p.name
      services[srvName] = {
        url: p.url || "http://localhost:3000",
        health: p.health || "/",
        start: p.startCmd ? { cmd: p.startCmd, cwd: p.cwd } : undefined,
        exclusive: p.exclusive,
      }
      targets[p.name] = {
        driver: "http",
        service: srvName,
      } as HttpTarget
    }
  }

  return { targets, services }
}
