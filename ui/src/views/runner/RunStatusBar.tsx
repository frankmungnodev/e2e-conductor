import { CheckCircle2, Loader2, Search, Trash2, XCircle } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { Input } from "../../components/FormControls.tsx"
import { TabButton } from "../../components/Tabs.tsx"
import { ENVIRONMENT_DOWN, FIXED_DURING_RUN } from "../../runResult.ts"
import type { RunSummary } from "../../types.ts"
import type { ViewMode } from "./RunnerView.tsx"
import type { RunCounts } from "./runCounts.ts"

export interface RunStatusBarProps {
  isRunning: boolean
  lastSummary?: RunSummary
  counts: RunCounts
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  logFilter: string
  setLogFilter: (value: string) => void
  autoScroll: boolean
  setAutoScroll: (value: boolean) => void
  onClearLogs: () => void
}

/** Run status badge, pass/fail counts, progress, view-mode tabs, and log controls. */
export function RunStatusBar({
  isRunning,
  lastSummary,
  counts,
  viewMode,
  setViewMode,
  logFilter,
  setLogFilter,
  autoScroll,
  setAutoScroll,
  onClearLogs,
}: RunStatusBarProps) {
  return (
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
          {!isRunning && lastSummary?.reason === FIXED_DURING_RUN && <Badge variant="warning">Fixed During Run</Badge>}
          {!isRunning && lastSummary?.reason === ENVIRONMENT_DOWN && (
            <>
              <Badge variant="danger">Environment Down</Badge>
              {(lastSummary.down?.length ?? 0) > 0 && (
                <span className="text-xs text-fg-muted font-mono">{lastSummary.down?.join(", ")}</span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs font-mono">
          <span className="text-success font-medium">Passed: {counts.passed}</span>
          <span className="text-error font-medium">Failed: {counts.failed}</span>
          {counts.fixed > 0 && <span className="text-warning font-medium">Fixed: {counts.fixed}</span>}
          {counts.notRun > 0 && <span className="text-fg-muted">Not Run: {counts.notRun}</span>}
          {counts.recovered > 0 && <span className="text-warning font-medium">Recovered: {counts.recovered}</span>}
          <span className="text-fg-muted">Total: {counts.total}</span>
          {lastSummary?.duration_ms !== undefined && (
            <span className="text-fg-muted">({lastSummary.duration_ms}ms)</span>
          )}
        </div>

        {/* Progress Bar */}
        {counts.total > 0 && (
          <div className="hidden sm:flex items-center gap-2 w-32">
            <div className="flex-1 bg-input h-1.5 rounded-full overflow-hidden border border-border">
              <div
                className={`h-full transition-all duration-300 ${
                  counts.failed > 0 ? "bg-error" : "bg-primary"
                }`}
                style={{ width: `${counts.percent}%` }}
              />
            </div>
            <span className="text-xs font-mono text-fg-muted w-7 text-right">
              {counts.percent}%
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
  )
}
