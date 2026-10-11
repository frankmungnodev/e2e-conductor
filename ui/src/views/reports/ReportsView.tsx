import { FileText, Image as ImageIcon, ListChecks, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { CodeBlock } from "../../components/CodeBlock.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
import { Modal } from "../../components/Modal.tsx"
import { TabButton, useUrlTab } from "../../components/Tabs.tsx"
import type { RunDetails } from "../../types.ts"
import { RunHistoryList } from "./RunHistoryList.tsx"
import { RunOverview } from "./RunOverview.tsx"
import { sortScenarioReports } from "./reportFormat.ts"
import { ScenarioResultCard } from "./ScenarioResultCard.tsx"
import { useRunHistory } from "./useRunHistory.ts"

const SUBTABS = ["results", "screenshots", "log"] as const

/** Reports: pick a past run on the left, read what passed, what failed and why on the right. */
export function ReportsView() {
  const { runs, loaded, selectedRun, selectRun, details } = useRunHistory()
  const [subtab, setSubtab] = useUrlTab<(typeof SUBTABS)[number]>("subtab", "results", SUBTABS)
  const [preview, setPreview] = useState<string | null>(null)

  if (loaded && runs.length === 0) {
    return (
      <div className="flex h-[calc(100vh-44px)] items-center justify-center bg-editor">
        <EmptyState
          icon={<ShieldCheck className="w-8 h-8" />}
          title="No Runs Yet"
          description="Start a run from the Runner tab. Every run's results show up here."
        />
      </div>
    )
  }

  const images = (details?.report ?? []).flatMap((report) =>
    report.files.filter((file) => file.isImage).map((file) => ({ ...file, scenario: report.name })),
  )

  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden bg-editor text-fg">
      <RunHistoryList runs={runs} selectedRunId={selectedRun?.runId ?? null} onSelect={selectRun} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedRun && <RunOverview run={selectedRun} />}
        <div className="px-6 py-2 border-b border-border flex items-center gap-1">
          <TabButton variant="pills" active={subtab === "results"} onClick={() => setSubtab("results")} icon={<ListChecks className="w-3.5 h-3.5" />}>
            Results
          </TabButton>
          <TabButton variant="pills" active={subtab === "screenshots"} onClick={() => setSubtab("screenshots")} icon={<ImageIcon className="w-3.5 h-3.5" />}>
            Screenshots{images.length > 0 ? ` (${images.length})` : ""}
          </TabButton>
          <TabButton variant="pills" active={subtab === "log"} onClick={() => setSubtab("log")} icon={<FileText className="w-3.5 h-3.5" />}>
            Log
          </TabButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!details ? (
            <p className="text-xs text-fg-muted">Loading…</p>
          ) : subtab === "results" ? (
            <Results details={details} onPreview={setPreview} />
          ) : subtab === "screenshots" ? (
            images.length === 0 ? (
              <EmptyState
                icon={<ImageIcon className="w-6 h-6" />}
                title="No Screenshots"
                description="A screenshot is saved when a web or Android step fails, and after every step when a run has Screenshot Every Step on. This run had none."
                bordered
              />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {images.map((image) => (
                  <button
                    type="button"
                    key={image.url}
                    onClick={() => setPreview(image.url)}
                    className="border border-border rounded-xs bg-sidebar overflow-hidden text-left hover:border-border-focus cursor-pointer transition"
                  >
                    <img src={image.url} alt={image.name} className="w-full aspect-video object-contain bg-activity" />
                    <span className="flex flex-col gap-0.5 px-2.5 py-2">
                      <span className="text-xs text-fg-bright truncate">{image.scenario}</span>
                      <span className="text-xs text-fg-muted truncate">{image.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : details.runLog ? (
            <CodeBlock code={details.runLog} language="log" maxHeight="calc(100vh - 290px)" showLineNumbers />
          ) : (
            <EmptyState
              icon={<FileText className="w-6 h-6" />}
              title="No Log Kept for This Run"
              description="Runs from before this version kept only the newest run's log. New runs keep their own."
              bordered
            />
          )}
        </div>
      </main>
      <Modal isOpen={Boolean(preview)} onClose={() => setPreview(null)} title="Screenshot" maxWidth="full">
        {preview && (
          <div className="flex items-center justify-center p-2 bg-activity rounded-xs">
            <img src={preview} alt="Screenshot" className="max-w-full max-h-[75vh] object-contain" />
          </div>
        )}
      </Modal>
    </div>
  )
}

function Results({ details, onPreview }: { details: RunDetails; onPreview: (url: string) => void }) {
  const reports = sortScenarioReports(details.report ?? [])
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="w-6 h-6" />}
        title="No Scenario Results"
        description="This run stopped before any scenario started, or it ran before results were recorded per scenario. The Log tab has what was printed."
        bordered
      />
    )
  }
  const repeated = new Set(reports.map((report) => report.scenarioId)).size < reports.length
  return (
    <div className="flex flex-col gap-2 max-w-5xl">
      {reports.map((report) => (
        <ScenarioResultCard
          key={`${report.scenarioId}:${report.iteration}`}
          runId={details.runId}
          report={report}
          showIteration={repeated}
          onPreview={onPreview}
        />
      ))}
    </div>
  )
}
