import { Activity, CheckCircle2, FileCode, Play, Server, ShieldCheck, XCircle } from "lucide-react"
import type React from "react"
import { Badge } from "./Badge.tsx"

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
    { id: "runner", label: "Runner", icon: <Play className="w-3.5 h-3.5" /> },
    { id: "scenarios", label: "Scenarios & Flows", icon: <FileCode className="w-3.5 h-3.5" /> },
    { id: "preflight", label: "Preflight & Services", icon: <Server className="w-3.5 h-3.5" /> },
    { id: "artifacts", label: "Runs & Artifacts", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ]

  return (
    <header className="border-b border-border bg-activity select-none sticky top-0 z-40 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-6">
        {/* VS Code styled branding */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-sm bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold shadow-xs">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-fg-bright text-xs tracking-tight">
                e2e-orchestrator
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-sidebar text-fg-muted border border-border">
                v0.2.0
              </span>
            </div>
            <div className="text-[10px] text-fg-muted">HTTP • Playwright • Android ADB</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-editor p-0.5 rounded-sm border border-border">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xs text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary text-white shadow-xs"
                    : "text-fg-muted hover:text-fg hover:bg-hover"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Right Status */}
      <div className="flex items-center gap-2.5">
        {!isConnected ? (
          <Badge variant="danger" dot pulse>
            Backend Offline
          </Badge>
        ) : (
          <Badge variant="neutral" dot>
            API Ready
          </Badge>
        )}

        {isRunning ? (
          <Badge variant="warning" dot pulse icon={<Activity className="w-3 h-3 animate-spin" />}>
            Running Scenarios...
          </Badge>
        ) : lastSummaryStatus === "PASSED" ? (
          <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
            Last Run: PASSED
          </Badge>
        ) : lastSummaryStatus === "FAILED" ? (
          <Badge variant="danger" icon={<XCircle className="w-3 h-3 text-error" />}>
            Last Run: FAILED
          </Badge>
        ) : (
          <span className="text-[11px] text-fg-muted">
            {scenariosCount} scenario{scenariosCount === 1 ? "" : "s"} loaded
          </span>
        )}
      </div>
    </header>
  )
}
