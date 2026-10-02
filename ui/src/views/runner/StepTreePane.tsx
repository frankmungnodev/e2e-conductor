import { CheckCircle2, Layers, Loader2, XCircle } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { capitalize } from "../../format.ts"
import type { RunSummary } from "../../types.ts"
import type { ScenarioState } from "./executionTree.ts"
import type { ViewMode } from "./RunnerView.tsx"
import { getTargetBadgeVariant } from "./targetBadge.ts"

export interface StepTreePaneProps {
  viewMode: ViewMode
  executionTree: ScenarioState[]
  lastSummary?: RunSummary
}

/** Live per-scenario step results, or the failure list when a run failed before starting. */
export function StepTreePane({ viewMode, executionTree, lastSummary }: StepTreePaneProps) {
  return (
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
                    {capitalize(sc.status)}
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
                            {capitalize(st.target)}
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
  )
}
