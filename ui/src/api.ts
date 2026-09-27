import type {
  ConfigMeta,
  FlowItem,
  ModuleFile,
  PreflightData,
  RunEvent,
  RunHistoryItem,
  RunSummary,
  ScenarioItem,
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

export async function fetchRunDetails(runId: string): Promise<{
  runId: string
  scenarios: Record<string, Array<{ name: string; url: string; isImage: boolean }>>
  runLog: string
}> {
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

export async function initProjectConfig(): Promise<{ ok: boolean; created: string[]; skipped: string[] }> {
  const res = await fetch(`${API_BASE}/api/init`, { method: "POST" })
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to initialize project")
  }
  return data
}

export async function fetchModules(): Promise<ModuleFile[]> {
  const res = await fetch(`${API_BASE}/api/modules`)
  if (!res.ok) throw new Error("Failed to load modules")
  return res.json()
}

export async function saveModule(data: {
  category: "web" | "fixture" | "helper"
  target?: string
  name: string
  content: string
}): Promise<ModuleFile> {
  const res = await fetch(`${API_BASE}/api/modules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to save module")
  }
  return json.file
}

export async function deleteModule(params: {
  category: "web" | "fixture" | "helper"
  target?: string
  name: string
}): Promise<void> {
  const query = new URLSearchParams({
    category: params.category,
    name: params.name,
    ...(params.target ? { target: params.target } : {}),
  })
  const res = await fetch(`${API_BASE}/api/modules?${query.toString()}`, {
    method: "DELETE",
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to delete module")
  }
}

export async function detectWorkspaceProjects(): Promise<{ detected: import("./types.ts").DetectedService[] }> {
  const res = await fetch(`${API_BASE}/api/wizard/detect`)
  if (!res.ok) throw new Error("Failed to scan workspace")
  return res.json()
}

export async function applyWizardConfig(
  data: import("./types.ts").WizardApplyPayload,
): Promise<{ ok: boolean; message: string; created: string[]; skipped: string[] }> {
  const res = await fetch(`${API_BASE}/api/wizard/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? "Failed to apply configuration")
  }
  return json
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
