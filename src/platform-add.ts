import { existsSync } from "node:fs"
import { join } from "node:path"
import { writeAgentKit } from "./agent-kit.ts"
import { SHELL_TARGET } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { getEnvironments } from "./db/environments.ts"
import { findProjectDir, resolveDbPath } from "./db/paths.ts"
import { getPlatforms, type PlatformRecord, savePlatform } from "./db/platforms.ts"
import { SUITE_AGENT } from "./project-layout.ts"

const TYPES: PlatformRecord["type"][] = ["api", "web", "android"]
const NAME = /^[a-z0-9][a-z0-9_-]*$/i
const KIT_PATH = `${SUITE_AGENT}/kit.md`

export type PlatformAddRequest = {
  cwd: string
  name?: string
  type?: string
  url?: string
  health?: string
  startCmd?: string
  appId?: string
  needs?: string
}

export type PlatformAddResult = { project: string; platform: PlatformRecord; environments: string[]; kitRefreshed: boolean }

/**
 * `e2e-conductor platform add`: save one new platform, linked to every environment, so an agent can
 * set up a target from the chat instead of sending the person to the UI. It never changes an existing
 * platform: editing one, and per-environment overrides, stay in the UI.
 */
export function addPlatform(request: PlatformAddRequest): PlatformAddResult {
  const name = request.name?.trim()
  if (!name) throw new Error('Name the platform: e2e-conductor platform add <name> --type <api|web|android> --url <url>')
  if (!NAME.test(name)) throw new Error(`Platform name "${name}" may use only letters, digits, "-" and "_", starting with a letter or digit.`)
  if (name === SHELL_TARGET) throw new Error(`"${SHELL_TARGET}" is the built-in target for local commands. Pick another name.`)
  const type = request.type as PlatformRecord["type"]
  if (!TYPES.includes(type)) throw new Error(`--type must be one of: ${TYPES.join(", ")}.`)
  const url = request.url?.trim()
  if (type !== "android" && !isHttpUrl(url)) throw new Error(`A ${type} platform needs --url, the app's base URL, such as http://localhost:8000.`)
  const appId = request.appId?.trim()
  if (type === "android" && !appId) throw new Error("An android platform needs --app-id, the app's package name, such as com.example.app.")
  const needs = request.needs?.split(",").map((need) => need.trim()).filter(Boolean)

  const project = findProjectDir(request.cwd)
  if (!project) throw new Error(`No .e2e or e2e-suite folder in ${request.cwd} or any folder above it. Run "e2e-conductor init" in the project first.`)
  const dbPath = resolveDbPath(project)
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath}. Run "e2e-conductor init" in ${project} first.`)

  const platform: PlatformRecord = {
    id: `plat-${name}`,
    name,
    type,
    url: type === "android" ? undefined : url,
    serviceName: name,
    health: type === "android" ? undefined : request.health?.trim() || "/",
    startCmd: request.startCmd?.trim() || undefined,
    appId: type === "android" ? appId : undefined,
    needs: needs?.length ? needs : undefined,
  }
  const environments = withDb(dbPath, (db) => {
    const environments = Object.keys(getEnvironments(db))
    if (environments.length === 0) throw new Error(`The database has no environment yet. Run "e2e-conductor init" in ${project} first.`)
    const existing = new Set(getPlatforms(db).map((saved) => saved.name))
    if (existing.has(name)) throw new Error(`A platform named "${name}" already exists. Change it in the e2e UI, or pick another name.`)
    const missing = platform.needs?.filter((need) => !existing.has(need)) ?? []
    if (missing.length > 0) throw new Error(`--needs names platforms that do not exist: ${missing.join(", ")}. Add them first.`)
    savePlatform(db, platform)
    return environments
  })

  // An agent reads the kit for target names, so refresh one that is already there.
  const kitRefreshed = existsSync(join(project, KIT_PATH))
  if (kitRefreshed) writeAgentKit(project)
  return { project, platform, environments, kitRefreshed }
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function renderPlatformAdd(result: PlatformAddResult): string {
  const { platform } = result
  const where = platform.type === "android" ? platform.appId : platform.url
  const lines = [
    `added platform ${platform.name} (${platform.type}, ${where}) to: ${result.environments.join(", ")}`,
    `Steps can now use "target": "${platform.name}".`,
  ]
  lines.push(result.kitRefreshed ? `refreshed ${KIT_PATH}` : `Run "e2e-conductor kit" to write the agent kit.`)
  return lines.join("\n")
}
