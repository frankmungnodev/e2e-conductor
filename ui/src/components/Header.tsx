import { Activity, CheckCircle2, Code2, FileCode, Play, Server, ShieldCheck, Sliders, XCircle } from "lucide-react"
import type React from "react"
import { Badge } from "./Badge.tsx"
import { TabButton } from "./Tabs.tsx"

export type TabType = "runner" | "artifacts" | "scenarios" | "modules" | "preflight" | "config"

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
    { id: "artifacts", label: "Reports", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: "scenarios", label: "Scenarios", icon: <FileCode className="w-3.5 h-3.5" /> },
    { id: "modules", label: "Modules", icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: "preflight", label: "Health", icon: <Server className="w-3.5 h-3.5" /> },
    { id: "config", label: "Config", icon: <Sliders className="w-3.5 h-3.5" /> },
  ]

  return (
    <header className="border-b border-border bg-activity select-none sticky top-0 z-40 px-3 py-1.5 h-11 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Compact branding */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-xs bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold shadow-xs text-xs">
            ⚡
          </div>
          <span className="font-semibold text-fg-bright text-xs tracking-tight">
            e2e-orchestrator
          </span>
          <span className="text-[10px] font-mono px-1 rounded-xs bg-sidebar text-fg-muted border border-border">
            v0.2.0
          </span>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-0.5 bg-editor p-0.5 rounded-sm border border-border">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              variant="pills"
              active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              icon={tab.icon}
            >
              {tab.label}
            </TabButton>
          ))}
        </nav>
      </div>

      {/* Right Status */}
      <div className="flex items-center gap-2.5">
        {!isConnected ? (
          <Badge variant="danger" dot pulse size="sm">
            Disconnected
          </Badge>
        ) : isRunning ? (
          <Badge variant="warning" dot pulse size="sm" icon={<Activity className="w-3 h-3 animate-spin" />}>
            Running
          </Badge>
        ) : lastSummaryStatus === "PASSED" ? (
          <Badge variant="success" size="sm" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
            Passed
          </Badge>
        ) : lastSummaryStatus === "FAILED" ? (
          <Badge variant="danger" size="sm" icon={<XCircle className="w-3 h-3 text-error" />}>
            Failed
          </Badge>
        ) : (
          <Badge variant="neutral" dot size="sm">
            Ready
          </Badge>
        )}

        <span className="text-[11px] text-fg-muted">
          {scenariosCount} scenario{scenariosCount === 1 ? "" : "s"}
        </span>
      </div>
    </header>
  )
}
