import { Badge } from "../../components/Badge.tsx"
import { Panel } from "../../components/Panel.tsx"
import { formatDuration } from "../../format.ts"
import type { StepHistory } from "../../types.ts"
import { historyDetails, historyHeadline, isFlaky } from "./stepHistory.ts"

const OUTCOME = {
  PASSED: { className: "bg-success", label: "Passed" },
  RECOVERED: { className: "bg-warning", label: "Passed after retry" },
  FAILED: { className: "bg-error", label: "Failed" },
} as const

/** How the selected step did in its latest runs: first-try passes, retry passes, failures and p95 duration. */
export function StepHistoryPanel({ history }: { history: StepHistory | undefined }) {
  const headline = historyHeadline(history)
  return (
    <Panel variant="sidebar" className="p-3 space-y-2" aria-label="Run History">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-fg-bright">Run History</span>
          <span className="text-xs text-fg-muted">{headline ?? "This step has not run yet"}</span>
        </div>
        {isFlaky(history) && (
          <Badge variant="warning" size="xs">
            Flaky
          </Badge>
        )}
      </div>
      {history && history.executions > 0 && (
        <>
          <ul className="flex items-center gap-0.5" aria-label="Latest runs, oldest first">
            {[...history.recent].reverse().map((outcome, index) => (
              <li
                key={index}
                title={OUTCOME[outcome].label}
                aria-label={OUTCOME[outcome].label}
                className={`w-2.5 h-4 rounded-sm ${OUTCOME[outcome].className}`}
              />
            ))}
          </ul>
          <ul className="text-xs text-fg space-y-0.5">
            {historyDetails(history).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
            {history.p95Ms != null && (
              <li className="text-fg-muted">
                95% of passes finished within <span className="font-mono">{formatDuration(history.p95Ms)}</span>
              </li>
            )}
          </ul>
        </>
      )}
    </Panel>
  )
}
