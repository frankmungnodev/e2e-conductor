import type { DatabaseSync } from "node:sqlite"
import { safeJsonParse } from "./connection.ts"
import type { PlatformRecord } from "./platforms.ts"

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
    const configJson = safeJsonParse<Record<string, unknown>>(r.config_json)
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
    const grantPermissions = safeJsonParse<string[]>(r.grant_permissions)
    const reversePorts = safeJsonParse<number[]>(r.reverse_ports)

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

    const epConfigJson = safeJsonParse<Record<string, unknown>>(r.ep_config_json)
    const baseConfigJson = safeJsonParse<Record<string, unknown>>(r.config_json)

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
