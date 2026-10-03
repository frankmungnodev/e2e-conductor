export type StepAssert = {
  status?: number
  exit_code?: number
  output_contains?: string
  json_match?: Record<string, unknown>
}

export type StepAction = {
  id?: string
  name?: string
  action: string
  selector?: string
  target_selector?: string
  value?: string
  url?: string
  key?: string
  ms?: number
  timeout_ms?: number
  width?: number
  height?: number
  method?: string
  headers?: Record<string, string>
  body?: unknown
  status?: number
  command?: string
  cwd?: string
  exit_code?: number
}

export type ScenarioStep = {
  id?: string
  name: string
  target: string
  actions?: StepAction[]
  extract?: Record<string, string>
  assert?: StepAssert
  timeout_ms?: number
  retry?: { times: number; delay_ms?: number }
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  action?: string
  selector?: string
  target_selector?: string
  value?: string
  key?: string
  ms?: number
  width?: number
  height?: number
  run?: string
  flow?: string
  launch?: "fresh" | "restart"
  params?: Record<string, unknown>
  command?: string
  cwd?: string
}

export type StepPreset = {
  id: string
  name: string
  description?: string
  target: string
  step: ScenarioStep
  createdAt?: number
  updatedAt?: number
}

export type StepGroup = {
  id: string
  name: string
  description?: string
  target?: string
  steps: ScenarioStep[]
  createdAt?: number
  updatedAt?: number
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

/** Mirrors `FailureLabel` in src/assertions.ts. */
export type FailureLabel = "Environment down" | "Assertion failed" | "Step error"

/** A scenario-iteration an environment-down stop never reached. */
export type NotRun = { scenario: string; iteration: number }

export type RunSummary = {
  status: "PASSED" | "FAILED"
  /** Scenario-iterations in the run, including the ones `notRun` lists. */
  total: number
  passed: number
  failed: number
  duration_ms: number
  failures: Array<{
    scenario: string
    iteration: number
    step: string
    error: string
    label?: FailureLabel
  }>
  artifacts: string
  /** "environment down" or "recovered steps (strict)". */
  reason?: string
  /** What the health re-check found down. */
  down?: string[]
  // Optional here because summaries written before these fields existed lack them.
  recovered?: number
  notRun?: NotRun[]
  strict?: boolean
}

export type StepRunItem = {
  id: string
  runId: string
  stepId?: string
  scenarioId: string
  iteration: number
  attempt: number
  status: "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED"
  durationMs?: number
  statusCode?: number
  errorMessage?: string
  resultData?: unknown
  artifactsPath?: string
  createdAt: number
  failureLabel?: FailureLabel
}

export type RunDetails = {
  runId: string
  status?: string
  environmentName?: string
  durationMs?: number
  reason?: string
  recoveredSteps?: number
  notRunScenarios?: number
  stepRuns?: StepRunItem[]
  scenarios: Record<string, Array<{ name: string; url: string; isImage: boolean }>>
  runLog: string
}

export type RunHistoryItem = {
  runId: string
  timestamp: number
  scenarios: string[]
  environmentName?: string
  status?: "RUNNING" | "PASSED" | "FAILED" | "CANCELLED"
  totalScenarios?: number
  passedScenarios?: number
  failedScenarios?: number
  durationMs?: number
  reason?: string
  recoveredSteps?: number
  notRunScenarios?: number
}

export type RunEvent =
  | { type: "connected"; active: boolean }
  | { type: "preflight_start" }
  | { type: "preflight_done" }
  | { type: "run_start"; runId: string; totalScenarios: number; repeat: number; scenarios: Array<{ id: string; name: string; stepsCount: number }> }
  | { type: "scenario_start"; scenarioId: string; scenarioName: string; iteration: number; totalIterations: number }
  | { type: "step_start"; scenarioId: string; stepName: string; target: string; index: number; totalSteps: number }
  | { type: "step_pass"; scenarioId: string; stepName: string; target: string; index: number; duration_ms: number; recovered: boolean }
  | { type: "step_fail"; scenarioId: string; stepName: string; target: string; index: number; duration_ms: number; error: string; label: FailureLabel }
  | { type: "scenario_end"; scenarioId: string; iteration: number; passed: boolean; duration_ms: number; error?: string; label?: FailureLabel }
  | { type: "log"; text: string; level: "info" | "detail" }
  | { type: "finish"; summary: RunSummary }


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
  exclusive?: boolean
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
}

