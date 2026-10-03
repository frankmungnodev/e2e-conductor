import { Play, PlayCircle, Search, XCircle } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { Checkbox } from "../../components/Checkbox.tsx"
import { Input } from "../../components/FormControls.tsx"
import { capitalize } from "../../format.ts"
import { getTargetBadgeVariant } from "../../targetDriver.ts"
import type { ConfigMeta, RunSummary, ScenarioItem } from "../../types.ts"

export interface ScenarioExplorerProps {
  scenarios: ScenarioItem[]
  filteredScenarios: ScenarioItem[]
  selectedScenarios: string[]
  toggleAllScenarios: () => void
  toggleScenario: (id: string) => void
  previewScenarioId: string | null
  setPreviewScenarioId: (id: string) => void
  lastSummary?: RunSummary
  isRunning: boolean
  scenarioFilter: string
  setScenarioFilter: (value: string) => void
  handleRunSingle: (scenarioId: string) => void
  config?: ConfigMeta
}

/** Scenario list with selection, filtering, and per-scenario quick run. */
export function ScenarioExplorer({
  scenarios,
  filteredScenarios,
  selectedScenarios,
  toggleAllScenarios,
  toggleScenario,
  previewScenarioId,
  setPreviewScenarioId,
  lastSummary,
  isRunning,
  scenarioFilter,
  setScenarioFilter,
  handleRunSingle,
  config,
}: ScenarioExplorerProps) {
  return (
    <>
      {/* Explorer Header */}
      <div className="px-3 py-2 border-b border-border bg-titlebar flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PlayCircle className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-fg-bright tracking-tight">Test Scenarios</span>
          <span className="text-xs font-mono px-1 rounded-xs bg-editor text-fg-muted border border-border">
            {scenarios.length}
          </span>
        </div>

        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={toggleAllScenarios}
          disabled={isRunning}
          className="text-xs text-primary hover:text-primary-hover font-medium px-1.5 py-0.5"
        >
          {selectedScenarios.length === scenarios.length ? "Deselect All" : "Select All"}
        </Button>
      </div>

      {/* Filter Input */}
      <div className="p-2 border-b border-border bg-sidebar">
        <Input
          icon={<Search className="w-3.5 h-3.5" />}
          placeholder="Search scenarios..."
          value={scenarioFilter}
          onChange={(e) => setScenarioFilter(e.target.value)}
        />
      </div>

      {/* Scenarios List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredScenarios.length === 0 ? (
          <div className="p-4 text-center text-fg-muted text-xs">
            {scenarios.length === 0 ? "No test scenarios loaded" : "No matching scenarios found"}
          </div>
        ) : (
          filteredScenarios.map((sc) => {
            const isSelected = selectedScenarios.includes(sc.id)
            const isPreviewed = previewScenarioId === sc.id
            const hasFailed = lastSummary?.failures?.some((f) => f.scenario === sc.name)

            return (
              <div
                key={sc.id}
                onClick={() => setPreviewScenarioId(sc.id)}
                className={`group relative rounded-xs border p-2 text-xs transition-all cursor-pointer ${
                  isPreviewed
                    ? "border-primary/60 bg-editor shadow-xs"
                    : "border-border bg-sidebar hover:bg-hover hover:border-border-light"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div
                      className="mt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        size="sm"
                        checked={isSelected}
                        onChange={() => toggleScenario(sc.id)}
                        disabled={isRunning}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold truncate text-xs ${
                            isPreviewed ? "text-primary" : "text-fg-bright"
                          }`}
                        >
                          {sc.name}
                        </span>
                        {hasFailed && (
                          <XCircle className="w-3 h-3 text-error shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-fg-muted font-mono truncate">
                        {sc.id}
                      </div>
                    </div>
                  </div>

                  {/* Quick Run Single Button */}
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleRunSingle(sc.id)}
                      disabled={isRunning}
                      title={`Run ${sc.name} only`}
                      className="opacity-70 group-hover:opacity-100 hover:text-primary hover:bg-editor"
                      icon={<Play className="w-3 h-3 fill-current text-primary" />}
                    />
                  </div>
                </div>

                {/* Metadata Row */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    {Array.from(new Set(sc.targets)).map((tgt) => (
                      <Badge key={tgt} size="xs" variant={getTargetBadgeVariant(tgt, config)}>
                        {capitalize(tgt)}
                      </Badge>
                    ))}
                  </div>
                  <span className="text-xs text-fg-muted font-mono shrink-0">
                    {sc.steps.length} step{sc.steps.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
