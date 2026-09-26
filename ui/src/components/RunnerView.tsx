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
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { Checkbox } from "./Checkbox.tsx"
import { NumberInput } from "./NumberInput.tsx"
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
    })
  }

  // Summary statistics
  const totalCount =
    executionTree.length > 0 ? executionTree.length : lastSummary ? lastSummary.total : 0
  const passedCount =
    executionTree.length > 0
      ? executionTree.filter((s) => s.status === "passed").length
      : lastSummary
      ? lastSummary.passed
      : 0
  const failedCount =
    executionTree.length > 0
      ? executionTree.filter((s) => s.status === "failed").length
      : lastSummary
      ? lastSummary.failed
      : 0
  const percentComplete =
    totalCount > 0
      ? Math.round(((passedCount + failedCount) / totalCount) * 100)
      : lastSummary
      ? 100
      : 0

  const filteredLogs = logFilter
    ? logs.filter((l) => l.text.toLowerCase().includes(logFilter.toLowerCase()))
    : logs

  const getTargetBadgeVariant = (target: string): BadgeVariant => {
    if (target === "shell") return "driver-shell"
    if (target.includes("api") || target.includes("http")) return "driver-http"
    if (target.includes("mobile") || target.includes("app")) return "driver-mobile"
    return "driver-web"
  }

  return (
    <div className="flex flex-col h-[calc(100vh-49px)] overflow-hidden bg-editor select-none">
      {/* Run Configuration Bar */}
      <div className="bg-sidebar border-b border-border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Scenario Selection dropdown / count */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
              Scenarios:
            </span>
            <Button
              size="xs"
              variant="secondary"
              onClick={toggleAllScenarios}
              disabled={isRunning}
            >
              {selectedScenarios.length === scenarios.length ? "Deselect All" : "Select All"} (
              {selectedScenarios.length}/{scenarios.length})
            </Button>
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-sm">
              {scenarios.map((sc) => (
                <div
                  key={sc.id}
                  className="flex items-center text-[11px] bg-input px-2 py-0.5 rounded-xs border border-border text-fg hover:bg-hover transition-colors shrink-0"
                >
                  <Checkbox
                    size="sm"
                    checked={selectedScenarios.includes(sc.id)}
                    onChange={() => toggleScenario(sc.id)}
                    disabled={isRunning}
                    label={<span className="truncate max-w-[90px]">{sc.name}</span>}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Repeat */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-fg-muted font-medium select-none">Repeat:</span>
            <div className="w-16">
              <NumberInput
                size="xs"
                min={1}
                max={100}
                value={repeat}
                onChange={(val) => setRepeat(val ?? 1)}
                disabled={isRunning}
                className="text-center"
              />
            </div>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Flags */}
          <div className="flex items-center gap-3">
            <Checkbox
              size="sm"
              label="Start Services"
              checked={startServices}
              onChange={(e) => setStartServices(e.target.checked)}
              disabled={isRunning}
            />

            <Checkbox
              size="sm"
              label="Install Mobile"
              checked={installMobile}
              onChange={(e) => setInstallMobile(e.target.checked)}
              disabled={isRunning}
            />

            <Checkbox
              size="sm"
              label="Headless"
              checked={headless}
              onChange={(e) => setHeadless(e.target.checked)}
              disabled={isRunning}
            />

            <Checkbox
              size="sm"
              label="Verbose"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button
              variant="danger"
              size="sm"
              onClick={onStopRun}
              icon={<Square className="w-3.5 h-3.5 fill-current" />}
            >
              Stop Run
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRun}
              disabled={selectedScenarios.length === 0}
              icon={<Play className="w-3.5 h-3.5 fill-current" />}
            >
              Run {selectedScenarios.length} Scenario{selectedScenarios.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>

      {/* Progress & Metrics Banner */}
      <div className="bg-titlebar border-b border-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted font-medium">Status:</span>
            {isRunning ? (
              <Badge variant="warning" dot pulse icon={<Loader2 className="w-3 h-3 animate-spin" />}>
                RUNNING
              </Badge>
            ) : lastSummary?.status === "PASSED" ? (
              <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
                PASSED
              </Badge>
            ) : lastSummary?.status === "FAILED" ? (
              <Badge variant="danger" icon={<XCircle className="w-3 h-3 text-error" />}>
                FAILED
              </Badge>
            ) : (
              <Badge variant="neutral">IDLE</Badge>
            )}
          </div>

          <div className="flex items-center gap-3.5 text-xs font-mono">
            <span className="text-success">Passed: {passedCount}</span>
            <span className="text-error">Failed: {failedCount}</span>
            <span className="text-fg-muted">Total: {totalCount}</span>
          </div>

          {currentRunId && (
            <div className="text-[11px] text-fg-muted font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Run: {currentRunId}</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2.5 w-64">
          <div className="flex-1 bg-input h-1.5 rounded-full overflow-hidden border border-border">
            <div
              className={`h-full transition-all duration-300 ${
                failedCount > 0 ? "bg-error" : "bg-primary"
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <span className="text-xs font-mono text-fg-muted w-9 text-right">
            {percentComplete}%
          </span>
        </div>
      </div>

      {/* Main Split Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Scenario & Step Tree */}
        <div className="w-1/2 border-r border-border flex flex-col bg-editor">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-sidebar">
            <span className="text-xs font-semibold text-fg-bright uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Scenarios & Steps
            </span>
            <span className="text-[11px] text-fg-muted">
              {executionTree.length > 0 ? `${executionTree.length} scenario runs` : "Ready to run"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {executionTree.length === 0 ? (
              lastSummary?.status === "FAILED" && (lastSummary.failures?.length ?? 0) > 0 ? (
                <div className="p-2 space-y-2">
                  <div className="bg-error-bg border border-error-border rounded-xs p-3 text-xs text-error">
                    <div className="font-semibold flex items-center gap-2 text-error text-xs mb-2">
                      <XCircle className="w-4 h-4 text-error" />
                      Execution Error
                    </div>
                    {lastSummary.failures.map((f, i) => (
                      <div
                        key={i}
                        className="mt-2 bg-editor p-2.5 rounded-xs border border-error-border font-mono text-[11px] text-fg whitespace-pre-wrap"
                      >
                        {f.error}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-fg-muted p-8">
                  <Play className="w-8 h-8 mb-2.5 opacity-30 stroke-1" />
                  <p className="text-xs font-semibold text-fg uppercase tracking-wider">
                    No active execution
                  </p>
                  <p className="text-[11px] mt-1 text-fg-muted max-w-xs leading-normal">
                    Select scenarios and click "Run Scenarios" above to start testing. Live steps and assertion results will appear here.
                  </p>
                </div>
              )
            ) : (
              executionTree.map((sc, scIdx) => (
                <div
                  key={`${sc.id}-${sc.iteration}-${scIdx}`}
                  className="bg-sidebar border border-border rounded-xs overflow-hidden"
                >
                  {/* Scenario Header */}
                  <div className="px-3 py-2 bg-titlebar/80 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {sc.status === "running" && (
                        <Loader2 className="w-3.5 h-3.5 text-warning animate-spin shrink-0" />
                      )}
                      {sc.status === "passed" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      )}
                      {sc.status === "failed" && (
                        <XCircle className="w-3.5 h-3.5 text-error shrink-0" />
                      )}
                      {sc.status === "pending" && (
                        <div className="w-2 h-2 rounded-full bg-fg-muted shrink-0 mx-0.5" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-xs text-fg-bright truncate">
                          {sc.name}
                        </div>
                        <div className="text-[10px] text-fg-muted font-mono truncate">
                          {sc.id}{" "}
                          {sc.totalIterations > 1 ? `(${sc.iteration}/${sc.totalIterations})` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {sc.duration_ms !== undefined && (
                        <span className="text-[10px] text-fg-muted font-mono">
                          {sc.duration_ms}ms
                        </span>
                      )}
                      <Badge
                        size="xs"
                        variant={
                          sc.status === "passed"
                            ? "success"
                            : sc.status === "failed"
                            ? "danger"
                            : sc.status === "running"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {sc.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Steps List */}
                  <div className="divide-y divide-border/60">
                    {sc.steps.map((st, stIdx) => (
                      <div
                        key={stIdx}
                        className="px-3 py-1.5 flex items-start justify-between text-xs hover:bg-hover/40"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <div className="mt-0.5 shrink-0">
                            {st.status === "running" && (
                              <Loader2 className="w-3 h-3 text-warning animate-spin" />
                            )}
                            {st.status === "passed" && (
                              <CheckCircle2 className="w-3 h-3 text-success" />
                            )}
                            {st.status === "failed" && (
                              <XCircle className="w-3 h-3 text-error" />
                            )}
                            {st.status === "pending" && (
                              <div className="w-1.5 h-1.5 rounded-full bg-fg-muted my-1 mx-0.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge size="xs" variant={getTargetBadgeVariant(st.target)}>
                                {st.target}
                              </Badge>
                              <span className="font-medium text-fg">{st.name}</span>
                            </div>
                            {st.error && (
                              <div className="mt-1 p-2 bg-error-bg border border-error-border rounded-xs text-error text-[11px] font-mono whitespace-pre-wrap">
                                {st.error}
                              </div>
                            )}
                          </div>
                        </div>

                        {st.duration_ms !== undefined && (
                          <span className="text-[10px] text-fg-muted font-mono shrink-0 ml-2">
                            {st.duration_ms}ms
                          </span>
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
        <div className="w-1/2 flex flex-col bg-activity">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-sidebar">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-fg-bright uppercase tracking-wider">
                Output
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-input text-fg-muted font-mono border border-border">
                {logs.length} lines
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Filter */}
              <div className="relative">
                <Search className="w-3 h-3 text-fg-muted absolute left-2 top-2" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="pl-6 pr-2 py-0.5 text-[11px] rounded-xs bg-input border border-border text-fg placeholder-fg-muted w-32 focus:w-44 transition-all focus:border-border-focus focus:outline-none"
                />
              </div>

              <Button
                size="xs"
                variant={autoScroll ? "primary" : "secondary"}
                onClick={() => setAutoScroll(!autoScroll)}
              >
                Auto-scroll
              </Button>

              <Button
                size="xs"
                variant="ghost"
                onClick={onClearLogs}
                title="Clear logs"
                icon={<Trash2 className="w-3 h-3 text-fg-muted" />}
              />
            </div>
          </div>

          {/* Terminal Box */}
          <div className="flex-1 p-3 font-mono text-[11.5px] overflow-y-auto leading-relaxed text-fg space-y-0.5 bg-activity select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-fg-muted/60 italic p-2">
                No output yet. Start a run to stream execution logs.
              </div>
            ) : (
              filteredLogs.map((log, index) => {
                const isPass = log.text.includes("✓") || log.text.includes("PASSED")
                const isFail = log.text.includes("✗") || log.text.includes("FAILED")
                const isHeading = log.text.includes("▶") || log.text.startsWith("Preflight")

                let colorClass = "text-fg"
                if (isPass) colorClass = "text-success font-semibold"
                else if (isFail) colorClass = "text-error font-semibold"
                else if (isHeading) colorClass = "text-info font-bold"
                else if (log.level === "detail") colorClass = "text-fg-muted"

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
