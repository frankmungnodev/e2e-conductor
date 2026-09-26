import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { type LoadedConfig, type MobileTarget, resolveFromConfig, SHELL_TARGET } from "./config.ts"
import { checkFlow } from "./flow.ts"
import { describeErrors, validateScenario } from "./schema.ts"

export type Assert = {
  status?: number
  exit_code?: number
  output_contains?: string
  json_match?: Record<string, unknown>
}

export type Step = {
  name: string
  target: string
  extract?: Record<string, string>
  assert?: Assert
  timeout_ms?: number
  retry?: { times: number; delay_ms?: number }
  // http
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  // web / mobile
  run?: string
  flow?: string
  /** mobile: launch the app through adb before the flow. */
  launch?: "fresh" | "restart"
  params?: Record<string, unknown>
  // shell
  command?: string
  cwd?: string
}

export type Scenario = {
  name: string
  description?: string
  setup?: string[]
  vars?: Record<string, unknown>
  steps: Step[]
  /** File name without extension. */
  id: string
}

/** Fields each driver accepts on top of the common step fields. */
const DRIVER_FIELDS: Record<string, string[]> = {
  http: ["method", "url", "headers", "body"],
  web: ["run", "params"],
  mobile: ["flow", "launch", "params"],
  shell: ["command", "cwd"],
}
const REQUIRED: Record<string, string> = { http: "url", web: "run", mobile: "flow", shell: "command" }
const COMMON = new Set(["name", "target", "extract", "assert", "timeout_ms", "retry"])

function driverOf(config: LoadedConfig, target: string): string {
  if (target === SHELL_TARGET) return SHELL_TARGET
  const found = config.targets[target]
  if (!found) {
    throw new Error(`unknown target "${target}" (config has: ${[...Object.keys(config.targets), SHELL_TARGET].join(", ")})`)
  }
  return found.driver
}

/** Problems in the flow a mobile step names. `checked` holds flows already reported, so each is reported once. */
function checkStepFlow(config: LoadedConfig, step: Step, checked: Set<string>): string[] {
  const target = config.targets[step.target] as MobileTarget
  const file = join(resolveFromConfig(config, target.flows), step.flow as string)
  if (checked.has(file)) return []
  checked.add(file)
  if (!existsSync(file)) return [`flow not found: ${file}`]
  return checkFlow(file).map((problem) => `flow ${step.flow}: ${problem}`)
}

function checkSteps(config: LoadedConfig, scenario: Scenario, checkedFlows: Set<string>): string[] {
  const errors: string[] = []
  for (const fixture of scenario.setup ?? []) {
    if (!config.fixtures?.[fixture]) errors.push(`setup: unknown fixture "${fixture}"`)
  }
  scenario.steps.forEach((step, index) => {
    const where = `steps[${index}] "${step.name}"`
    let driver: string
    try {
      driver = driverOf(config, step.target)
    } catch (error) {
      errors.push(`${where}: ${(error as Error).message}`)
      return
    }
    const allowed = DRIVER_FIELDS[driver]
    for (const key of Object.keys(step)) {
      if (!COMMON.has(key) && !allowed.includes(key)) {
        errors.push(`${where}: "${key}" is not valid for a ${driver} target`)
      }
    }
    const hasRequired = step[REQUIRED[driver] as keyof Step] !== undefined || (driver === "mobile" && step.launch !== undefined)
    if (!hasRequired) {
      errors.push(`${where}: ${driver} step needs "${REQUIRED[driver]}"${driver === "mobile" ? ' or "launch"' : ""}`)
    }
    if (driver === "mobile" && step.flow !== undefined) {
      for (const problem of checkStepFlow(config, step, checkedFlows)) errors.push(`${where}: ${problem}`)
    }
  })
  return errors
}

export function loadScenarios(config: LoadedConfig, filters: string[] = []): Scenario[] {
  const dir = resolveFromConfig(config, config.scenarios)
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))

  if (files.length === 0) {
    throw new Error(`No scenarios in ${dir}${filters.length ? ` matching ${filters.join(", ")}` : ""}`)
  }

  const problems: string[] = []
  const checkedFlows = new Set<string>()
  const scenarios = files.map((file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"))
    const scenario = { ...raw, id: basename(file, ".json") } as Scenario
    if (!validateScenario(raw)) {
      for (const error of describeErrors(validateScenario.errors)) problems.push(`${file}: ${error}`)
      return scenario
    }
    for (const error of checkSteps(config, scenario, checkedFlows)) problems.push(`${file}: ${error}`)
    return scenario
  })

  if (problems.length > 0) {
    throw new Error(`Invalid scenarios:\n  ${problems.join("\n  ")}`)
  }
  return scenarios
}

export function targetsUsed(scenarios: Scenario[]): Set<string> {
  return new Set(scenarios.flatMap((scenario) => scenario.steps.map((step) => step.target)))
}
