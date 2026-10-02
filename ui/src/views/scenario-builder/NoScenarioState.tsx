import { FilePlus2, Layers } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
import type { ScenarioItem } from "../../types.ts"

export interface NoScenarioStateProps {
  scenarios: ScenarioItem[]
  createNewScenario: () => void
  isSaving: boolean
}

/** Workspace placeholder when no scenario exists or none is selected. */
export function NoScenarioState({ scenarios, createNewScenario, isSaving }: NoScenarioStateProps) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center bg-editor p-8 text-center">
      {scenarios.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<FilePlus2 className="w-7 h-7 text-primary" />}
          title="No Scenarios in Workspace"
          description="Create end-to-end test scenarios to orchestrate automated steps across Web (Playwright), HTTP APIs, Shell commands, and Mobile devices."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button
                size="sm"
                variant="primary"
                onClick={createNewScenario}
                isLoading={isSaving}
                icon={<FilePlus2 className="w-3.5 h-3.5" />}
              >
                Create First Scenario
              </Button>
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <span>Drivers:</span>
                <Badge variant="driver-web" size="xs">
                  Web
                </Badge>
                <Badge variant="driver-http" size="xs">
                  API
                </Badge>
                <Badge variant="driver-shell" size="xs">
                  Shell
                </Badge>
                <Badge variant="driver-mobile" size="xs">
                  Mobile
                </Badge>
              </div>
            </div>
          }
        />
      ) : (
        <EmptyState
          size="lg"
          icon={<Layers className="w-7 h-7 text-fg-muted" />}
          title="No Scenario Selected"
          description="Select a scenario from the sidebar on the left to inspect its sequence and configure steps, or create a new scenario."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={createNewScenario}
              isLoading={isSaving}
              icon={<FilePlus2 className="w-3.5 h-3.5 text-primary" />}
            >
              Create New Scenario
            </Button>
          }
        />
      )}
    </section>
  )
}
