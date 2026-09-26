import {
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Play,
  Search,
  Square,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { RunEvent, RunSummary, ScenarioItem } from "../types.ts"

type RunnerViewProps = {
  scenarios: ScenarioItem[]
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
  }) => void
  onStopRun: () => void
  events: RunEvent[]
  logs: Array<{ text: string; level: "info" | "detail" }>
  onClearLogs: () => void
}

type StepState = {
  name: string
  target: string
  status: "pending" | "running" | "passed" | "failed"
  duration_ms?: number
  error?: string
}

type ScenarioState = {
  id: string
  name: string
  iteration: number
  totalIterations: number
  status: "pending" | "running" | "passed" | "failed"
  duration_ms?: number
  error?: string
  steps: StepState[]
}

export function RunnerView({
  scenarios,
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
  const [repeat, setRepeat] = useState<number>(1)
  const [startServices, setStartServices] = useState<boolean>(true)
  const [installMobile, setInstallMobile] = useState<boolean>(false)
  const [headless, setHeadless] = useState<boolean>(false)
  const [verbose, setVerbose] = useState<boolean>(true)
  const [logFilter, setLogFilter] = useState<string>("")
  const [autoScroll, setAutoScroll] = useState<boolean>(true)

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
  }, [scenarios])

  // Build live execution tree from events
  useEffect(() => {
    let tree: ScenarioState[] = []

    for (const ev of events) {
      if (ev.type === "run_start") {
        tree = []
        for (let iter = 1; iter <= ev.repeat; iter++) {
          for (const s of ev.scenarios) {
            const scObj = scenarios.find((item) => item.id === s.id)
            tree.push({
              id: s.id,
              name: s.name,
              iteration: iter,
              totalIterations: ev.repeat,
              status: "pending",
              steps: (scObj?.steps ?? []).map((step) => ({
                name: step.name,
                target: step.target,
                status: "pending",
              })),
            })
          }
        }
      } else if (ev.type === "scenario_start") {
        const target = tree.find((s) => s.id === ev.scenarioId && s.iteration === ev.iteration)
        if (target) {
          target.status = "running"
        }
      } else if (ev.type === "step_start") {
        const target = tree.find((s) => s.id === ev.scenarioId && s.status === "running")
        if (target) {
          if (!target.steps[ev.index]) {
            target.steps[ev.index] = {
              name: ev.stepName,
              target: ev.target,
              status: "running",
            }
          } else {
            target.steps[ev.index].status = "running"
          }
        }
      } else if (ev.type === "step_pass") {
        const target = tree.find((s) => s.id === ev.scenarioId && s.status === "running")
        if (target) {
          if (!target.steps[ev.index]) {
            target.steps[ev.index] = {
              name: ev.stepName,
              target: ev.target,
              status: "passed",
              duration_ms: ev.duration_ms,
            }
          } else {
            target.steps[ev.index].status = "passed"
            target.steps[ev.index].duration_ms = ev.duration_ms
          }
        }
      } else if (ev.type === "step_fail") {
        const target = tree.find((s) => s.id === ev.scenarioId && s.status === "running")
        if (target) {
          if (!target.steps[ev.index]) {
            target.steps[ev.index] = {
              name: ev.stepName,
              target: ev.target,
              status: "failed",
              duration_ms: ev.duration_ms,
              error: ev.error,
            }
          } else {
            target.steps[ev.index].status = "failed"
            target.steps[ev.index].duration_ms = ev.duration_ms
            target.steps[ev.index].error = ev.error
          }
        }
      } else if (ev.type === "scenario_end") {
        const target = tree.find((s) => s.id === ev.scenarioId && s.iteration === ev.iteration)
        if (target) {
          target.status = ev.passed ? "passed" : "failed"
          target.duration_ms = ev.duration_ms
          target.error = ev.error
        }
      }
    }

    setExecutionTree([...tree])
  }, [events, scenarios])

  // Autoscroll terminal
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
    setSelectedScenarios((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
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
    })
  }

  // Summary statistics
  const totalCount = executionTree.length > 0 ? executionTree.length : (lastSummary ? lastSummary.total : 0)
  const passedCount =
    executionTree.length > 0
      ? executionTree.filter((s) => s.status === "passed").length
      : (lastSummary ? lastSummary.passed : 0)
  const failedCount =
    executionTree.length > 0
      ? executionTree.filter((s) => s.status === "failed").length
      : (lastSummary ? lastSummary.failed : 0)
  const percentComplete =
    totalCount > 0 ? Math.round(((passedCount + failedCount) / totalCount) * 100) : (lastSummary ? 100 : 0)

  const filteredLogs = logFilter
    ? logs.filter((l) => l.text.toLowerCase().includes(logFilter.toLowerCase()))
    : logs

  const getTargetBadgeStyle = (target: string) => {
    if (target === "shell") return "bg-amber-500/10 text-amber-300 border-amber-500/30"
    if (target.includes("api") || target.includes("http")) return "bg-sky-500/10 text-sky-300 border-sky-500/30"
    if (target.includes("mobile") || target.includes("app")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    return "bg-purple-500/10 text-purple-300 border-purple-500/30"
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] overflow-hidden">
      {/* Run Configuration Bar */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Scenario Selection dropdown / count */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scenarios:</span>
            <button
              onClick={toggleAllScenarios}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
            >
              {selectedScenarios.length === scenarios.length ? "Deselect All" : "Select All"} (
              {selectedScenarios.length}/{scenarios.length})
            </button>
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-xs">
              {scenarios.map((sc) => (
                <label
                  key={sc.id}
                  className="flex items-center gap-1 text-[11px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedScenarios.includes(sc.id)}
                    onChange={() => toggleScenario(sc.id)}
                    disabled={isRunning}
                    className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                  />
                  <span className="truncate max-w-[80px]">{sc.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Repeat */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-medium">Repeat:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={repeat}
              onChange={(e) => setRepeat(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={isRunning}
              className="w-14 px-2 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 text-center"
            />
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Flags */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={startServices}
                onChange={(e) => setStartServices(e.target.checked)}
                disabled={isRunning}
                className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
              />
              <span>Start Services</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={installMobile}
                onChange={(e) => setInstallMobile(e.target.checked)}
                disabled={isRunning}
                className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
              />
              <span>Install Mobile</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
                disabled={isRunning}
                className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
              />
              <span>Headless</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={verbose}
                onChange={(e) => setVerbose(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
              />
              <span>Verbose</span>
            </label>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={onStopRun}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition shadow-lg shadow-rose-900/30"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Run
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={selectedScenarios.length === 0}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-xs transition shadow-lg ${
                selectedScenarios.length === 0
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20 font-bold"
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run {selectedScenarios.length} Scenario{selectedScenarios.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>

      {/* Progress & Metrics Banner */}
      <div className="bg-slate-950/60 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Status:</span>
            {isRunning ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> RUNNING
              </span>
            ) : lastSummary?.status === "PASSED" ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> PASSED
              </span>
            ) : lastSummary?.status === "FAILED" ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                <XCircle className="w-3.5 h-3.5" /> FAILED
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-400">IDLE</span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="text-emerald-400 font-mono">Passed: {passedCount}</span>
            <span className="text-rose-400 font-mono">Failed: {failedCount}</span>
            <span className="text-slate-400 font-mono">Total: {totalCount}</span>
          </div>

          {currentRunId && (
            <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Run: {currentRunId}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-3 w-72">
          <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${failedCount > 0 ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <span className="text-xs font-mono text-slate-400 w-10 text-right">{percentComplete}%</span>
        </div>
      </div>

      {/* Main Split Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Scenario & Step Tree */}
        <div className="w-1/2 border-r border-slate-800 flex flex-col bg-slate-950/40">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Scenarios & Steps
            </span>
            <span className="text-xs text-slate-500">
              {executionTree.length > 0 ? `${executionTree.length} scenario runs` : "Ready to run"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {executionTree.length === 0 ? (
              lastSummary?.status === "FAILED" && (lastSummary.failures?.length ?? 0) > 0 ? (
                <div className="p-2 space-y-3">
                  <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-4 text-xs text-rose-300">
                    <div className="font-semibold flex items-center gap-2 text-rose-200 text-sm mb-2">
                      <XCircle className="w-4 h-4 text-rose-400" />
                      Execution Error
                    </div>
                    {lastSummary.failures.map((f, i) => (
                      <div
                        key={i}
                        className="mt-2 bg-slate-950/90 p-3 rounded-lg border border-rose-900/40 font-mono text-[11px] text-rose-200 whitespace-pre-wrap"
                      >
                        {f.error}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-8">
                  <Play className="w-10 h-10 mb-3 opacity-30 stroke-1" />
                  <p className="text-sm font-medium text-slate-400">No active execution</p>
                  <p className="text-xs mt-1 text-slate-600 max-w-sm">
                    Select scenarios and click "Run Scenarios" above to start testing. Live steps and assertion results will appear here.
                  </p>
                </div>
              )
            ) : (
              executionTree.map((sc, scIdx) => (
                <div
                  key={`${sc.id}-${sc.iteration}-${scIdx}`}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
                >
                  {/* Scenario Header */}
                  <div className="p-3 bg-slate-800/60 border-b border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {sc.status === "running" && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
                      {sc.status === "passed" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {sc.status === "failed" && <XCircle className="w-4 h-4 text-rose-400" />}
                      {sc.status === "pending" && <div className="w-2 h-2 rounded-full bg-slate-600 mx-1" />}
                      <div>
                        <div className="font-semibold text-xs text-slate-200">{sc.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {sc.id} {sc.totalIterations > 1 ? `(${sc.iteration}/${sc.totalIterations})` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {sc.duration_ms !== undefined && (
                        <span className="text-[10px] text-slate-400 font-mono">{sc.duration_ms}ms</span>
                      )}
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          sc.status === "passed"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : sc.status === "failed"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : sc.status === "running"
                            ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {sc.status}
                      </span>
                    </div>
                  </div>

                  {/* Steps List */}
                  <div className="divide-y divide-slate-800/40">
                    {sc.steps.map((st, stIdx) => (
                      <div key={stIdx} className="px-4 py-2 flex items-start justify-between text-xs hover:bg-slate-800/20">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">
                            {st.status === "running" && <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />}
                            {st.status === "passed" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {st.status === "failed" && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                            {st.status === "pending" && <div className="w-1.5 h-1.5 rounded-full bg-slate-700 my-1 mx-1" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${getTargetBadgeStyle(
                                  st.target,
                                )}`}
                              >
                                {st.target}
                              </span>
                              <span className="font-medium text-slate-300">{st.name}</span>
                            </div>
                            {st.error && (
                              <div className="mt-1 p-2 bg-rose-950/40 border border-rose-800/50 rounded text-rose-300 text-[11px] font-mono whitespace-pre-wrap">
                                {st.error}
                              </div>
                            )}
                          </div>
                        </div>

                        {st.duration_ms !== undefined && (
                          <span className="text-[10px] text-slate-500 font-mono">{st.duration_ms}ms</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Live Terminal Logs */}
        <div className="w-1/2 flex flex-col bg-slate-950">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Live Logs</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {logs.length} lines
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Filter */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="pl-7 pr-2 py-1 text-[11px] rounded bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 w-36 focus:w-48 transition-all"
                />
              </div>

              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2 py-1 rounded text-[11px] border font-medium ${
                  autoScroll
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300"
                }`}
              >
                Auto-scroll
              </button>

              <button
                onClick={onClearLogs}
                title="Clear logs"
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Terminal Box */}
          <div className="flex-1 p-4 font-mono text-[12px] overflow-y-auto leading-relaxed text-slate-300 space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-slate-600 italic">No output yet. Start a run to stream execution logs.</div>
            ) : (
              filteredLogs.map((log, index) => {
                const isPass = log.text.includes("✓") || log.text.includes("PASSED")
                const isFail = log.text.includes("✗") || log.text.includes("FAILED")
                const isHeading = log.text.includes("▶") || log.text.startsWith("Preflight")

                let colorClass = "text-slate-300"
                if (isPass) colorClass = "text-emerald-400 font-semibold"
                else if (isFail) colorClass = "text-rose-400 font-semibold"
                else if (isHeading) colorClass = "text-sky-300 font-bold"
                else if (log.level === "detail") colorClass = "text-slate-500"

                return (
                  <div key={index} className={`whitespace-pre-wrap ${colorClass}`}>
                    {log.text}
                  </div>
                )
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
