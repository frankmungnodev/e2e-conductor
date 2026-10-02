import { Database, HardDrive } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { capitalize } from "../../format.ts"
import type { ConfigMeta } from "../../types.ts"

export interface DatabaseTabProps {
  config: ConfigMeta | null
  activeEnvName: string
  envCount: number
  platformsCount: number
}

/** SQLite database location, status, and stored-record counts. */
export function DatabaseTab({ config, activeEnvName, envCount, platformsCount }: DatabaseTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-fg-bright flex items-center gap-1.5">
              <Database className="w-4 h-4 text-primary" /> SQLite Database & Storage
            </h2>
            <Badge variant={config?.dbExists ? "success" : "neutral"} size="xs">
              {config?.dbExists ? "Connected" : "Not Initialized"}
            </Badge>
          </div>
          <p className="text-xs text-fg-muted mt-1">
            Persistent SQLite database storage for environments, platforms, and orchestrator settings.
          </p>
        </div>
      </div>

      {/* Metrics Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-sidebar border border-border rounded-xs p-4">
          <span className="text-xs font-semibold text-fg-muted block mb-1">
            Active Profile
          </span>
          <span className="text-base font-bold text-primary">
            {capitalize(activeEnvName)}
          </span>
          <p className="text-xs text-fg-muted mt-1">Current target for CLI & scenario runs</p>
        </div>

        <div className="bg-sidebar border border-border rounded-xs p-4">
          <span className="text-xs font-semibold text-fg-muted block mb-1">
            Stored Environments
          </span>
          <span className="text-base font-bold text-fg-bright">{envCount}</span>
          <p className="text-xs text-fg-muted mt-1">Total profiles configured in SQLite</p>
        </div>

        <div className="bg-sidebar border border-border rounded-xs p-4">
          <span className="text-xs font-semibold text-fg-muted block mb-1">
            Stored Platforms
          </span>
          <span className="text-base font-bold text-fg-bright">{platformsCount}</span>
          <p className="text-xs text-fg-muted mt-1">Execution targets configured in SQLite</p>
        </div>
      </div>

      {/* Storage Details Card */}
      <div className="bg-sidebar border border-border rounded-xs p-5 space-y-4">
        <div className="flex items-center gap-2 font-bold text-xs text-fg-bright">
          <HardDrive className="w-4 h-4 text-primary" />
          <span>Storage Diagnostics & Locations</span>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <span className="text-fg-muted block text-xs font-semibold mb-1">Database File:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-fg bg-editor p-2 rounded-xs border border-border flex-1 truncate">
                {config?.dbPath || ".e2e/e2e.db"}
              </span>
              <Badge variant={config?.dbExists ? "success" : "neutral"} size="xs">
                {config?.dbExists ? "Ready" : "Pending"}
              </Badge>
            </div>
          </div>

          <div>
            <span className="text-fg-muted block text-xs font-semibold mb-1">Project Root Directory:</span>
            <div className="font-mono text-fg-muted bg-editor p-2 rounded-xs border border-border truncate">
              {config?.configDir ? ". (Workspace Root)" : "Workspace Root"}
            </div>
          </div>

          <div className="pt-2 border-t border-border text-xs text-fg-muted leading-relaxed">
            Configuration data is stored and loaded directly from SQLite. Test runs, preflight checks, and GUI dashboard mutations update this SQLite file with immediate effect without rewriting project source code.
          </div>
        </div>
      </div>
    </div>
  )
}
