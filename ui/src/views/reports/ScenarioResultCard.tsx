import { ChevronDown, ChevronRight, FileArchive, FileText, ListOrdered, RotateCcw } from "lucide-react"
import { useState } from "react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { failureLabelText } from "../../runResult.ts"
import type { ReportFile, ScenarioReport, StepReport } from "../../types.ts"
import { FailureTimeline } from "./FailureTimeline.tsx"
import { formatDuration, stepNote } from "./reportFormat.ts"
import { iconStatusOf, StatusIcon } from "./StatusIcon.tsx"

type Props = {
  runId: string
  report: ScenarioReport
  showIteration: boolean
  onPreview: (url: string) => void
  /** Re-runs the scenario with Pause on Failure. Left out while a run is in progress. */
  rerun?: (scenarioId: string) => void
}

/** One scenario's result. A failed one opens on its failing step and the error, so no digging is needed. */
export function ScenarioResultCard({ runId, report, showIteration, onPreview, rerun }: Props) {
  const [open, setOpen] = useState(report.status !== "PASSED")
  const [timelineOpen, setTimelineOpen] = useState(false)
  const failedStep = report.steps.find((step) => step.status === "FAILED")
  const passed = report.steps.filter((step) => step.status === "PASSED").length
  const summary =
    report.status === "FIXED"
      ? "Passed after a fix during the run"
      : failedStep
        ? `Failed at step ${failedStep.index + 1}: ${failedStep.name}`
        : report.status === "FAILED"
          ? "Failed before its steps ran (a setup fixture failed)"
          : report.status === "CANCELLED"
            ? `Stopped after ${passed} of ${report.steps.length} steps`
            : report.status === "RUNNING"
              ? `Running: ${passed} of ${report.steps.length} steps done`
            : `${passed} of ${report.steps.length} steps passed`
  // Step screenshots show on their rows, so the files list keeps only the failure evidence.
  const stepImages = new Set(report.steps.flatMap((step) => (step.screenshot ? [step.screenshot.url] : [])))
  const evidence = report.files.filter((file) => !stepImages.has(file.url))

  return (
    <section className="border border-border rounded-xs bg-sidebar">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-start gap-3 text-left cursor-pointer hover:bg-hover transition"
      >
        <span className="pt-0.5">
          <StatusIcon status={iconStatusOf(report.status)} />
        </span>
        <span className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-fg-bright">{report.name}</span>
            {showIteration && <span className="text-xs text-fg-muted">Repeat {report.iteration}</span>}
            {report.changedSinceLastPass && (
              <Badge size="xs" variant="warning">
                Changed Since Last Pass
              </Badge>
            )}
          </span>
          <span className={`text-xs ${failedStep ? "text-error" : "text-fg-muted"}`}>{summary}</span>
        </span>
        <span className="text-xs text-fg-muted font-mono pt-0.5">{formatDuration(report.durationMs)}</span>
        {open ? <ChevronDown className="w-4 h-4 text-fg-muted" /> : <ChevronRight className="w-4 h-4 text-fg-muted" />}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
          {report.status === "FAILED" && !failedStep && (
            <p className="text-xs text-fg">A setup fixture failed, so no step ran. The Log tab shows the fixture's output.</p>
          )}
          <ol className="flex flex-col gap-1">
            {report.steps.map((step) => (
              <StepRow key={step.index} step={step} waiting={report.status === "RUNNING"} onPreview={onPreview} />
            ))}
          </ol>
          {(report.status === "FAILED" || report.status === "FIXED") && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<ListOrdered className="w-3.5 h-3.5" />}
                  aria-expanded={timelineOpen}
                  onClick={() => setTimelineOpen(!timelineOpen)}
                >
                  {timelineOpen ? "Hide Timeline" : "Show Timeline"}
                </Button>
                {report.status === "FAILED" && (
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                    disabled={!rerun}
                    title={rerun ? "Runs this scenario again and pauses on the first failed step" : "A run is in progress"}
                    onClick={() => rerun?.(report.scenarioId)}
                  >
                    Re-run with Pause on Failure
                  </Button>
                )}
              </div>
              {timelineOpen && (
                <FailureTimeline
                  runId={runId}
                  scenarioId={report.scenarioId}
                  iteration={report.iteration}
                  hasTrace={evidence.some((file) => file.name.endsWith(".zip"))}
                />
              )}
            </div>
          )}
          {evidence.length > 0 && <Files files={evidence} onPreview={onPreview} />}
        </div>
      )}
    </section>
  )
}

/** `waiting`: the scenario is still running, so a step with no result yet is coming, not skipped. */
function StepRow({ step, waiting, onPreview }: { step: StepReport; waiting: boolean; onPreview: (url: string) => void }) {
  const note = stepNote(step)
  const notRun = step.status === "NOT_RUN"
  const screenshot = step.screenshot
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon status={iconStatusOf(step.status)} size="sm" />
        <span className={`flex-1 min-w-0 truncate ${notRun ? "text-fg-subtle" : "text-fg"}`}>
          {step.index + 1}. {step.name}
        </span>
        {step.target && <span className="text-fg-muted">{step.target}</span>}
        <span className="w-16 text-right whitespace-nowrap text-fg-muted">
          {notRun ? (waiting ? "Waiting" : "Not run") : formatDuration(step.durationMs)}
        </span>
      </div>
      {note && <span className="pl-5.5 text-xs text-warning">{note}</span>}
      {screenshot && (
        <button
          type="button"
          onClick={() => onPreview(screenshot.url)}
          aria-label={`Screenshot of step ${step.index + 1}`}
          className="ml-5.5 self-start w-40 border border-border rounded-xs overflow-hidden bg-activity hover:border-border-focus cursor-pointer transition"
        >
          <img src={screenshot.url} alt="" className="w-full h-24 object-contain" />
        </button>
      )}
      {step.status === "FAILED" && (
        <div className="ml-5.5 px-3 py-2 rounded-xs border border-error-border bg-error-bg flex flex-col gap-1.5">
          {step.failureLabel && (
            <Badge size="xs" variant="danger" className="self-start">
              {failureLabelText(step.failureLabel)}
            </Badge>
          )}
          <pre className="text-xs text-error font-mono whitespace-pre-wrap wrap-break-word select-text">{step.error ?? "No error message was recorded."}</pre>
        </div>
      )}
    </li>
  )
}

function Files({ files, onPreview }: { files: ReportFile[]; onPreview: (url: string) => void }) {
  const images = files.filter((file) => file.isImage)
  const others = files.filter((file) => !file.isImage)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-fg-muted">Saved when it failed</span>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((file) => (
            <button
              type="button"
              key={file.url}
              onClick={() => onPreview(file.url)}
              className="w-40 border border-border rounded-xs overflow-hidden bg-activity hover:border-border-focus cursor-pointer transition"
            >
              <img src={file.url} alt={file.name} className="w-full h-24 object-contain" />
              <span className="block px-2 py-1 text-xs text-fg-muted truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}
      {others.map((file) => (
        <a
          key={file.url}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="self-start flex items-center gap-1.5 text-xs text-info hover:underline"
        >
          {file.name.endsWith(".zip") ? <FileArchive className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
          {file.name.endsWith(".zip") ? `Download browser trace (${file.name}), open it at trace.playwright.dev` : file.name}
        </a>
      ))}
    </div>
  )
}
