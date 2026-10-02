import type {
  ConfigMeta,
  FlowItem,
  PreflightData,
  RunDetails,
  RunEvent,
  RunHistoryItem,
  RunSummary,
  ScenarioItem,
  StepGroup,
  StepPreset,
  StepRunItem,
} from "./types.ts"

const API_BASE = ""

export async function fetchConfig(env?: string): Promise<ConfigMeta> {
  const query = env ? `?env=${encodeURIComponent(env)}` : ""
  const res = await fetch(`${API_BASE}/api/config${query}`)
  if (!res.ok) throw new Error("Failed to load config")
  return res.json()
}

export async function fetchScenarios(): Promise<ScenarioItem[]> {
  const res = await fetch(`${API_BASE}/api/scenarios`)
  if (!res.ok) throw new Error("Failed to load scenarios")
  return res.json()
}

export async function saveScenario(id: string, content: any): Promise<{ ok: boolean; isValid: boolean; errors: string[] }> {
  const res = await fetch(`${API_BASE}/api/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, content }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to save scenario")
  }
  return res.json()
}

export async function deleteScenario(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/scenarios/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to delete scenario")
}

export async function fetchFlows(): Promise<FlowItem[]> {
  const res = await fetch(`${API_BASE}/api/flows`)
  if (!res.ok) throw new Error("Failed to load flows")
  return res.json()
}

export async function saveFlow(target: string, file: string, content: string): Promise<{ ok: boolean; isValid: boolean; errors: string[] }> {
  const res = await fetch(`${API_BASE}/api/flows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, file, content }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to save flow")
  }
  return res.json()
}

export async function fetchPreflight(): Promise<PreflightData> {
  const res = await fetch(`${API_BASE}/api/preflight`)
  if (!res.ok) throw new Error("Failed to run preflight check")
  return res.json()
}

export async function startService(name: string): Promise<{ ok: boolean; pid: number }> {
  const res = await fetch(`${API_BASE}/api/preflight/start-service`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to start service")
  }
  return res.json()
}

export async function startRun(options: {
  scenarios?: string[]
  repeat?: number
  start?: boolean
  install?: boolean
  headless?: boolean
  verbose?: boolean
}): Promise<{ ok: boolean; runId: string }> {
  const res = await fetch(`${API_BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to start run")
  }
  return res.json()
}

export async function stopRun(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/run/stop`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to stop run")
}

export async function fetchRunStatus(): Promise<{
  isRunning: boolean
  currentRun?: any
  lastSummary?: RunSummary
}> {
  const res = await fetch(`${API_BASE}/api/run/status`)
  if (!res.ok) throw new Error("Failed to get run status")
  return res.json()
}

export async function fetchRuns(): Promise<{ runs: RunHistoryItem[]; latestSummary?: RunSummary }> {
  const res = await fetch(`${API_BASE}/api/runs`)
  if (!res.ok) throw new Error("Failed to get runs list")
  return res.json()
}

export async function fetchRunDetails(runId: string): Promise<RunDetails> {
  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}`)
  if (!res.ok) throw new Error("Failed to get run details")
  return res.json()
}

export function subscribeToEvents(
  onEvent: (event: RunEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const eventSource = new EventSource(`${API_BASE}/api/events`)

  eventSource.onopen = () => {
    onConnectionChange?.(true)
  }

  eventSource.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data)
      onEvent(data)
    } catch {
      // ignore parse error
    }
  }

  eventSource.onerror = () => {
    onConnectionChange?.(false)
  }

  return () => {
    eventSource.close()
  }
}

export async function detectWorkspaceProjects(): Promise<{ detected: import("./types.ts").DetectedService[] }> {
  const res = await fetch(`${API_BASE}/api/wizard/detect`)
  if (!res.ok) throw new Error("Failed to scan workspace")
  return res.json()
}

export async function setActiveEnvironment(
  environment: string,
): Promise<{ ok: boolean; activeEnvironment: string; defaultEnvironment: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/config/environment/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ environment }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to set active environment")
  }
  return json
}

export async function saveEnvironment(
  name: string,
  data: {
    url?: string
    description?: string
    scenarios?: string
    flows?: string
    results?: string
    env?: Record<string, string>
  },
  dbPath?: string,
): Promise<{
  ok: boolean
  message: string
  environments: Record<string, any>
  dbPath?: string
  hasEnvironments?: boolean
}> {
  const res = await fetch(`${API_BASE}/api/config/environment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...data, dbPath }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to save environment")
  }
  return json
}

export async function deleteEnvironment(
  name: string,
): Promise<{ ok: boolean; message: string; environments: Record<string, any> }> {
  const res = await fetch(`${API_BASE}/api/config/environment?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to delete environment")
  }
  return json
}

export async function savePlatform(
  platform: import("./types.ts").WizardComponent,
  scaffoldFiles = false,
): Promise<{ ok: boolean; message: string; targets: Record<string, any>; services: Record<string, any> }> {
  const res = await fetch(`${API_BASE}/api/config/platform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...platform, scaffoldFiles }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to save platform")
  }
  return json
}

export async function deletePlatform(
  name: string,
): Promise<{ ok: boolean; message: string; targets: Record<string, any>; services: Record<string, any> }> {
  const res = await fetch(`${API_BASE}/api/config/platform?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to delete platform")
  }
  return json
}

export async function fetchEnvPlatforms(
  env?: string,
): Promise<{ ok: boolean; envPlatforms: import("./types.ts").EnvPlatformRecord[]; platformsWithEnv?: import("./types.ts").PlatformWithEnvOverrides[] }> {
  const query = env ? `?env=${encodeURIComponent(env)}` : ""
  const res = await fetch(`${API_BASE}/api/config/env-platforms${query}`)
  if (!res.ok) throw new Error("Failed to load environment platforms")
  return res.json()
}

export async function saveEnvPlatform(
  data: import("./types.ts").EnvPlatformRecord,
): Promise<{
  ok: boolean
  message: string
  envPlatforms: import("./types.ts").EnvPlatformRecord[]
  platformsWithEnv: import("./types.ts").PlatformWithEnvOverrides[]
  targets: Record<string, any>
  services: Record<string, any>
}> {
  const res = await fetch(`${API_BASE}/api/config/env-platform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to save environment platform")
  }
  return json
}

export async function deleteEnvPlatform(
  env: string,
  platformId: string,
): Promise<{
  ok: boolean
  message: string
  envPlatforms: import("./types.ts").EnvPlatformRecord[]
  platformsWithEnv: import("./types.ts").PlatformWithEnvOverrides[]
}> {
  const res = await fetch(
    `${API_BASE}/api/config/env-platform?env=${encodeURIComponent(env)}&platformId=${encodeURIComponent(platformId)}`,
    {
      method: "DELETE",
    },
  )
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to remove environment platform link")
  }
  return json
}

export async function saveFixture(
  name: string,
  data: { cmd: string; cwd?: string },
): Promise<{ ok: boolean; message: string; fixtures: string[]; fixturesMap: Record<string, { cmd: string; cwd?: string }> }> {
  const res = await fetch(`${API_BASE}/api/config/fixture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cmd: data.cmd, cwd: data.cwd }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to save fixture")
  }
  return json
}

export async function deleteFixture(
  name: string,
): Promise<{ ok: boolean; message: string; fixtures: string[]; fixturesMap: Record<string, { cmd: string; cwd?: string }> }> {
  const res = await fetch(`${API_BASE}/api/config/fixture?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to delete fixture")
  }
  return json
}

export async function runFixtureTest(
  params: { name?: string; cmd?: string; cwd?: string },
): Promise<{ ok: boolean; exitCode: number; output: string; durationMs: number }> {
  const res = await fetch(`${API_BASE}/api/fixtures/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  const json = await res.json()
  if (!res.ok && !json.output) {
    throw new Error(json.error ?? "Failed to run fixture command")
  }
  return json
}

export async function fetchStepRuns(params?: {
  scenarioId?: string
  stepId?: string
  runId?: string
  limit?: number
}): Promise<StepRunItem[]> {
  const searchParams = new URLSearchParams()
  if (params?.scenarioId) searchParams.set("scenarioId", params.scenarioId)
  if (params?.stepId) searchParams.set("stepId", params.stepId)
  if (params?.runId) searchParams.set("runId", params.runId)
  if (params?.limit) searchParams.set("limit", String(params.limit))
  const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
  const res = await fetch(`${API_BASE}/api/step-runs${query}`)
  if (!res.ok) throw new Error("Failed to load step runs")
  return res.json()
}

export async function fetchStepGroups(): Promise<{ stepGroups: StepGroup[] }> {
  const res = await fetch(`${API_BASE}/api/step-groups`)
  if (!res.ok) throw new Error("Failed to load step groups")
  return res.json()
}

export async function saveStepGroup(group: StepGroup): Promise<{ ok: boolean; stepGroup: StepGroup }> {
  const res = await fetch(`${API_BASE}/api/step-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(group),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Failed to save step group")
  return json
}

export async function deleteStepGroup(id: string): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/api/step-groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Failed to delete step group")
  return json
}

export async function fetchStepPresets(): Promise<{ presets: StepPreset[] }> {
  const res = await fetch(`${API_BASE}/api/presets`)
  if (!res.ok) throw new Error("Failed to load presets")
  return res.json()
}

export async function saveStepPreset(preset: StepPreset): Promise<{ ok: boolean; preset: StepPreset }> {
  const res = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Failed to save preset")
  return json
}

export async function deleteStepPreset(id: string): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/api/presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Failed to delete preset")
  return json
}

