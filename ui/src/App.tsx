import { useEffect, useState } from "react"
import {
  deleteScenario,
  fetchConfig,
  fetchFlows,
  fetchPreflight,
  fetchRunStatus,
  fetchScenarios,
  saveFlow,
  saveScenario,
  startRun,
  startService,
  stopRun,
  subscribeToEvents,
} from "./api.ts"
import { ArtifactsView } from "./components/ArtifactsView.tsx"
import { Header, type TabType } from "./components/Header.tsx"
import { PreflightView } from "./components/PreflightView.tsx"
import { RunnerView } from "./components/RunnerView.tsx"
import { ScenarioBuilder } from "./components/ScenarioBuilder.tsx"
import type { ConfigMeta, FlowItem, PreflightData, RunEvent, RunSummary, ScenarioItem } from "./types.ts"

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>("runner")
  const [config, setConfig] = useState<ConfigMeta | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([])
  const [flows, setFlows] = useState<FlowItem[]>([])
  const [preflightData, setPreflightData] = useState<PreflightData | null>(null)
  const [isPreflightLoading, setIsPreflightLoading] = useState(false)

  // Live execution state
  const [isRunning, setIsRunning] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | undefined>()
  const [lastSummary, setLastSummary] = useState<RunSummary | undefined>()
  const [events, setEvents] = useState<RunEvent[]>([])
  const [logs, setLogs] = useState<Array<{ text: string; level: "info" | "detail" }>>([])

  // Load initial data
  const loadInitialData = async () => {
    try {
      const [cfg, scList, flList] = await Promise.all([
        fetchConfig(),
        fetchScenarios(),
        fetchFlows().catch(() => []),
      ])
      setConfig(cfg)
      setScenarios(scList)
      setFlows(flList)
    } catch (e) {
      console.error("Initial load error:", e)
    }
  }

  // Load preflight checks
  const runPreflightCheck = async () => {
    setIsPreflightLoading(true)
    try {
      const data = await fetchPreflight()
      setPreflightData(data)
    } catch (e) {
      console.error("Preflight error:", e)
    } finally {
      setIsPreflightLoading(false)
    }
  }

  // Poll active run status
  const checkRunStatus = async () => {
    try {
      const status = await fetchRunStatus()
      setIsRunning(status.isRunning)
      if (status.currentRun) {
        setCurrentRunId(status.currentRun.runId)
      }
      if (status.lastSummary) {
        setLastSummary(status.lastSummary)
      }
    } catch (_e) {
      // ignore
    }
  }

  useEffect(() => {
    loadInitialData()
    runPreflightCheck()
    checkRunStatus()

    // Subscribe to SSE events
    const unsubscribe = subscribeToEvents((event) => {
      setEvents((prev) => [...prev, event])

      if (event.type === "connected") {
        if (event.active) setIsRunning(true)
      } else if (event.type === "run_start") {
        setIsRunning(true)
        setCurrentRunId(event.runId)
      } else if (event.type === "log") {
        setLogs((prev) => [...prev, { text: event.text, level: event.level }])
      } else if (event.type === "finish") {
        setIsRunning(false)
        setLastSummary(event.summary)
        // Refresh scenarios and runs list
        fetchScenarios().then(setScenarios).catch(() => {})
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleStartRun = async (options: {
    scenarios: string[]
    repeat: number
    start: boolean
    install: boolean
    headless: boolean
    verbose: boolean
  }) => {
    try {
      setIsRunning(true)
      setLogs([])
      setEvents([])
      const res = await startRun(options)
      setCurrentRunId(res.runId)
    } catch (e) {
      alert((e as Error).message)
      setIsRunning(false)
    }
  }

  const handleStopRun = async () => {
    try {
      await stopRun()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleSaveScenario = async (id: string, content: any) => {
    const res = await saveScenario(id, content)
    const list = await fetchScenarios()
    setScenarios(list)
    return res
  }

  const handleDeleteScenario = async (id: string) => {
    await deleteScenario(id)
    const list = await fetchScenarios()
    setScenarios(list)
  }

  const handleSaveFlow = async (target: string, file: string, content: string) => {
    const res = await saveFlow(target, file, content)
    const list = await fetchFlows()
    setFlows(list)
    return res
  }

  const handleStartService = async (name: string) => {
    await startService(name)
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRunning={isRunning}
        lastSummaryStatus={lastSummary?.status}
        scenariosCount={scenarios.length}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab === "runner" && (
          <RunnerView
            scenarios={scenarios}
            isRunning={isRunning}
            currentRunId={currentRunId}
            lastSummary={lastSummary}
            onStartRun={handleStartRun}
            onStopRun={handleStopRun}
            events={events}
            logs={logs}
            onClearLogs={() => setLogs([])}
          />
        )}

        {activeTab === "scenarios" && (
          <ScenarioBuilder
            scenarios={scenarios}
            flows={flows}
            config={config ?? undefined}
            onSaveScenario={handleSaveScenario}
            onDeleteScenario={handleDeleteScenario}
            onSaveFlow={handleSaveFlow}
          />
        )}

        {activeTab === "preflight" && (
          <PreflightView
            preflightData={preflightData}
            config={config}
            isLoading={isPreflightLoading}
            onRefresh={runPreflightCheck}
            onStartService={handleStartService}
          />
        )}

        {activeTab === "artifacts" && <ArtifactsView />}
      </main>
    </div>
  )
}
export default App
