import { Pause as PauseIcon, Pencil, Play, Square, XCircle } from "lucide-react"
import { useState } from "react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { failureLabelText } from "../../runResult.ts"
import type { ScenarioItem } from "../../types.ts"
import { RetryStepModal } from "./RetryStepModal.tsx"
import type { Pause } from "./usePause.ts"

export interface PausePanelProps {
  pause: Pause
  scenarios: ScenarioItem[]
  onStopRun: () => void
}

/** Shown while the run is paused on a failed step: the failure, and the ways to answer it. */
export function PausePanel({ pause, scenarios, onStopRun }: PausePanelProps) {
  const [editing, setEditing] = useState(false)
  const { paused, busy, retrying } = pause
  if (!paused) return null
  const scenarioName = scenarios.find((s) => s.id === paused.scenarioId)?.name ?? paused.scenarioId

  return (
    <section aria-label="Paused on failure" className="px-3 py-2.5 border-b border-warning/50 bg-sidebar flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
            <PauseIcon className="w-3.5 h-3.5 text-warning" />
            Paused on Failure
          </h2>
          <p className="text-xs text-fg-muted">
            {scenarioName}, step {paused.index + 1}: {paused.step.name}. The browser or app is still open where the step failed.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {paused.retryPassed ? (
            <Badge size="xs" variant="success">
              Retry Passed
            </Badge>
          ) : (
            <Badge size="xs" variant="danger">
              {failureLabelText(paused.label)}
            </Badge>
          )}
        </div>
      </div>

      {paused.retryPassed ? (
        <p className="text-xs text-success">The retry passed and the step was saved. Continue to run the rest of the scenario.</p>
      ) : (
        <pre className="p-2 bg-error-bg border border-error-border rounded-xs text-error text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
          {paused.error}
        </pre>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="xs"
          variant={paused.retryPassed ? "secondary" : "primary"}
          icon={<Pencil className="w-3 h-3" />}
          disabled={busy || retrying}
          isLoading={retrying}
          onClick={() => setEditing(true)}
        >
          {retrying ? "Retrying" : "Edit and Retry Step"}
        </Button>
        <Button
          size="xs"
          variant={paused.retryPassed ? "primary" : "secondary"}
          icon={<Play className="w-3 h-3" />}
          disabled={busy || retrying || !paused.retryPassed}
          title={paused.retryPassed ? undefined : "Retry the step until it passes first"}
          onClick={() => void pause.continueRun()}
        >
          Continue
        </Button>
        <Button
          size="xs"
          variant="secondary"
          icon={<XCircle className="w-3 h-3" />}
          disabled={busy || retrying}
          onClick={() => void pause.endScenario()}
        >
          End Scenario
        </Button>
        <Button size="xs" variant="danger" icon={<Square className="w-3 h-3 fill-current" />} onClick={onStopRun}>
          Stop Run
        </Button>
      </div>

      <RetryStepModal
        isOpen={editing}
        step={paused.step}
        busy={busy}
        onClose={() => setEditing(false)}
        onRetry={async (step) => {
          if (await pause.retry(step)) setEditing(false)
        }}
      />
    </section>
  )
}
