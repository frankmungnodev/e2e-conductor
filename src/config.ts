import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { Page } from "playwright"

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

export type HttpTarget = { driver: "http"; service: string }

export type WebTarget = {
  driver: "web"
  service: string
  /** Folder of web step modules, relative to the config file. */
  modules: string
  /** Module run once per scenario before the first step on this target. */
  login?: string
  headless?: boolean
  /** Milliseconds added to every Playwright action, so a person can follow along. */
  slowMo?: number
}

export type MobileTarget = {
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

export type E2EConfig = {
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

export function defineConfig(config: E2EConfig): E2EConfig {
  return config
}

export function defineWebStep(step: WebStep): WebStep {
  return step
}

export const SHELL_TARGET = "shell"

export type LoadedConfig = E2EConfig & {
  configDir: string
  env: Record<string, string>
}

export async function loadConfig(configPath: string): Promise<LoadedConfig> {
  const absolute = resolve(configPath)
  if (!existsSync(absolute)) {
    throw new Error(`Config not found: ${absolute}`)
  }
  const mod = await import(pathToFileURL(absolute).href)
  const config: E2EConfig | undefined = mod.default
  if (!config?.targets) {
    throw new Error(`${absolute} must default-export defineConfig({ targets, scenarios, results })`)
  }
  if (SHELL_TARGET in config.targets) {
    throw new Error(`Target name "${SHELL_TARGET}" is reserved`)
  }
  for (const [name, target] of Object.entries(config.targets)) {
    if (target.driver !== "mobile" && !config.services?.[target.service]) {
      throw new Error(`Target "${name}" uses unknown service "${target.service}"`)
    }
  }

  const configDir = dirname(absolute)
  const env: Record<string, string> = { ...config.env }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  return { ...config, configDir, env }
}

export function resolveFromConfig(config: LoadedConfig, path = "."): string {
  return resolve(config.configDir, path)
}

export function starterConfig(configDir = process.cwd()): LoadedConfig {
  return {
    configDir,
    env: {},
    scenarios: "e2e/scenarios",
    results: "e2e/results",
    services: {},
    targets: {},
    fixtures: {},
  }
}

export function serviceOf(config: LoadedConfig, name: string): ServiceConfig {
  const service = config.services?.[name]
  if (!service) throw new Error(`unknown service "${name}"`)
  return service
}

