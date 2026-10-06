import { CheckCircle2, CircleSlash, Layers, Loader2, Wrench, XCircle } from "lucide-react"
import { Badge, type BadgeVariant } from "../../components/Badge.tsx"
import { capitalize, formatDuration } from "../../format.ts"
import { failureLabelText } from "../../runResult.ts"
import { getTargetBadgeVariant } from "../../targetDriver.ts"
import type { ConfigMeta, FailureLabel, RunSummary } from "../../types.ts"
import { type RunState, recoveredIn, type ScenarioState } from "./executionTree.ts"
import type { ViewMode } from "./RunnerView.tsx"

const STATE_BADGE: Record<RunState, { variant: BadgeVariant; text: string }> = {
  pending: { variant: "neutral", text: "Pending" },
  running: { variant: "warning", text: "Running" },
  passed: { variant: "success", text: "Passed" },
  failed: { variant: "danger", text: "Failed" },
  not_run: { variant: "neutral", text: "Not Run" },
  fixed: { variant: "warning", text: "Fixed" },
}

/** The status icon for a scenario header, or the smaller one for a step row. */
function StateIcon({ status, step }: { status: RunState; step?: boolean }) {
  const size = step ? "w-3 h-3" : "w-3.5 h-3.5 shrink-0"
  if (status === "running") return <Loader2 className={`${size} text-warning animate-spin`} />
  if (status === "passed") return <CheckCircle2 className={`${size} text-success`} />
  if (status === "failed") return <XCircle className={`${size} text-error`} />
  if (status === "not_run") return <CircleSlash className={`${size} text-fg-muted`} aria-label="Not run" />
  if (status === "fixed") return <Wrench className={`${size} text-warning`} aria-label="Fixed" />
  return step ? (
    <div className="w-1.5 h-1.5 rounded-full bg-fg-muted my-1 mx-0.5" />
  ) : (
    <div className="w-2 h-2 rounded-full bg-fg-muted shrink-0 mx-0.5" />
  )
}

function LabelBadge({ label }: { label: FailureLabel }) {
  return (
    <Badge size="xs" variant="danger">
      {failureLabelText(label)}
    </Badge>
  )
}

export interface StepTreePaneProps {
  viewMode: ViewMode
  executionTree: ScenarioState[]
  lastSummary?: RunSummary
  config?: ConfigMeta
}

/** Live per-scenario step results, or the failure list when a run failed before starting. */
export function StepTreePane({ viewMode, executionTree, lastSummary, config }: StepTreePaneProps) {
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
              <div className="px-3 py-2 bg-titlebar border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <StateIcon status={sc.status} />
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
                      {formatDuration(sc.duration_ms)}
                    </span>
                  )}
                  {recoveredIn(sc) > 0 && (
                    <Badge size="xs" variant="warning">
                      Recovered {recoveredIn(sc)}
                    </Badge>
                  )}
                  {sc.label && hasNoFailedStep(sc) && <LabelBadge label={sc.label} />}
                  <Badge size="xs" variant={STATE_BADGE[sc.status].variant}>
                    {STATE_BADGE[sc.status].text}
                  </Badge>
                </div>
              </div>
              {/* A failed setup fixture has no failed step, so its error shows here with the label. */}
              {sc.status === "failed" && sc.error && hasNoFailedStep(sc) && (
                <div className="mt-2 p-2 bg-error-bg border border-error-border rounded-xs text-error text-xs font-mono whitespace-pre-wrap">
                  {sc.error}
                </div>
              )}
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
                        <StateIcon status={st.status} step />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge size="xs" variant={getTargetBadgeVariant(st.target, config)}>
                            {capitalize(st.target)}
                          </Badge>
                          <span className="font-medium text-fg">{st.name}</span>
                          {st.label && <LabelBadge label={st.label} />}
                          {st.recovered && (
                            <Badge size="xs" variant="warning">
                              Recovered
                            </Badge>
                          )}
                          {st.fixed && (
                            <Badge size="xs" variant="warning">
                              Fixed By Retry
                            </Badge>
                          )}
                          {(st.manualRetries ?? 0) > 0 && (
                            <span className="text-xs text-fg-muted font-mono">
                              {st.manualRetries} manual {st.manualRetries === 1 ? "retry" : "retries"}
                            </span>
                          )}
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
                        {formatDuration(st.duration_ms)}
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

/** A failed scenario with no failed step failed in a setup fixture; its label and error show in the header. */
function hasNoFailedStep(scenario: ScenarioState): boolean {
  return !scenario.steps.some((st) => st.status === "failed")
}


