import type { DatabaseSync } from "node:sqlite"
import type { HttpTarget, MobileTarget, ServiceConfig, TargetConfig, WebTarget } from "../config.ts"
import { safeJsonParse } from "./connection.ts"
import { linkPlatform, type PlatformWithEnvOverrides } from "./env-platforms.ts"

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
  /** Names of other platforms whose services this one depends on, e.g. a web app that calls an API. */
  needs?: string[]
  configJson?: Record<string, unknown>
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
    needs?: string | null
    config_json?: string | null
  }>

  return rows.map((r) => {
    const grantPermissions = safeJsonParse<string[]>(r.grant_permissions)
    const reversePorts = safeJsonParse<number[]>(r.reverse_ports)
    const configJson = safeJsonParse<Record<string, unknown>>(r.config_json)

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
      needs: safeJsonParse<string[]>(r.needs),
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
      grant_permissions, reverse_ports, needs, config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      needs = excluded.needs,
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
    platform.needs?.length ? JSON.stringify(platform.needs) : null,
    configJson,
    now,
    now,
  )

  // Link the platform to every existing environment, inheriting all of its fields
  const envRows = db.prepare("SELECT name FROM environments").all() as Array<{ name: string }>
  for (const env of envRows) linkPlatform(db, env.name, platform.id, now)
}

export function deletePlatform(db: DatabaseSync, name: string): void {
  const row = db.prepare("SELECT id FROM platforms WHERE name = ?").get(name) as { id: string } | undefined
  if (row?.id) {
    db.prepare("DELETE FROM env_platform WHERE platform_id = ?").run(row.id)
  }
  db.prepare("DELETE FROM platforms WHERE name = ?").run(name)
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
        needs: p.needs,
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
        needs: p.needs,
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
        needs: p.needs,
      } as HttpTarget
    }
  }

  return { targets, services }
}
