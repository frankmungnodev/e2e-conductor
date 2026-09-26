import type {
  ConfigMeta,
  FlowItem,
  PreflightData,
  RunEvent,
  RunHistoryItem,
  RunSummary,
  ScenarioItem,
} from "./types.ts"

const API_BASE = ""

export async function fetchConfig(): Promise<ConfigMeta> {
  const res = await fetch(`${API_BASE}/api/config`)
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

