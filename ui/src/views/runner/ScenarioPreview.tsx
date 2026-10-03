import { Check, Layers, Play, PlayCircle } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { capitalize } from "../../format.ts"
import { getTargetBadgeVariant } from "../../targetDriver.ts"
import type { ConfigMeta, ScenarioItem } from "../../types.ts"
import { StepActionSummary } from "./StepActionSummary.tsx"

export interface ScenarioPreviewProps {
  activePreviewScenario: ScenarioItem | null
  handleRunSingle: (scenarioId: string) => void
  config?: ConfigMeta
}

/** Idle-state preview of the focused scenario and its configured steps. */
export function ScenarioPreview({ activePreviewScenario, handleRunSingle, config }: ScenarioPreviewProps) {
  return (
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
                  <Badge key={tgt} size="xs" variant={getTargetBadgeVariant(tgt, config)}>
                    {capitalize(tgt)}
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
                      <Badge size="xs" variant={getTargetBadgeVariant(st.target, config)}>
                        {capitalize(st.target)}
                      </Badge>
                      <span className="text-xs font-medium text-fg-bright">{st.name}</span>
                    </div>

                    <div><StepActionSummary step={st} /></div>

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
  )
}
