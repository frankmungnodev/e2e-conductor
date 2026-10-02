import { FilePlus2, Search } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { Input } from "../../components/FormControls.tsx"
import type { ScenarioItem } from "../../types.ts"

export interface ScenarioListPanelProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  createNewScenario: () => void
  isSaving: boolean
  filteredScenarios: ScenarioItem[]
  selectedScenarioId: string | null
  selectScenario: (id: string) => void
}

/** Scenario search, the New Scenario button, and the scenario list. */
export function ScenarioListPanel({
  searchQuery,
  setSearchQuery,
  createNewScenario,
  isSaving,
  filteredScenarios,
  selectedScenarioId,
  selectScenario,
}: ScenarioListPanelProps) {
  return (
    <section className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
      <div className="p-3 border-b border-border space-y-2">
        <Input
          size="sm"
          icon={<Search className="w-3.5 h-3.5" />}
          placeholder="Search scenarios..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <Button
          size="xs"
          variant="secondary"
          className="w-full justify-center"
          onClick={createNewScenario}
          isLoading={isSaving}
          icon={<FilePlus2 className="w-3.5 h-3.5 text-primary" />}
        >
          New Scenario
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredScenarios.length === 0 ? (
          <div className="p-4 text-center text-xs text-fg-subtle">
            {searchQuery ? `No matches for "${searchQuery}"` : "No scenarios yet"}
          </div>
        ) : (
          filteredScenarios.map((sc) => {
            const isSelected = selectedScenarioId === sc.id
            return (
              <div
                key={sc.id}
                onClick={() => selectScenario(sc.id)}
                className={`p-2.5 rounded-xs border transition cursor-pointer flex flex-col gap-1.5 ${
                  isSelected
                    ? "bg-primary/10 border-primary text-fg-bright font-medium"
                    : "bg-sidebar border-transparent hover:bg-hover hover:border-border text-fg"
                }`}
              >
                <span className="text-xs truncate font-medium leading-tight" title={sc.name}>
                  {sc.name}
                </span>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-xs text-fg-muted font-mono truncate">{sc.id}</span>
                  <Badge variant="neutral" size="xs">
                    {sc.steps.length} {sc.steps.length === 1 ? "Step" : "Steps"}
                  </Badge>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
