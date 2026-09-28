import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Loader2,
  Play,
  PlayCircle,
  Search,
  Sliders,
  Square,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { RunEvent, RunSummary, ScenarioItem, ScenarioStep } from "../types.ts"
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { Checkbox } from "./Checkbox.tsx"
import { Input } from "./FormControls.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { TabButton, useUrlTab } from "./Tabs.tsx"

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

const VIEW_MODES = ["split", "steps", "logs"] as const
type ViewMode = (typeof VIEW_MODES)[number]

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
  const [scenarioFilter, setScenarioFilter] = useState<string>("")
  const [logFilter, setLogFilter] = useState<string>("")
  const [autoScroll, setAutoScroll] = useState<boolean>(true)
  const [showOptions, setShowOptions] = useState<boolean>(false)

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

  const handleRunSingle = (scenarioId: string) => {
    onStartRun({
      scenarios: [scenarioId],
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

  const filteredScenarios = scenarioFilter
    ? scenarios.filter(
        (s) =>
          s.name.toLowerCase().includes(scenarioFilter.toLowerCase()) ||
          s.id.toLowerCase().includes(scenarioFilter.toLowerCase()),
      )
    : scenarios

  const getTargetBadgeVariant = (target: string): BadgeVariant => {
    if (target === "shell") return "driver-shell"
    if (target.includes("api") || target.includes("http")) return "driver-http"
    if (target.includes("mobile") || target.includes("app")) return "driver-mobile"
    return "driver-web"
  }

  const activePreviewScenario =
    scenarios.find((s) => s.id === previewScenarioId) || scenarios[0] || null

  const renderStepActionSummary = (step: ScenarioStep) => {
    if (step.actions && step.actions.length > 0) {
      return (
        <span className="font-mono text-xs text-fg-muted">
          {step.actions.map((a) => a.action).join(" → ")}
        </span>
      )
    }
    if (step.command) return <span className="font-mono text-xs text-fg-muted">{step.command}</span>
    if (step.url) {
      return (
        <span className="font-mono text-xs text-fg-muted">
          <span className="text-info font-bold">{step.method ?? "GET"}</span> {step.url}
        </span>
      )
    }
    if (step.run) return <span className="font-mono text-xs text-fg-muted">{step.run}()</span>
    if (step.flow) return <span className="font-mono text-xs text-fg-muted">flow: {step.flow}</span>
    return null
  }

  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden bg-editor select-none">
      {/* Left Column: Test Explorer & Execution Controls */}
      <aside className="w-80 md:w-84 border-r border-border flex flex-col bg-sidebar select-none shrink-0">
        {/* Explorer Header */}
        <div className="px-3 py-2 border-b border-border bg-titlebar flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <PlayCircle className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-fg-bright tracking-tight">Test Scenarios</span>
            <span className="text-xs font-mono px-1 rounded-xs bg-editor text-fg-muted border border-border">
              {scenarios.length}
            </span>
          </div>

          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={toggleAllScenarios}
            disabled={isRunning}
            className="text-xs text-primary hover:text-primary-hover font-medium px-1.5 py-0.5"
          >
            {selectedScenarios.length === scenarios.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        {/* Filter Input */}
        <div className="p-2 border-b border-border bg-sidebar">
          <Input
            icon={<Search className="w-3.5 h-3.5" />}
            placeholder="Search scenarios..."
            value={scenarioFilter}
            onChange={(e) => setScenarioFilter(e.target.value)}
          />
        </div>

        {/* Scenarios List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredScenarios.length === 0 ? (
            <div className="p-4 text-center text-fg-muted text-xs">
              {scenarios.length === 0 ? "No test scenarios loaded" : "No matching scenarios found"}
            </div>
          ) : (
            filteredScenarios.map((sc) => {
              const isSelected = selectedScenarios.includes(sc.id)
              const isPreviewed = previewScenarioId === sc.id
              const hasFailed = lastSummary?.failures?.some((f) => f.scenario === sc.name)

              return (
                <div
                  key={sc.id}
                  onClick={() => setPreviewScenarioId(sc.id)}
                  className={`group relative rounded-xs border p-2 text-xs transition-all cursor-pointer ${
                    isPreviewed
                      ? "border-primary/60 bg-editor shadow-xs"
                      : "border-border bg-sidebar hover:bg-hover hover:border-border-light"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <div
                        className="mt-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          size="sm"
                          checked={isSelected}
                          onChange={() => toggleScenario(sc.id)}
                          disabled={isRunning}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold truncate text-xs ${
                              isPreviewed ? "text-primary" : "text-fg-bright"
                            }`}
                          >
                            {sc.name}
                          </span>
                          {hasFailed && (
                            <XCircle className="w-3 h-3 text-error shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-fg-muted font-mono truncate">
                          {sc.id}
                        </div>
                      </div>
                    </div>

                    {/* Quick Run Single Button */}
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleRunSingle(sc.id)}
                        disabled={isRunning}
                        title={`Run ${sc.name} only`}
                        className="opacity-70 group-hover:opacity-100 hover:text-primary hover:bg-editor"
                        icon={<Play className="w-3 h-3 fill-current text-primary" />}
                      />
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {Array.from(new Set(sc.targets)).map((tgt) => (
                        <Badge key={tgt} size="xs" variant={getTargetBadgeVariant(tgt)}>
                          {tgt.charAt(0).toUpperCase() + tgt.slice(1)}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-fg-muted font-mono shrink-0">
                      {sc.steps.length} step{sc.steps.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Sidebar Footer: Run Settings & Launch Button */}
        <div className="p-3 border-t border-border bg-titlebar flex flex-col gap-2.5">
          {/* Options Dropdown Accordion */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setShowOptions(!showOptions)}
              className="w-full justify-between text-xs text-fg-muted hover:text-fg font-medium py-1 px-1.5"
            >
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-fg-muted" />
                <span>Run Options</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-fg-muted">
                <span>{repeat > 1 ? `${repeat}x • ` : ""}{headless ? "Silent" : "Visible"}</span>
                {showOptions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
            </Button>

            {showOptions && (
              <div className="mt-2 pt-2 border-t border-border/60 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg-muted">Repeat Iterations:</span>
                  <div className="w-20">
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

                <div className="space-y-1.5 pt-1">
                  <Checkbox
                    size="sm"
                    label="Auto-Start Servers"
                    checked={startServices}
                    onChange={(e) => setStartServices(e.target.checked)}
                    disabled={isRunning}
                  />
                  <Checkbox
                    size="sm"
                    label="Silent Browser (Headless)"
                    checked={headless}
                    onChange={(e) => setHeadless(e.target.checked)}
                    disabled={isRunning}
                  />
                  <Checkbox
                    size="sm"
                    label="Detailed Output Logs"
                    checked={verbose}
                    onChange={(e) => setVerbose(e.target.checked)}
                  />
                  <Checkbox
                    size="sm"
                    label="Install Mobile App"
                    checked={installMobile}
                    onChange={(e) => setInstallMobile(e.target.checked)}
                    disabled={isRunning}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          {isRunning ? (
            <Button
              variant="danger"
              size="md"
              onClick={onStopRun}
              className="w-full justify-center font-semibold shadow-xs"
              icon={<Square className="w-3.5 h-3.5 fill-current" />}
            >
              Stop Execution
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handleRun}
              disabled={selectedScenarios.length === 0}
              className="w-full justify-center font-semibold shadow-xs"
              icon={<Play className="w-3.5 h-3.5 fill-current" />}
            >
              Start Run ({selectedScenarios.length} Scenario{selectedScenarios.length === 1 ? "" : "s"})
            </Button>
          )}
        </div>
      </aside>

      {/* Right Area: Interactive Results Stage & Terminal */}
      <main className="flex-1 flex flex-col overflow-hidden bg-editor">
        {/* Top Status & View Mode Bar */}
        <div className="px-3 py-1.5 border-b border-border bg-titlebar flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isRunning ? (
                <Badge variant="warning" dot pulse icon={<Loader2 className="w-3 h-3 animate-spin" />}>
                  Running
                </Badge>
              ) : lastSummary?.status === "PASSED" ? (
                <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
                  Passed
                </Badge>
              ) : lastSummary?.status === "FAILED" ? (
                <Badge variant="danger" icon={<XCircle className="w-3 h-3 text-error" />}>
                  Failed
                </Badge>
              ) : (
                <Badge variant="neutral">Ready</Badge>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-xs font-mono">
              <span className="text-success font-medium">Passed: {passedCount}</span>
              <span className="text-error font-medium">Failed: {failedCount}</span>
              <span className="text-fg-muted">Total: {totalCount}</span>
              {lastSummary?.duration_ms !== undefined && (
                <span className="text-fg-muted">({lastSummary.duration_ms}ms)</span>
              )}
            </div>

            {/* Progress Bar */}
            {totalCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 w-32">
                <div className="flex-1 bg-input h-1.5 rounded-full overflow-hidden border border-border">
                  <div
                    className={`h-full transition-all duration-300 ${
                      failedCount > 0 ? "bg-error" : "bg-primary"
                    }`}
                    style={{ width: `${percentComplete}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-fg-muted w-7 text-right">
                  {percentComplete}%
                </span>
              </div>
            )}
          </div>

          {/* Right Toolbar: View Mode Selector & Console Buttons */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-editor p-0.5 rounded-sm border border-border">
              <TabButton
                variant="pills"
                active={viewMode === "split"}
                onClick={() => setViewMode("split")}
              >
                Split View
              </TabButton>
              <TabButton
                variant="pills"
                active={viewMode === "steps"}
                onClick={() => setViewMode("steps")}
              >
                Steps
              </TabButton>
              <TabButton
                variant="pills"
                active={viewMode === "logs"}
                onClick={() => setViewMode("logs")}
              >
                Logs
              </TabButton>
            </div>

            {(viewMode === "split" || viewMode === "logs") && (
              <div className="flex items-center gap-1.5">
                <div className="w-36">
                  <Input
                    icon={<Search className="w-3 h-3" />}
                    placeholder="Search logs..."
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                  />
                </div>

                <Button
                  size="xs"
                  variant={autoScroll ? "primary" : "secondary"}
                  onClick={() => setAutoScroll(!autoScroll)}
                  title="Toggle auto-scrolling log console"
                >
                  Auto-Scroll
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={onClearLogs}
                  title="Clear Console"
                  icon={<Trash2 className="w-3 h-3 text-fg-muted" />}
                />
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Case 1: Initial Idle State (No tests active or ran yet) */}
          {executionTree.length === 0 && !isRunning && !lastSummary ? (
            <div className="flex-1 flex overflow-y-auto p-6 bg-editor">
              {activePreviewScenario ? (
                <div className="max-w-3xl w-full mx-auto space-y-4">
                  {/* Scenario Preview Card */}
                  <div className="bg-sidebar border border-border rounded-xs p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-fg-bright">
                            {activePreviewScenario.name}
                          </h2>
                          <span className="text-xs font-mono px-1.5 py-0.5 bg-editor border border-border text-fg-muted rounded-xs">
                            {activePreviewScenario.id}
                          </span>
                        </div>
                        {activePreviewScenario.description && (
                          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                            {activePreviewScenario.description}
                          </p>
                        )}
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRunSingle(activePreviewScenario.id)}
                        icon={<Play className="w-3.5 h-3.5 fill-current" />}
                      >
                        Run This Scenario
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                      <span className="text-xs text-fg-muted font-medium">Platforms:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {Array.from(new Set(activePreviewScenario.targets)).map((tgt) => (
                          <Badge key={tgt} size="xs" variant={getTargetBadgeVariant(tgt)}>
                            {tgt.charAt(0).toUpperCase() + tgt.slice(1)}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-fg-muted mx-1">•</span>
                      <span className="text-xs text-fg-muted font-mono">
                        {activePreviewScenario.steps.length} sequential steps
                      </span>
                    </div>
                  </div>

                  {/* Step Breakdown Preview */}
                  <div className="bg-sidebar border border-border rounded-xs overflow-hidden">
                    <div className="px-3 py-2 bg-titlebar border-b border-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-fg-bright flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        Configured Step Sequence
                      </span>
                      <span className="text-xs text-fg-muted">
                        Ready to execute
                      </span>
                    </div>

                    <div className="divide-y divide-border/60">
                      {activePreviewScenario.steps.map((st, idx) => (
                        <div key={idx} className="p-3 hover:bg-hover/30 transition-colors flex items-start gap-3">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs bg-primary/15 text-primary border border-primary/30 font-mono text-xs font-semibold shrink-0">
                            Step {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge size="xs" variant={getTargetBadgeVariant(st.target)}>
                                {st.target.charAt(0).toUpperCase() + st.target.slice(1)}
                              </Badge>
                              <span className="text-xs font-medium text-fg-bright">{st.name}</span>
                            </div>

                            <div>{renderStepActionSummary(st)}</div>

                            {st.assert && (
                              <div className="text-xs font-mono text-fg-muted flex items-center gap-2 pt-0.5">
                                <span className="text-success flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  Verify:
                                </span>
                                {st.assert.status && <span>Status: {st.assert.status}</span>}
                                {st.assert.exit_code !== undefined && <span>Exit: {st.assert.exit_code}</span>}
                                {st.assert.output_contains && (
                                  <span>Contains: "{st.assert.output_contains}"</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Getting Started Guide */}
                  <div className="p-4 rounded-xs border border-primary/20 bg-primary/5 flex items-start gap-3 text-xs">
                    <div className="w-6 h-6 rounded-xs bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                      ⚡
                    </div>
                    <div>
                      <div className="font-semibold text-fg-bright mb-1">
                        Where to Start
                      </div>
                      <p className="text-fg-muted leading-relaxed">
                        Click <strong className="text-fg">"Start Run"</strong> at the bottom of the left sidebar to execute all selected test scenarios, or click the <strong className="text-fg">"▶"</strong> button next to any scenario to run just that one. Live steps, assertions, and console logs will stream right here.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center">
                  <PlayCircle className="w-12 h-12 text-primary/40 mb-3" />
                  <h2 className="text-sm font-bold text-fg-bright">No Scenarios Discovered</h2>
                  <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                    No test scenarios found in your project's scenarios directory. Switch to the Scenarios tab to create your first end-to-end test.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Case 2: Test Execution Results & Live Stream */
            <div className="flex-1 flex overflow-hidden">
              {/* Left Pane: Steps & Scenario Tree (in split or steps mode) */}
              {(viewMode === "split" || viewMode === "steps") && (
                <div
                  className={`${
                    viewMode === "split" ? "w-1/2 border-r border-border" : "w-full"
                  } flex flex-col bg-editor`}
                >
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-sidebar">
                    <span className="text-xs font-semibold text-fg-bright flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      Live Steps & Verification
                    </span>
                    <span className="text-xs text-fg-muted font-mono">
                      {executionTree.length} scenario run{executionTree.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                    {executionTree.length === 0 && lastSummary?.status === "FAILED" && (lastSummary.failures?.length ?? 0) > 0 ? (
                      <div className="bg-error-bg border border-error-border rounded-xs p-3 text-xs text-error space-y-2">
                        <div className="font-semibold flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-error" />
                          Test Execution Error
                        </div>
                        {lastSummary.failures.map((f, i) => (
                          <div
                            key={i}
                            className="bg-editor p-2.5 rounded-xs border border-error-border font-mono text-xs text-fg whitespace-pre-wrap"
                          >
                            {f.error}
                          </div>
                        ))}
                      </div>
                    ) : (
                      executionTree.map((sc, scIdx) => (
                        <div
                          key={`${sc.id}-${sc.iteration}-${scIdx}`}
                          className="bg-sidebar border border-border rounded-xs overflow-hidden shadow-xs"
                        >
                          {/* Scenario Header */}
                          <div className="px-3 py-2 bg-titlebar border-b border-border flex items-center justify-between">
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
                                <div className="text-xs text-fg-muted font-mono truncate">
                                  {sc.id}{" "}
                                  {sc.totalIterations > 1 ? `(${sc.iteration}/${sc.totalIterations})` : ""}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {sc.duration_ms !== undefined && (
                                <span className="text-xs text-fg-muted font-mono">
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
                                {sc.status.charAt(0).toUpperCase() + sc.status.slice(1)}
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
                                        {st.target.charAt(0).toUpperCase() + st.target.slice(1)}
                                      </Badge>
                                      <span className="font-medium text-fg">{st.name}</span>
                                    </div>
                                    {st.error && (
                                      <div className="mt-1 p-2 bg-error-bg border border-error-border rounded-xs text-error text-xs font-mono whitespace-pre-wrap">
                                        {st.error}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {st.duration_ms !== undefined && (
                                  <span className="text-xs text-fg-muted font-mono shrink-0 ml-2">
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
              )}

              {/* Right Pane: Live Terminal Logs (in split or logs mode) */}
              {(viewMode === "split" || viewMode === "logs") && (
                <div
                  className={`${
                    viewMode === "split" ? "w-1/2" : "w-full"
                  } flex flex-col bg-activity`}
                >
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-sidebar">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-semibold text-fg-bright">
                        Live Output Log
                      </span>
                      <span className="text-xs px-1.5 py-0.2 rounded-xs bg-input text-fg-muted font-mono border border-border">
                        {logs.length} lines
                      </span>
                    </div>

                    {currentRunId && (
                      <div className="text-xs text-fg-muted font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Run: {currentRunId}</span>
                      </div>
                    )}
                  </div>

                  {/* Terminal Box */}
                  <div className="flex-1 p-3 font-mono text-xs overflow-y-auto leading-relaxed text-fg space-y-0.5 bg-activity select-text">
                    {filteredLogs.length === 0 ? (
                      <div className="text-fg-muted/60 italic p-2">
                        {logs.length === 0
                          ? "No output yet. Start a run to stream execution logs."
                          : "No logs match the current filter."}
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
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
