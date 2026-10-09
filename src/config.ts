import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { Page } from "playwright"
import { openDatabase } from "./db/connection.ts"
import { getPlatformsForEnv } from "./db/env-platforms.ts"
import { getActiveEnvironment, getDefaultEnvironment, getEnvironments } from "./db/environments.ts"
import { getFixtures } from "./db/fixtures.ts"
import { checkDbStatus, resolveDbPath, resolveProjectDir } from "./db/paths.ts"
import { getPlatforms, platformsToTargetsAndServices } from "./db/platforms.ts"

/** A shell command. `cwd` is relative to the config file. */
export type Command = { cwd?: string; cmd: string }

export type ServiceConfig = {
  /** Base URL, e.g. http://localhost:4000 */
  url: string
  /** Path polled for readiness. Defaults to the base URL. */
  health?: string
  /** How to start the service when `--start` is passed and it is down. */
  start?: Command
  /**
   * Never reuse an instance that is already running: this run starts the service itself with
   * `start` (no `--start` needed) and stops it at the end. Use it when `start` sets up a safe
   * environment, e.g. without production credentials, that a hand-started instance may lack.
   */
  exclusive?: boolean
}

/** Fields every target has. */
type TargetBase = {
  /**
   * Other targets this one depends on, e.g. a web app or Android app that calls an API. Their
   * services are prepared and re-checked whenever this target runs, even if no step uses them.
   */
  needs?: string[]
}

export type HttpTarget = TargetBase & { driver: "http"; service: string }

export type WebTarget = TargetBase & {
  driver: "web"
  service: string
  /** Folder of web step modules, relative to the config file. */
  modules: string
  headless?: boolean
  /** Milliseconds added to every Playwright action, so a person can follow along. */
  slowMo?: number
}

export type MobileTarget = TargetBase & {
  driver: "mobile"
  platform: "android"
  appId: string
  /** Folder of YAML flows, relative to the config file. */
  flows: string
  /** Runtime permissions granted after a fresh launch wipes app data, so no dialog appears. */
  grantPermissions?: string[]
  /** Device ports forwarded to the host with `adb reverse`. */
  reversePorts?: number[]
  /** How to build and install the app when `--install` is passed. */
  install?: Command
}

export type TargetConfig = HttpTarget | WebTarget | MobileTarget

export type Logger = (message: string) => void

export type FixtureContext = {
  configDir: string
  env: Record<string, string>
  log: Logger
}

export type FixtureFn = (ctx: FixtureContext) => Promise<void>

export type EnvironmentConfig = {
  /** Optional human-readable description */
  description?: string
  /** Base URL for this environment, or primary service URL */
  url?: string
  /** Per-service overrides in this environment (e.g. url, health) */
  services?: Record<string, { url: string; health?: string }>
  /** Environment variables active when running under this environment */
  env?: Record<string, string>
  /** Folder of scenario JSON files for this environment */
  scenarios?: string
  /** Folder of flow YAML files for this environment */
  flows?: string
  /** Output results folder for this environment */
  results?: string
}

export type E2EConfig = {
  /** Default environment name to use when not specified (e.g. "dev") */
  defaultEnvironment?: string
  /** Multi-environment configurations (e.g. dev, staging, prod) */
  environments?: Record<string, EnvironmentConfig>
  services?: Record<string, ServiceConfig>
  targets: Record<string, TargetConfig>
  /** Named setup steps a scenario lists in `setup`. */
  fixtures?: Record<string, Command | FixtureFn>
  /** Values available as `${env.NAME}`. Process env wins. */
  env?: Record<string, string>
  /** Folder of scenario JSON files, relative to the config file. */
  scenarios: string
  /** Output folder, relative to the config file. */
  results: string
}

export type WebStepArgs = {
  page: Page
  params: Record<string, unknown>
  baseUrl: string
  env: Record<string, string>
  log: Logger
}

/** A web step module's default export. Returned values can be extracted and asserted. */
export type WebStep = (args: WebStepArgs) => Promise<Record<string, unknown> | undefined>

export function defineWebStep(step: WebStep): WebStep {
  return step
}

export const SHELL_TARGET = "shell"

export type LoadedConfig = E2EConfig & {
  configDir: string
  env: Record<string, string>
  activeEnvironment?: string
  /** The database this config was read from. Every later read and write uses it, so `--db` holds. */
  dbPath: string
  dbExists?: boolean
}

/**
 * `chosenDbPath` (the `--db` option) picks the database; otherwise a `.db` or `.sqlite` path passed as
 * `configDirOrDbPath` does, and otherwise the project's default (`resolveDbPath`).
 */
export async function loadConfig(configDirOrDbPath?: string, envName?: string, chosenDbPath?: string): Promise<LoadedConfig> {
  const configDir = resolveProjectDir(configDirOrDbPath)
  const trimmed = configDirOrDbPath?.trim()
  const dbPath = chosenDbPath?.trim()
    ? resolve(chosenDbPath.trim())
    : trimmed && (trimmed.endsWith(".db") || trimmed.endsWith(".sqlite"))
      ? resolve(trimmed)
      : resolveDbPath(configDir)

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}. Run "e2e init" or "e2e ui" to initialize your test configuration.`)
  }

  const db = openDatabase(dbPath)
  const environments = getEnvironments(db)
  const defaultEnvironment = getDefaultEnvironment(db)
  const dbActiveEnv = getActiveEnvironment(db)
  const activeEnvironment =
    envName ||
    process.env.E2E_ENV ||
    dbActiveEnv ||
    defaultEnvironment ||
    (environments && Object.keys(environments).length > 0 ? Object.keys(environments)[0] : undefined)

  const platforms = activeEnvironment ? getPlatformsForEnv(db, activeEnvironment) : getPlatforms(db)
  const { targets, services } = platformsToTargetsAndServices(platforms)
  const fixtures = getFixtures(db)
  db.close()

  if (SHELL_TARGET in targets) {
    throw new Error(`Target name "${SHELL_TARGET}" is reserved`)
  }

  let scenarios = ".e2e/scenarios"
  let results = ".e2e/results"
  const env: Record<string, string> = {}

  if (activeEnvironment && environments?.[activeEnvironment]) {
    const selectedEnv = environments[activeEnvironment]
    if (selectedEnv.scenarios) scenarios = selectedEnv.scenarios
    if (selectedEnv.results) results = selectedEnv.results
    if (selectedEnv.env) {
      Object.assign(env, selectedEnv.env)
    }
    if (selectedEnv.services) {
      for (const [srvName, srvOverride] of Object.entries(selectedEnv.services)) {
        if (services[srvName]) {
          services[srvName] = { ...services[srvName], ...srvOverride }
        } else if (srvOverride.url) {
          services[srvName] = { url: srvOverride.url, health: srvOverride.health }
        }
      }
    }
  }

  for (const [name, target] of Object.entries(targets)) {
    if (target.driver !== "mobile" && !services[target.service]) {
      throw new Error(`Target "${name}" uses unknown service "${target.service}"`)
    }
    for (const needed of target.needs ?? []) {
      if (!targets[needed]) throw new Error(`Target "${name}" needs unknown target "${needed}"`)
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }

  return {
    configDir,
    dbPath,
    dbExists: true,
    defaultEnvironment,
    activeEnvironment,
    environments,
    scenarios,
    results,
    services,
    targets,
    fixtures,
    env,
  }
}

/** Reads the config again from the same project and database, so a reload never drops `--db`. */
export function reloadConfig(current: LoadedConfig, envName?: string, dbPath: string = current.dbPath): Promise<LoadedConfig> {
  return loadConfig(current.configDir, envName, dbPath)
}

export function resolveFromConfig(config: LoadedConfig, path = "."): string {
  return resolve(config.configDir, path)
}

export function starterConfig(configDir = process.cwd(), chosenDbPath?: string): LoadedConfig {
  const dbStatus = checkDbStatus(configDir, chosenDbPath && resolve(chosenDbPath))
  let environments: Record<string, EnvironmentConfig> = {}
  let activeEnvironment: string | undefined
  let defaultEnvironment: string | undefined
  let targets: Record<string, TargetConfig> = {}
  let services: Record<string, ServiceConfig> = {}
  let fixtures: Record<string, Command | FixtureFn> = {}

  if (dbStatus.dbExists) {
    try {
      const db = openDatabase(dbStatus.dbPath)
      environments = getEnvironments(db)
      activeEnvironment = getActiveEnvironment(db)
      defaultEnvironment = getDefaultEnvironment(db)
      fixtures = getFixtures(db)
      const platforms = activeEnvironment ? getPlatformsForEnv(db, activeEnvironment) : getPlatforms(db)
      if (platforms.length > 0) {
        const platRes = platformsToTargetsAndServices(platforms)
        targets = platRes.targets
        services = platRes.services
      }
      db.close()
    } catch {
      // ignore
    }
  }

  return {
    configDir,
    dbPath: dbStatus.dbPath,
    dbExists: dbStatus.dbExists,
    defaultEnvironment,
    activeEnvironment,
    environments,
    env: {},
    scenarios: ".e2e/scenarios",
    results: ".e2e/results",
    services,
    targets,
    fixtures,
  }
}

/** The services a set of targets uses, including those of the targets they need, transitively. */
export function servicesNeeded(config: LoadedConfig, targetNames: Iterable<string>): Set<string> {
  const services = new Set<string>()
  const seen = new Set<string>()
  const visit = (name: string) => {
    const target = config.targets[name]
    if (!target || seen.has(name)) return
    seen.add(name)
    if (target.driver !== "mobile") services.add(target.service)
    for (const needed of target.needs ?? []) visit(needed)
  }
  for (const name of targetNames) visit(name)
  return services
}

export function serviceOf(config: LoadedConfig, name: string): ServiceConfig {
  const service = config.services?.[name]
  if (!service) throw new Error(`unknown service "${name}"`)
  return service
}

