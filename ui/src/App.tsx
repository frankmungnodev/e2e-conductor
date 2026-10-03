import { useEffect, useRef, useState } from "react"
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
import { Button } from "./components/Button.tsx"
import { EnvironmentModal } from "./components/EnvironmentModal.tsx"
import { Header, type TabType } from "./components/Header.tsx"
import { PreflightView } from "./components/PreflightView.tsx"
import { useUrlTab } from "./components/Tabs.tsx"
import { ToastProvider, useToast } from "./components/Toast.tsx"
import { finishToast } from "./runResult.ts"
import type { ConfigMeta, FlowItem, PreflightData, RunEvent, RunSummary, ScenarioItem } from "./types.ts"
import { ConfigView } from "./views/config/ConfigView.tsx"
import { RunnerView } from "./views/runner/RunnerView.tsx"
import { ScenarioBuilder } from "./views/scenario-builder/ScenarioBuilder.tsx"

const VALID_MAIN_TABS = ["scenarios", "runner", "artifacts", "preflight", "config"] as const

function AppContent() {
  const [activeTab, setActiveTab] = useUrlTab<TabType>("tab", "scenarios", VALID_MAIN_TABS)
  const [config, setConfig] = useState<ConfigMeta | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([])
  const [flows, setFlows] = useState<FlowItem[]>([])
  const [preflightData, setPreflightData] = useState<PreflightData | null>(null)
  const [isPreflightLoading, setIsPreflightLoading] = useState(false)
  const [isConnected, setIsConnected] = useState<boolean>(true)
  const isConnectedRef = useRef(isConnected)
  isConnectedRef.current = isConnected

  // Live execution state
  const [isRunning, setIsRunning] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | undefined>()
  const [lastSummary, setLastSummary] = useState<RunSummary | undefined>()
  const [events, setEvents] = useState<RunEvent[]>([])
  const [logs, setLogs] = useState<Array<{ text: string; level: "info" | "detail" }>>([])

  const { error: toastError, success: toastSuccess } = useToast()

  // Load initial data
  const loadInitialData = async (retryCount = 0) => {
    try {
      const [cfg, scList, flList] = await Promise.all([
        fetchConfig(),
        fetchScenarios(),
        fetchFlows().catch(() => []),
      ])
      setConfig(cfg)
      setScenarios(scList)
      setFlows(flList)
      setIsConnected(true)
    } catch (e) {
      console.warn("Backend not yet ready:", (e as Error).message)
      setIsConnected(false)
      if (retryCount < 5) {
        setTimeout(() => loadInitialData(retryCount + 1), 1000)
      }
    }
  }

  // Load preflight checks
  const runPreflightCheck = async () => {
    setIsPreflightLoading(true)
    try {
      const data = await fetchPreflight()
      setPreflightData(data)
      setIsConnected(true)
    } catch (_e) {
      setIsConnected(false)
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
      setIsConnected(true)
    } catch (_e) {
      // ignore
    }
  }

  useEffect(() => {
    loadInitialData()
    runPreflightCheck()
    checkRunStatus()

    // Subscribe to SSE events
    const unsubscribe = subscribeToEvents(
      (event) => {
        setIsConnected(true)
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
          fetchScenarios().then(setScenarios).catch(() => {})
          const toast = finishToast(event.summary)
          if (toast.tone === "success") toastSuccess(toast.message, toast.title)
          else toastError(toast.message, toast.title)
        }
      },
      (connected) => {
        setIsConnected(connected)
        if (connected) {
          loadInitialData()
          runPreflightCheck()
          checkRunStatus()
        }
      },
    )

    // Periodic retry if disconnected
    const retryInterval = setInterval(() => {
      if (!isConnectedRef.current) {
        loadInitialData()
        runPreflightCheck()
      }
    }, 4000)

    return () => {
      unsubscribe()
      clearInterval(retryInterval)
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
      toastError((e as Error).message, "Failed to Start Run")
      setIsRunning(false)
    }
  }

  const handleStopRun = async () => {
    try {
      await stopRun()
    } catch (e) {
      toastError((e as Error).message, "Failed to Stop Run")
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

  const handleNavigateToConfig = (sub = "fixtures") => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", "config")
      url.searchParams.set("sub", sub)
      window.history.pushState({}, "", url.toString())
    } catch {
      // ignore
    }
    setActiveTab("config")
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-editor text-fg selection:bg-selection selection:text-white">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isRunning={isRunning}
        lastSummaryStatus={lastSummary?.status}
        scenariosCount={scenarios.length}
        isConnected={isConnected}
      />

      {!isConnected && (
        <div className="bg-error-bg border-b border-error-border px-4 py-1.5 flex items-center justify-between text-xs text-error">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
            <span>Cannot reach e2e runner server on port 4173. Waiting for server to respond...</span>
          </div>
          <Button
            size="xs"
            variant="danger"
            onClick={() => {
              loadInitialData()
              runPreflightCheck()
            }}
          >
            Retry Connection
          </Button>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "runner" && (
          <RunnerView
            scenarios={scenarios}
            config={config ?? undefined}
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

        {activeTab === "artifacts" && <ArtifactsView />}

        {activeTab === "scenarios" && (
          <ScenarioBuilder
            scenarios={scenarios}
            flows={flows}
            config={config ?? undefined}
            isRunning={isRunning}
            onStartRun={handleStartRun}
            onSaveScenario={handleSaveScenario}
            onDeleteScenario={handleDeleteScenario}
            onSaveFlow={handleSaveFlow}
            onNavigateToConfig={handleNavigateToConfig}
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

        {activeTab === "config" && (
          <ConfigView config={config} onConfigReload={loadInitialData} />
        )}
      </main>

      {/* Undismissable Initial Environment Setup Modal */}
      {Boolean(config && !config.hasEnvironments) && (
        <EnvironmentModal
          isOpen={true}
          dismissable={false}
          isInitialSetup={true}
          initialDbPath={config?.dbPath || ".e2e"}
          onClose={() => {}}
          onSaved={async () => {
            await loadInitialData()
          }}
        />
      )}
    </div>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App
