import {
  Clock,
  FileText,
  Image as ImageIcon,
  Maximize2,
  ShieldCheck,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { fetchRunDetails, fetchRuns } from "../api.ts"
import type { RunHistoryItem, RunSummary } from "../types.ts"

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
  const [activeTab, setActiveTab] = useState<"artifacts" | "log">("artifacts")

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
    <div className="flex h-[calc(100vh-65px)] overflow-hidden">
      {/* Left Sidebar: Runs History */}
      <div className="w-80 border-r border-slate-800 bg-slate-900/60 flex flex-col">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Run History</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {runs.length} runs
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {runs.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No historical runs found in results/artifacts.
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
                  className={`w-full text-left p-3 rounded-xl text-xs transition border flex flex-col gap-1.5 ${
                    isSelected
                      ? "bg-sky-500/10 text-sky-200 border-sky-500/30 shadow-sm"
                      : "border-transparent text-slate-300 hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold truncate max-w-[170px]">{r.runId}</span>
                    <span className="text-[10px] text-slate-500">{dateStr}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{r.scenarios.length} scenario artifact(s)</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Main Panel: Run Details & Artifacts */}
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {selectedRunId ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-100 font-mono">Run: {selectedRunId}</span>
                  {latestSummary?.artifacts?.includes(selectedRunId) && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        latestSummary.status === "PASSED"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {latestSummary.status}
                    </span>
                  )}
                </div>
                {selectedRunItem && (
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3">
                    <span>Recorded: {new Date(selectedRunItem.timestamp).toLocaleString()}</span>
                    <span>•</span>
                    <span>{allImages.length} screenshot(s) captured</span>
                  </div>
                )}
              </div>

              {/* Sub-tabs */}
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setActiveTab("artifacts")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                    activeTab === "artifacts"
                      ? "bg-slate-800 text-sky-400 font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Screenshots & Media
                </button>
                <button
                  onClick={() => setActiveTab("log")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                    activeTab === "log"
                      ? "bg-slate-800 text-sky-400 font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  run.log
                </button>
              </div>
            </div>

            {/* Content view */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "artifacts" ? (
                <div className="space-y-6 max-w-6xl mx-auto">
                  {allImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                      <ImageIcon className="w-12 h-12 mb-3 opacity-30 stroke-1" />
                      <p className="text-sm font-medium text-slate-400">No screenshots generated</p>
                      <p className="text-xs mt-1 text-slate-600 max-w-sm">
                        Screenshots taken on step failure or via mobile/web screenshot flows are preserved here.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                        Captured Screenshots ({allImages.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {allImages.map((img, i) => (
                          <div
                            key={i}
                            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group shadow-sm hover:border-slate-700 transition flex flex-col"
                          >
                            <div
                              onClick={() => setPreviewImage(img.url)}
                              className="relative cursor-pointer aspect-video bg-slate-950 flex items-center justify-center overflow-hidden"
                            >
                              <img
                                src={img.url}
                                alt={img.name}
                                className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Maximize2 className="w-6 h-6 text-white" />
                              </div>
                            </div>
                            <div className="p-3 text-xs">
                              <div className="font-semibold text-slate-200 truncate">{img.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono truncate">{img.scenario}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scenario artifacts files breakdown */}
                  {runDetails && Object.keys(runDetails.scenarios).length > 0 && (
                    <div className="mt-8 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Artifact Folders
                      </h3>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800/60">
                        {Object.entries(runDetails.scenarios).map(([scenario, files]) => (
                          <div key={scenario} className="p-3.5 flex items-center justify-between text-xs">
                            <span className="font-mono font-medium text-slate-200">{scenario}</span>
                            <div className="flex items-center gap-2">
                              {files.map((file, fIdx) => (
                                <a
                                  key={fIdx}
                                  href={file.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-[11px] font-mono border border-slate-700"
                                >
                                  {file.name}
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Run Log Tab */
                <div className="h-full flex flex-col">
                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {runDetails?.runLog || "No log content recorded for this run."}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <ShieldCheck className="w-12 h-12 mb-3 opacity-30 stroke-1" />
            <p className="text-sm font-medium text-slate-400">Select a run to view artifacts</p>
          </div>
        )}
      </div>

      {/* Lightbox Modal for Full Image View */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="Screenshot Preview"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  )
}
