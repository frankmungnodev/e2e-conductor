import {
  Clock,
  FileText,
  Image as ImageIcon,
  Maximize2,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { fetchRunDetails, fetchRuns } from "../api.ts"
import type { RunHistoryItem, RunSummary } from "../types.ts"
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
    scenarios: Record<string, Array<{ name: string; url: string; isImage: boolean }>>
    runLog: string
  } | null>(null)
  const [latestSummary, setLatestSummary] = useState<RunSummary | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useUrlTab<"artifacts" | "log">("subtab", "artifacts", [
    "artifacts",
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
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-bright">
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
                    <span className="font-mono text-xs font-semibold truncate max-w-[160px]">
                      {r.runId}
                    </span>
                    <span className="text-[10px] text-fg-muted">{dateStr}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-fg-muted">
                    <span>{r.scenarios.length} Scenario Results Recorded</span>
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
                  {latestSummary?.artifacts?.includes(selectedRunId) && (
                    <Badge
                      size="xs"
                      variant={latestSummary.status === "PASSED" ? "success" : "danger"}
                    >
                      {latestSummary.status === "PASSED" ? "Passed" : "Failed"}
                    </Badge>
                  )}
                </div>
                {selectedRunItem && (
                  <div className="text-[11px] text-fg-muted mt-0.5 flex items-center gap-2">
                    <span>Date Tested: {new Date(selectedRunItem.timestamp).toLocaleString()}</span>
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
                  Screenshots & Screen Captures
                </TabButton>
                <TabButton
                  variant="pills"
                  active={activeTab === "log"}
                  onClick={() => setActiveTab("log")}
                  icon={<FileText className="w-3 h-3" />}
                >
                  Detailed Log (run.log)
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
                    />
                  ) : (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-3">
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
                              <div className="font-semibold text-fg-bright truncate text-[11px]">
                                {img.name}
                              </div>
                              <div className="text-[10px] text-fg-muted font-mono truncate">
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
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
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
                                {files.map((file, fIdx) => (
                                  <a
                                    key={fIdx}
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2 py-0.5 rounded-xs bg-input hover:bg-hover text-info text-[11px] font-mono border border-border transition"
                                  >
                                    {file.name}
                                  </a>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Panel>
                    </div>
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
