import { Clock, Terminal } from "lucide-react"
import type { RefObject } from "react"
import type { ViewMode } from "./RunnerView.tsx"

export interface LogPaneProps {
  viewMode: ViewMode
  logs: Array<{ text: string; level: "info" | "detail" }>
  filteredLogs: Array<{ text: string; level: "info" | "detail" }>
  currentRunId?: string
  terminalEndRef: RefObject<HTMLDivElement | null>
}

/** Live terminal output for the current run, with filtering and auto-scroll anchor. */
export function LogPane({ viewMode, logs, filteredLogs, currentRunId, terminalEndRef }: LogPaneProps) {
  return (
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
  )
}
