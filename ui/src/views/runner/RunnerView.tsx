import { useEffect, useMemo, useRef, useState } from "react"
import { useUrlTab } from "../../components/Tabs.tsx"
import type { ConfigMeta, RunEvent, RunSummary, ScenarioItem } from "../../types.ts"
import { buildExecutionTree, type ScenarioState } from "./executionTree.ts"
import { LogPane } from "./LogPane.tsx"
import { PausePanel } from "./PausePanel.tsx"
import { RunControls } from "./RunControls.tsx"
import { RunStatusBar } from "./RunStatusBar.tsx"
import { runCounts } from "./runCounts.ts"
import { ScenarioExplorer } from "./ScenarioExplorer.tsx"
import { ScenarioPreview } from "./ScenarioPreview.tsx"
import { StepTreePane } from "./StepTreePane.tsx"
import { usePause } from "./usePause.ts"
import { useRunOptions } from "./useRunOptions.ts"

type RunnerViewProps = {
  scenarios: ScenarioItem[]
  config?: ConfigMeta
  isRunning: boolean
  currentRunId?: string
  lastSummary?: RunSummary
  onStartRun: (options: {
    scenarios: string[]
    repeat: number
    start: boolean
    install: boolean
    headless: boolean
    verbose: boolean
    pauseOnFailure: boolean
  }) => void
  onStopRun: () => void
  events: RunEvent[]
  logs: Array<{ text: string; level: "info" | "detail" }>
  onClearLogs: () => void
}

const VIEW_MODES = ["split", "steps", "logs"] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export function RunnerView({
  scenarios,
  config,
  isRunning,
  currentRunId,
  lastSummary,
  onStartRun,
  onStopRun,
  events,
  logs,
  onClearLogs,
}: RunnerViewProps) {
  // Controls state
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([])
  const options = useRunOptions()
  const { repeat, startServices, installMobile, headless, verbose, pauseOnFailure } = options
  const pause = usePause(events, isRunning)
  const [scenarioFilter, setScenarioFilter] = useState<string>("")
  const [logFilter, setLogFilter] = useState<string>("")
  const [autoScroll, setAutoScroll] = useState<boolean>(true)

  // Focused scenario for preview when idle
  const [previewScenarioId, setPreviewScenarioId] = useState<string | null>(null)

  // View mode synchronized with URL
  const [viewMode, setViewMode] = useUrlTab<ViewMode>("view", "split", VIEW_MODES)

  // Execution tree reconstructed from events
  const [executionTree, setExecutionTree] = useState<ScenarioState[]>([])
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Sync selected scenarios when scenarios load or change
  useEffect(() => {
    setSelectedScenarios((prev) => {
      const valid = prev.filter((id) => scenarios.some((s) => s.id === id))
      if (valid.length === 0 && scenarios.length > 0) {
        return scenarios.map((s) => s.id)
      }
      return valid
    })
    if (!previewScenarioId && scenarios.length > 0) {
      setPreviewScenarioId(scenarios[0].id)
    }
  }, [scenarios, previewScenarioId])

  // Build live execution tree from events
  useEffect(() => {
    setExecutionTree(buildExecutionTree(events, scenarios))
  }, [events, scenarios])

  // Scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, autoScroll])

  const toggleAllScenarios = () => {
    if (selectedScenarios.length === scenarios.length) {
      setSelectedScenarios([])
    } else {
      setSelectedScenarios(scenarios.map((s) => s.id))
    }
  }

  const toggleScenario = (id: string) => {
    setSelectedScenarios((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleRun = () => {
    if (selectedScenarios.length === 0) return
    onStartRun({
      scenarios: selectedScenarios,
      repeat,
      start: startServices,
      install: installMobile,
      headless,
      verbose,
      pauseOnFailure,
    })
  }

  const handleRunSingle = (scenarioId: string) => {
    onStartRun({
      scenarios: [scenarioId],
      repeat,
      start: startServices,
      install: installMobile,
      headless,
      verbose,
      pauseOnFailure,
    })
  }

  // Summary statistics; not-run scenarios count as complete once the run has finished.
  const counts = runCounts(executionTree, lastSummary)

  const filteredLogs = useMemo(() => {
    if (!logFilter) return logs
    const needle = logFilter.toLowerCase()
    return logs.filter((l) => l.text.toLowerCase().includes(needle))
  }, [logs, logFilter])

  const filteredScenarios = scenarioFilter
    ? scenarios.filter(
        (s) =>
          s.name.toLowerCase().includes(scenarioFilter.toLowerCase()) ||
          s.id.toLowerCase().includes(scenarioFilter.toLowerCase()),
      )
    : scenarios

  const activePreviewScenario =
    scenarios.find((s) => s.id === previewScenarioId) || scenarios[0] || null

  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden bg-editor select-none">
      {/* Left Column: Test Explorer & Execution Controls */}
      <aside className="w-80 md:w-84 border-r border-border flex flex-col bg-sidebar select-none shrink-0">
        <ScenarioExplorer
          scenarios={scenarios}
          filteredScenarios={filteredScenarios}
          selectedScenarios={selectedScenarios}
          toggleAllScenarios={toggleAllScenarios}
          toggleScenario={toggleScenario}
          previewScenarioId={previewScenarioId}
          setPreviewScenarioId={setPreviewScenarioId}
          lastSummary={lastSummary}
          isRunning={isRunning}
          scenarioFilter={scenarioFilter}
          setScenarioFilter={setScenarioFilter}
          handleRunSingle={handleRunSingle}
          config={config}
        />

        {/* Sidebar Footer: Run Settings & Launch Button */}
        <RunControls
          options={options}
          isRunning={isRunning}
          selectedScenarios={selectedScenarios}
          onStopRun={onStopRun}
          handleRun={handleRun}
        />
      </aside>

      {/* Right Area: Interactive Results Stage & Terminal */}
      <main className="flex-1 flex flex-col overflow-hidden bg-editor">
        <RunStatusBar
          isRunning={isRunning}
          lastSummary={lastSummary}
          counts={counts}
          viewMode={viewMode}
          setViewMode={setViewMode}
          logFilter={logFilter}
          setLogFilter={setLogFilter}
          autoScroll={autoScroll}
          setAutoScroll={setAutoScroll}
          onClearLogs={onClearLogs}
        />

        <PausePanel pause={pause} scenarios={scenarios} onStopRun={onStopRun} />

        {/* Center Canvas Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Case 1: Initial Idle State (No tests active or ran yet) */}
          {executionTree.length === 0 && !isRunning && !lastSummary ? (
            <ScenarioPreview activePreviewScenario={activePreviewScenario} handleRunSingle={handleRunSingle} config={config} />
          ) : (
            /* Case 2: Test Execution Results & Live Stream */
            <div className="flex-1 flex overflow-hidden">
              {/* Left Pane: Steps & Scenario Tree (in split or steps mode) */}
              {(viewMode === "split" || viewMode === "steps") && (
                <StepTreePane viewMode={viewMode} executionTree={executionTree} lastSummary={lastSummary} config={config} />
              )}

              {/* Right Pane: Live Terminal Logs (in split or logs mode) */}
              {(viewMode === "split" || viewMode === "logs") && (
                <LogPane
                  viewMode={viewMode}
                  logs={logs}
                  filteredLogs={filteredLogs}
                  currentRunId={currentRunId}
                  terminalEndRef={terminalEndRef}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
