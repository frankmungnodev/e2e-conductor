import { Check, ExternalLink, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../../components/Button.tsx"
import { Checkbox } from "../../components/Checkbox.tsx"
import {
  EnvVariablesEditor,
  type EnvVarRow,
  envRowsToRecord,
  recordToEnvRows,
} from "../../components/EnvVariablesEditor.tsx"
import { Input } from "../../components/FormControls.tsx"
import { Modal } from "../../components/Modal.tsx"
import type { ScenarioItem } from "../../types.ts"

export interface ScenarioSettingsModalProps {
  showScenarioSettings: boolean
  setShowScenarioSettings: (show: boolean) => void
  draftScenario: ScenarioItem | null
  updateDraft: (scenario: ScenarioItem) => void
  handleDeleteScenario: () => void
  onNavigateToConfig?: (sub?: string) => void
  availableFixtures: string[]
}

/** Scenario name, description, setup fixtures, and variables. */
export function ScenarioSettingsModal({
  showScenarioSettings,
  setShowScenarioSettings,
  draftScenario,
  updateDraft,
  handleDeleteScenario,
  onNavigateToConfig,
  availableFixtures,
}: ScenarioSettingsModalProps) {
  // Rows live here, not in the draft: a new row has an empty key, which the vars record cannot hold.
  const [varRows, setVarRows] = useState<EnvVarRow[]>([])
  const scenarioId = draftScenario?.id
  useEffect(() => {
    if (showScenarioSettings) setVarRows(recordToEnvRows(draftScenario?.vars as Record<string, string> | undefined))
  }, [showScenarioSettings, scenarioId])

  return (
    <Modal
      isOpen={showScenarioSettings && !!draftScenario}
      onClose={() => setShowScenarioSettings(false)}
      title="Scenario Settings & Fixtures"
      description="Configure scenario metadata, setup fixtures, and scenario variables"
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            size="xs"
            variant="danger"
            onClick={() => {
              setShowScenarioSettings(false)
              handleDeleteScenario()
            }}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Delete Scenario
          </Button>
          <Button
            size="xs"
            variant="primary"
            onClick={() => setShowScenarioSettings(false)}
          >
            Done
          </Button>
        </div>
      }
    >
      {draftScenario && (
        <div className="space-y-4">
          <Input
            size="sm"
            label="Scenario Name"
            value={draftScenario.name}
            onChange={(e) => {
              const name = e.target.value
              updateDraft({
                ...draftScenario,
                name,
                raw: { ...draftScenario.raw, name },
              })
            }}
          />

          <Input
            size="sm"
            label="Description"
            value={draftScenario.description ?? ""}
            onChange={(e) => {
              const description = e.target.value
              updateDraft({
                ...draftScenario,
                description,
                raw: { ...draftScenario.raw, description },
              })
            }}
            placeholder="What this scenario validates..."
          />

          {/* Setup Fixtures */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg-bright">Setup Fixtures</label>
              {onNavigateToConfig && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setShowScenarioSettings(false)
                    onNavigateToConfig("fixtures")
                  }}
                  className="text-xs text-primary hover:underline px-1 py-0.5"
                  iconRight={<ExternalLink className="w-3 h-3" />}
                >
                  Manage Fixtures
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableFixtures.length === 0 ? (
                <span className="text-xs text-fg-muted italic">No fixtures configured</span>
              ) : (
                availableFixtures.map((fix) => {
                  const isSet = draftScenario.setup?.includes(fix)
                  return (
                    <Button
                      key={fix}
                      type="button"
                      size="xs"
                      variant={isSet ? "secondary" : "ghost"}
                      onClick={() => {
                        const curr = draftScenario.setup ?? []
                        const next = isSet ? curr.filter((f) => f !== fix) : [...curr, fix]
                        const raw = { ...draftScenario.raw, setup: next }
                        updateDraft({ ...draftScenario, setup: next, raw })
                      }}
                      className={`font-mono ${
                        isSet ? "border-primary/50 text-primary" : "text-fg-muted"
                      }`}
                      icon={isSet ? <Check className="w-3 h-3 text-primary" /> : undefined}
                    >
                      {fix}
                    </Button>
                  )
                })
              )}
            </div>
            <Checkbox
              className="pt-1.5"
              checked={draftScenario.raw.read_only === true}
              disabled={(draftScenario.setup ?? []).length === 0}
              onCheckedChange={(checked) => {
                const { read_only: _readOnly, ...rest } = draftScenario.raw
                const raw = checked ? { ...rest, read_only: true } : rest
                updateDraft({ ...draftScenario, raw })
              }}
              label="Read-only"
              description={
                (draftScenario.setup ?? []).length === 0
                  ? "Pick a setup fixture first. Read-only lets the next scenario with the same setup skip it."
                  : "This scenario never changes what its setup fixtures reset. The next scenario with the same setup then skips it."
              }
            />
          </div>

          {/* Scenario Variables */}
          <div className="pt-2 border-t border-border">
            <EnvVariablesEditor
              rows={varRows}
              onChange={(newRows) => {
                setVarRows(newRows)
                const nextVars = envRowsToRecord(newRows) ?? {}
                const raw = { ...draftScenario.raw, vars: nextVars }
                updateDraft({ ...draftScenario, vars: nextVars, raw })
              }}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
