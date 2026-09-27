export type StepAssert = {
  status?: number
  exit_code?: number
  output_contains?: string
  json_match?: Record<string, unknown>
}

export type ScenarioStep = {
  name: string
  target: string
  extract?: Record<string, string>
  assert?: StepAssert
  timeout_ms?: number
  retry?: { times: number; delay_ms?: number }
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  run?: string
  flow?: string
  launch?: "fresh" | "restart"
  params?: Record<string, unknown>
  command?: string
  cwd?: string
}

export type ScenarioData = {
  $schema?: string
  name: string
  description?: string
  setup?: string[]
  vars?: Record<string, unknown>
  steps: ScenarioStep[]
}

export type ScenarioItem = {
  id: string
  file: string
  name: string
  description?: string
  steps: ScenarioStep[]
  setup: string[]
  vars: Record<string, unknown>
  raw: ScenarioData
  isValid: boolean
  errors: string[]
  targets: string[]
}

export type FlowItem = {
  target: string
  file: string
  path: string
  content: string
  isValid: boolean
  errors: string[]
}

export type ServiceStatus = {
  name: string
  url: string
  health: string
  up: boolean
  latencyMs: number
  gitWarning?: string
  exclusive: boolean
  hasStart: boolean
  startCmd?: string
}

export type DeviceStatus = {
  serial: string
  state: string
  model?: string
  packages: Record<string, boolean>
}

export type PreflightData = {
  services: ServiceStatus[]
  adb: {
    available: boolean
    path?: string
  }
  devices: DeviceStatus[]
}

export type EnvironmentMeta = {
  description?: string
  url?: string
  scenarios?: string
  flows?: string
  results?: string
  services?: Record<string, { url: string; health?: string }>
  env?: Record<string, string>
}

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

export type ConfigMeta = {
  configDir: string
  defaultEnvironment?: string
  activeEnvironment?: string
  environments?: Record<string, EnvironmentMeta>
  services: Record<
    string,
    {
      url: string
      health: string
      exclusive: boolean
      hasStart: boolean
      startCmd?: string
      startCwd?: string
    }
  >
  targets: Record<string, any>
  scenariosPath: string
  resultsPath: string
  fixtures: string[]
  fixturesMap?: Record<string, { cmd: string; cwd?: string }>
  dbExists?: boolean
  dbPath?: string
  hasEnvironments?: boolean
  platforms?: PlatformRecord[]
  envPlatforms?: EnvPlatformRecord[]
  platformsWithEnv?: PlatformWithEnvOverrides[]
}

export type RunSummary = {
  status: "PASSED" | "FAILED"
  total: number
  passed: number
  failed: number
  duration_ms: number
  failures: Array<{
    scenario: string
    iteration: number
    step: string
    error: string
  }>
  artifacts: string
}

export type RunHistoryItem = {
  runId: string
  timestamp: number
  scenarios: string[]
}

export type RunEvent =
  | { type: "connected"; active: boolean }
  | { type: "preflight_start" }
  | { type: "preflight_done" }
  | { type: "run_start"; runId: string; totalScenarios: number; repeat: number; scenarios: Array<{ id: string; name: string; stepsCount: number }> }
  | { type: "scenario_start"; scenarioId: string; scenarioName: string; iteration: number; totalIterations: number }
  | { type: "step_start"; scenarioId: string; stepName: string; target: string; index: number; totalSteps: number }
  | { type: "step_pass"; scenarioId: string; stepName: string; target: string; index: number; duration_ms: number }
  | { type: "step_fail"; scenarioId: string; stepName: string; target: string; index: number; duration_ms: number; error: string }
  | { type: "scenario_end"; scenarioId: string; iteration: number; passed: boolean; duration_ms: number; error?: string }
  | { type: "log"; text: string; level: "info" | "detail" }
  | { type: "finish"; summary: RunSummary }

export type ModuleFile = {
  id: string
  category: "web" | "fixture" | "helper"
  target?: string
  name: string
  path: string
  content: string
  size: number
  updatedAt: number
}

export type WizardComponentType = "api" | "web" | "android"

export type WizardComponent = {
  id: string
  type: WizardComponentType
  name: string
  order: number
  // REST API / Backend fields
  url?: string
  health?: string
  startCmd?: string
  cwd?: string
  // Web SPA fields
  service?: string
  modules?: string
  slowMo?: number
  headless?: boolean
  // Android fields
  appId?: string
  installCmd?: string
  flows?: string
  reversePorts?: number[]
  grantPermissions?: string[]
}

export type DetectedService = {
  suggestedType: WizardComponentType
  name: string
  path: string
  startCmd?: string
  port?: number
  appId?: string
}

export type WizardEnvironment = {
  name: string
  url?: string
  description?: string
  scenarios?: string
  flows?: string
  results?: string
  env?: Record<string, string>
}

export type WizardApplyPayload = {
  components?: WizardComponent[]
  environment?: WizardEnvironment
  environments?: Record<
    string,
    {
      description?: string
      url?: string
      scenarios?: string
      flows?: string
      results?: string
      env?: Record<string, string>
    }
  >
  defaultEnvironment?: string
  scaffoldFiles?: boolean
  fixtures?: Record<string, { cmd: string; cwd?: string }>
  code?: string
}
