import { History } from "lucide-react"
import type { RunHistoryItem } from "../../types.ts"
import { formatDuration, runHeadline, runWhen } from "./reportFormat.ts"
import { StatusIcon } from "./StatusIcon.tsx"

type Props = {
  runs: RunHistoryItem[]
  selectedRunId: string | null
  onSelect: (runId: string) => void
}

/** Past runs, newest first, each told as its outcome rather than its id. */
export function RunHistoryList({ runs, selectedRunId, onSelect }: Props) {
  return (
    <aside className="w-80 shrink-0 border-r border-border bg-sidebar flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-titlebar flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg-bright">
          <History className="w-4 h-4 text-fg-muted" />
          Run History
        </span>
        <span className="text-xs text-fg-muted">
          {runs.length === 0 ? "No runs yet" : `${runs.length} run${runs.length === 1 ? "" : "s"}, newest first`}
        </span>
      </div>
      <nav aria-label="Run history" className="flex-1 overflow-y-auto">
        {runs.map((run) => {
          const { tone, title } = runHeadline(run)
          const selected = run.runId === selectedRunId
          const meta = [runWhen(run.timestamp), run.durationMs != null ? formatDuration(run.durationMs) : undefined, run.environmentName]
            .filter(Boolean)
            .join(" · ")
          return (
            <button
              type="button"
              key={run.runId}
              onClick={() => onSelect(run.runId)}
              aria-current={selected ? "true" : undefined}
              className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 border-b border-border-muted border-l-2 cursor-pointer transition ${
                selected ? "bg-active border-l-primary" : "border-l-transparent hover:bg-hover"
              }`}
            >
              <span className="pt-0.5">
                <StatusIcon status={tone} />
              </span>
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className={`text-sm truncate ${selected ? "text-fg-bright font-medium" : "text-fg"}`}>{title}</span>
                <span className="text-xs text-fg-muted truncate">{meta}</span>
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
