import {
  Clock,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Maximize2,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { fetchRunDetails, fetchRuns } from "../api.ts"
import type { RunHistoryItem, RunSummary, StepRunItem } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { CodeBlock } from "./CodeBlock.tsx"
import { EmptyState } from "./EmptyState.tsx"
import { Modal } from "./Modal.tsx"
import { Panel } from "./Panel.tsx"
import { TabButton, useUrlTab } from "./Tabs.tsx"

export function ArtifactsView() {
  const [runs, setRuns] = useState<RunHistoryItem[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<{
    runId: string
    status?: string
    environmentName?: string
    durationMs?: number
    stepRuns?: StepRunItem[]
    scenarios: Record<string, Array<{ name: string; url: string; isImage: boolean }>>
    runLog: string
  } | null>(null)
  const [latestSummary, setLatestSummary] = useState<RunSummary | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useUrlTab<"artifacts" | "steps" | "log">("subtab", "artifacts", [
    "artifacts",
    "steps",
    "log",
  ])

  const loadRuns = async () => {
    try {
      const data = await fetchRuns()
      setRuns(data.runs)
      if (data.latestSummary) setLatestSummary(data.latestSummary)
      if (data.runs.length > 0 && !selectedRunId) {
        setSelectedRunId(data.runs[0].runId)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadRuns()
  }, [])

  useEffect(() => {
    if (!selectedRunId) return
    let isCancelled = false
    void (async () => {
      try {
        const details = await fetchRunDetails(selectedRunId)
        if (!isCancelled) setRunDetails(details)
      } catch (e) {
        console.error(e)
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [selectedRunId])

  // Collect all images across scenarios in this run
  const allImages = Object.entries(runDetails?.scenarios ?? {}).flatMap(([scenario, files]) =>
    files.filter((f) => f.isImage).map((f) => ({ ...f, scenario })),
  )

  const selectedRunItem = runs.find((r) => r.runId === selectedRunId)

  return (
    <div className="flex h-[calc(100vh-49px)] overflow-hidden bg-editor text-fg select-none">
      {/* Left Sidebar: Runs History */}
      <div className="w-72 border-r border-border bg-sidebar flex flex-col">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-titlebar">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-fg-bright">
              Past Test Runs
            </span>
          </div>
          <Badge size="xs" variant="neutral">
            {runs.length} Runs
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {runs.length === 0 ? (
            <div className="p-4 text-center text-xs text-fg-muted">
              No past test results found.
            </div>
          ) : (
            runs.map((r) => {
              const isSelected = selectedRunId === r.runId
              const dateStr = new Date(r.timestamp).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
              return (
                <button
                  key={r.runId}
                  onClick={() => setSelectedRunId(r.runId)}
                  className={`w-full text-left p-2 rounded-xs text-xs transition border cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? "bg-editor text-fg-bright border-border-focus shadow-xs"
                      : "border-transparent text-fg hover:bg-hover"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold truncate flex-1 min-w-0 pr-2">
                      {r.runId}
                    </span>
                    <span className="text-xs text-fg-muted shrink-0">{dateStr}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span>
                      {r.totalScenarios ? `${r.passedScenarios ?? 0}/${r.totalScenarios} Passed` : `${r.scenarios.length} Scenarios`}
                    </span>
                    {r.status && (
                      <Badge
                        size="xs"
                        variant={
                          r.status === "PASSED"
                            ? "success"
                            : r.status === "FAILED"
                              ? "danger"
                              : r.status === "RUNNING"
                                ? "info"
                                : "warning"
                        }
                      >
                        {r.status === "PASSED"
                          ? "Passed"
                          : r.status === "FAILED"
                            ? "Failed"
                            : r.status === "RUNNING"
                              ? "Running"
                              : "Cancelled"}
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Main Panel: Run Details & Artifacts */}
      <div className="flex-1 flex flex-col bg-editor overflow-hidden">
        {selectedRunId ? (
          <>
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-border bg-titlebar flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-fg-bright font-mono">
                    Test Run: {selectedRunId}
                  </span>
                  {selectedRunItem?.status ? (
                    <Badge
                      size="xs"
                      variant={
                        selectedRunItem.status === "PASSED"
                          ? "success"
                          : selectedRunItem.status === "FAILED"
                            ? "danger"
                            : selectedRunItem.status === "RUNNING"
                              ? "info"
                              : "warning"
                      }
                    >
                      {selectedRunItem.status === "PASSED"
                        ? "Passed"
                        : selectedRunItem.status === "FAILED"
                          ? "Failed"
                          : selectedRunItem.status === "RUNNING"
                            ? "Running"
                            : "Cancelled"}
                    </Badge>
                  ) : latestSummary?.artifacts?.includes(selectedRunId) ? (
                    <Badge
                      size="xs"
                      variant={latestSummary.status === "PASSED" ? "success" : "danger"}
                    >
                      {latestSummary.status === "PASSED" ? "Passed" : "Failed"}
                    </Badge>
                  ) : null}
                </div>
                {selectedRunItem && (
                  <div className="text-xs text-fg-muted mt-0.5 flex items-center gap-2">
                    <span>Date Tested: {new Date(selectedRunItem.timestamp).toLocaleString()}</span>
                    {selectedRunItem.durationMs && (
                      <>
                        <span>•</span>
                        <span>Duration: {(selectedRunItem.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{allImages.length} Screenshots Saved</span>
                  </div>
                )}
              </div>

              {/* Sub-tabs */}
              <div className="flex items-center bg-sidebar p-0.5 rounded-xs border border-border">
                <TabButton
                  variant="pills"
                  active={activeTab === "artifacts"}
                  onClick={() => setActiveTab("artifacts")}
                  icon={<ImageIcon className="w-3 h-3" />}
                >
                  Screenshots
                </TabButton>
                <TabButton
                  variant="pills"
                  active={activeTab === "steps"}
                  onClick={() => setActiveTab("steps")}
                  icon={<ListChecks className="w-3 h-3" />}
                >
                  Step Runs {runDetails?.stepRuns?.length ? `(${runDetails.stepRuns.length})` : ""}
                </TabButton>
                <TabButton
                  variant="pills"
                  active={activeTab === "log"}
                  onClick={() => setActiveTab("log")}
                  icon={<FileText className="w-3 h-3" />}
                >
                  Run Log
                </TabButton>
              </div>
            </div>

            {/* Content view */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "artifacts" ? (
                <div className="space-y-4 max-w-6xl mx-auto">
                  {allImages.length === 0 ? (
                    <EmptyState
                      icon={<ImageIcon className="w-6 h-6" />}
                      title="No Screenshots Taken Yet"
                      description="When a test takes a picture or encounters an issue, screen snapshots will be saved here automatically."
                      bordered
                    />
                  ) : (
                    <div>
                      <h3 className="text-xs font-semibold text-fg-muted mb-3">
                        Saved Step Screenshots ({allImages.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {allImages.map((img, i) => (
                          <Panel
                            key={i}
                            variant="sidebar"
                            className="group hover:border-border-focus transition cursor-pointer flex flex-col"
                            onClick={() => setPreviewImage(img.url)}
                          >
                            <div className="relative aspect-video bg-activity flex items-center justify-center overflow-hidden">
                              <img
                                src={img.url}
                                alt={img.name}
                                className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Maximize2 className="w-5 h-5 text-white" />
                              </div>
                            </div>
                            <div className="p-2 text-xs">
                              <div className="font-semibold text-fg-bright truncate text-xs">
                                {img.name}
                              </div>
                              <div className="text-xs text-fg-muted font-mono truncate">
                                {img.scenario}
                              </div>
                            </div>
                          </Panel>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scenario artifacts files breakdown */}
                  {runDetails && Object.keys(runDetails.scenarios).length > 0 && (
                    <div className="mt-6 space-y-2">
                      <h3 className="text-xs font-semibold text-fg-muted">
                        Result Files & Reports
                      </h3>
                      <Panel variant="sidebar">
                        <div className="divide-y divide-border">
                          {Object.entries(runDetails.scenarios).map(([scenario, files]) => (
                            <div
                              key={scenario}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <span className="font-mono font-medium text-fg">{scenario}</span>
                              <div className="flex items-center gap-2">
                                {files.length > 0 ? (
                                  files.map((file, fIdx) => (
                                    <a
                                      key={fIdx}
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2 py-0.5 rounded-xs bg-input hover:bg-hover text-info text-xs font-mono border border-border transition"
                                    >
                                      {file.name}
                                    </a>
                                  ))
                                ) : (
                                  <span className="text-xs text-fg-subtle italic">No artifacts saved</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Panel>
                    </div>
                  )}
                </div>
              ) : activeTab === "steps" ? (
                /* Step Runs Tab */
                <div className="space-y-4 max-w-6xl mx-auto">
                  {!runDetails?.stepRuns || runDetails.stepRuns.length === 0 ? (
                    <EmptyState
                      icon={<ListChecks className="w-6 h-6" />}
                      title="No Step Run Records Available"
                      description="Detailed step execution telemetry will be displayed here for runs performed with the database enabled."
                      bordered
                    />
                  ) : (
                    <Panel title={`Step Execution History (${runDetails.stepRuns.length})`} variant="editor">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-titlebar text-fg-muted font-medium border-b border-border">
                            <tr>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Step Identifier</th>
                              <th className="py-2 px-3">Scenario</th>
                              <th className="py-2 px-3 text-right">Attempt</th>
                              <th className="py-2 px-3 text-right">Duration</th>
                              <th className="py-2 px-3">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {runDetails.stepRuns.map((sr) => (
                              <tr key={sr.id} className="hover:bg-hover">
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <Badge
                                    size="xs"
                                    variant={
                                      sr.status === "PASSED"
                                        ? "success"
                                        : sr.status === "FAILED"
                                          ? "danger"
                                          : sr.status === "RUNNING"
                                            ? "info"
                                            : "neutral"
                                    }
                                  >
                                    {sr.status === "PASSED"
                                      ? "Passed"
                                      : sr.status === "FAILED"
                                        ? "Failed"
                                        : sr.status === "RUNNING"
                                          ? "Running"
                                          : "Skipped"}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 font-mono font-medium text-fg-bright">
                                  {sr.stepId || sr.id}
                                </td>
                                <td className="py-2 px-3 font-mono text-fg-muted">{sr.scenarioId}</td>
                                <td className="py-2 px-3 text-right font-mono text-fg-muted">{sr.attempt}</td>
                                <td className="py-2 px-3 text-right font-mono text-fg-muted">
                                  {sr.durationMs != null ? `${sr.durationMs}ms` : "-"}
                                </td>
                                <td className="py-2 px-3 text-fg">
                                  {sr.errorMessage ? (
                                    <span className="text-error font-mono text-xs truncate block max-w-xs" title={sr.errorMessage}>
                                      {sr.errorMessage}
                                    </span>
                                  ) : sr.statusCode != null ? (
                                    <span className="text-fg-muted font-mono text-xs">
                                      Code {sr.statusCode}
                                    </span>
                                  ) : (
                                    <span className="text-fg-subtle text-xs">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  )}
                </div>
              ) : (
                /* Run Log Tab */
                <div className="h-full flex flex-col">
                  <CodeBlock
                    code={runDetails?.runLog || "No log content recorded for this run."}
                    language="log"
                    maxHeight="calc(100vh - 150px)"
                    showLineNumbers={true}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-fg-muted">
            <EmptyState
              icon={<ShieldCheck className="w-8 h-8" />}
              title="Select a Test Run to View Results"
              description="Choose a test run from the history sidebar on the left to inspect captured screenshots and execution logs."
            />
          </div>
        )}
      </div>

      {/* Lightbox Modal for Full Image View */}
      <Modal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title="Screenshot Preview"
        maxWidth="full"
      >
        {previewImage && (
          <div className="flex items-center justify-center p-2 bg-activity rounded-xs">
            <img
              src={previewImage}
              alt="Screenshot Preview"
              className="max-w-full max-h-[75vh] object-contain rounded-xs"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
