import { Activity, CheckCircle2, FileCode, Play, Server, ShieldCheck, XCircle } from "lucide-react"

export type TabType = "runner" | "scenarios" | "preflight" | "artifacts"

type HeaderProps = {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  isRunning: boolean
  lastSummaryStatus?: "PASSED" | "FAILED"
  scenariosCount: number
  isConnected?: boolean
}

export function Header({
  activeTab,
  onTabChange,
  isRunning,
  lastSummaryStatus,
  scenariosCount,
  isConnected = true,
}: HeaderProps) {

  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
    { id: "runner", label: "Runner", icon: <Play className="w-4 h-4" /> },
    { id: "scenarios", label: "Scenarios & Flows", icon: <FileCode className="w-4 h-4" /> },
    { id: "preflight", label: "Preflight & Services", icon: <Server className="w-4 h-4" /> },
    { id: "artifacts", label: "Runs & Artifacts", icon: <ShieldCheck className="w-4 h-4" /> },
  ]

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold shadow-inner">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 tracking-tight text-base">e2e-orchestrator</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                v0.2.0
              </span>
            </div>
            <div className="text-xs text-slate-400">HTTP • Playwright • Android ADB</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Right Status */}
      <div className="flex items-center gap-3">
        {!isConnected ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>Backend Offline</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>API Ready</span>
          </div>
        )}

        {isRunning ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium animate-pulse">
            <Activity className="w-3.5 h-3.5 animate-spin" />
            <span>Running Scenarios...</span>
          </div>
        ) : lastSummaryStatus === "PASSED" ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Last Run: PASSED</span>
          </div>
        ) : lastSummaryStatus === "FAILED" ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
            <XCircle className="w-3.5 h-3.5" />
            <span>Last Run: FAILED</span>
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            {scenariosCount} scenario{scenariosCount === 1 ? "" : "s"} loaded
          </div>
        )}
      </div>
    </header>
  )
}

