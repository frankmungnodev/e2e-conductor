import type { RunHistoryItem } from "../../types.ts"
import { formatDuration, runHeadline, runWhen } from "./reportFormat.ts"
import { StatusIcon } from "./StatusIcon.tsx"

type Stat = { label: string; value: number; className: string; hint?: string }

/** The answer first: did the run pass, how many scenarios failed, when and how long. */
export function RunOverview({ run }: { run: RunHistoryItem }) {
  const { tone, title } = runHeadline(run)
  const total = run.totalScenarios ?? 0
  const stats: Stat[] = [
    { label: "Passed", value: run.passedScenarios ?? 0, className: "text-success" },
    { label: "Failed", value: run.failedScenarios ?? 0, className: "text-error" },
    {
      label: "Not run",
      value: run.notRunScenarios ?? 0,
      className: "text-fg-muted",
      hint: "Skipped because the run stopped early",
    },
    {
      label: "Fixed during run",
      value: run.fixedScenarios ?? 0,
      className: "text-warning",
      hint: "Failed, then passed after you edited a step while the run was paused",
    },
    {
      label: "Steps passed on retry",
      value: run.recoveredSteps ?? 0,
      className: "text-warning",
      hint: "Failed at first, then passed on an automatic retry. Worth checking for flakiness.",
    },
  ].filter((stat, index) => index < 2 ? total > 0 : stat.value > 0)
  const meta = [
    runWhen(run.timestamp),
    run.durationMs != null ? `took ${formatDuration(run.durationMs)}` : undefined,
    run.environmentName ? `${run.environmentName} environment` : undefined,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <header className="px-6 py-4 border-b border-border bg-titlebar flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <StatusIcon status={tone} size="lg" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-base font-semibold text-fg-bright">{title}</h2>
          <span className="text-xs text-fg-muted">{meta}</span>
          <span className="text-xs text-fg-subtle font-mono truncate" title="Run ID">
            Run {run.runId}
          </span>
        </div>
      </div>
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.map((stat) => (
            <div key={stat.label} title={stat.hint} className="px-3 py-1.5 rounded-xs border border-border bg-sidebar flex items-baseline gap-2">
              <span className={`text-sm font-semibold ${stat.className}`}>{stat.value}</span>
              <span className="text-xs text-fg-muted">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
