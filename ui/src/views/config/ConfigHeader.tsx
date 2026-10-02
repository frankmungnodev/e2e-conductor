import { Database, Globe, Layers, RefreshCw, Terminal } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { TabButton } from "../../components/Tabs.tsx"
import type { ConfigMeta } from "../../types.ts"
import type { ConfigSection } from "./ConfigView.tsx"

export interface ConfigHeaderProps {
  config: ConfigMeta | null
  activeSection: ConfigSection
  setActiveSection: (section: ConfigSection) => void
  envCount: number
  platformsCount: number
  fixturesCount: number
  onConfigReload: () => void
}

/** Title bar with database status, section tabs, and the reload button. */
export function ConfigHeader({
  config,
  activeSection,
  setActiveSection,
  envCount,
  platformsCount,
  fixturesCount,
  onConfigReload,
}: ConfigHeaderProps) {
  return (
    <div className="px-5 py-2.5 border-b border-border bg-titlebar flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-fg-bright">Configuration</span>
          <span className="text-xs font-mono text-fg-muted bg-sidebar px-1.5 py-0.5 rounded-xs border border-border">
            {config?.dbPath || ".e2e/e2e.db"}
          </span>
          <Badge variant={config?.dbExists ? "success" : "neutral"} size="xs">
            {config?.dbExists ? "Connected" : "Not Initialized"}
          </Badge>
        </div>
      </div>

      {/* Sub-resource Segmented Pill Navigation */}
      <div className="flex items-center gap-1 bg-activity p-1 rounded-sm border border-border">
        <TabButton
          variant="pills"
          active={activeSection === "environments"}
          onClick={() => setActiveSection("environments")}
          icon={<Globe className="w-3.5 h-3.5" />}
          badge={<Badge variant={activeSection === "environments" ? "primary" : "neutral"} size="xs">{envCount}</Badge>}
        >
          Environments
        </TabButton>
        <TabButton
          variant="pills"
          active={activeSection === "platforms"}
          onClick={() => setActiveSection("platforms")}
          icon={<Layers className="w-3.5 h-3.5" />}
          badge={<Badge variant={activeSection === "platforms" ? "primary" : "neutral"} size="xs">{platformsCount}</Badge>}
        >
          Platforms
        </TabButton>
        <TabButton
          variant="pills"
          active={activeSection === "fixtures"}
          onClick={() => setActiveSection("fixtures")}
          icon={<Terminal className={`w-3.5 h-3.5 ${activeSection === "fixtures" ? "text-white" : "text-warning"}`} />}
          badge={<Badge variant={activeSection === "fixtures" ? "primary" : "neutral"} size="xs">{fixturesCount}</Badge>}
        >
          Fixtures
        </TabButton>
        <TabButton
          variant="pills"
          active={activeSection === "database"}
          onClick={() => setActiveSection("database")}
          icon={<Database className={`w-3.5 h-3.5 ${activeSection === "database" ? "text-white" : "text-primary"}`} />}
        >
          Database & Storage
        </TabButton>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onConfigReload()}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Reload
        </Button>
      </div>
    </div>
  )
}
