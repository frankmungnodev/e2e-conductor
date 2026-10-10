import { Code, Copy, Globe, Layers, Plus, Smartphone, Terminal } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
import { Input, Textarea } from "../../components/FormControls.tsx"
import { NumberInput } from "../../components/NumberInput.tsx"
import { Panel } from "../../components/Panel.tsx"
import { Select } from "../../components/Select.tsx"
import { TabButton } from "../../components/Tabs.tsx"
import type { StepDriver } from "../../targetDriver.ts"
import type { ScenarioItem, ScenarioStep, StepAction, StepHistory } from "../../types.ts"
import { StepActionCard } from "./StepActionCard.tsx"
import { StepHistoryPanel } from "./StepHistoryPanel.tsx"
import { titleCase } from "./stepDefaults.ts"

export interface StepInspectorProps {
  draftScenario: ScenarioItem
  selectedStep: ScenarioStep | null
  selectedStepIdx: number
  stepDriver: StepDriver
  inspectorMode: "designer" | "json"
  setInspectorMode: (mode: "designer" | "json") => void
  availableTargets: string[]
  getTargetDriver: (target: string) => StepDriver
  updateStep: (index: number, updates: Partial<ScenarioStep>) => void
  addStepAction: (stepIdx: number) => void
  updateStepAction: (stepIdx: number, actionIdx: number, updates: Partial<StepAction>) => void
  moveStepAction: (stepIdx: number, actionIdx: number, direction: "up" | "down") => void
  deleteStepAction: (stepIdx: number, actionIdx: number) => void
  jsonText: string
  jsonError: string | null
  handleJsonChange: (text: string) => void
  openSavePreset: (stepName: string) => void
  openAddStep: () => void
  /** The selected step's latest runs; undefined when it has none. */
  stepHistory?: StepHistory
}

/** The selected step's editor: name, target, actions, retry policy, and the scenario's raw JSON. */
export function StepInspector({
  draftScenario,
  selectedStep,
  selectedStepIdx,
  stepDriver,
  inspectorMode,
  setInspectorMode,
  availableTargets,
  getTargetDriver,
  updateStep,
  addStepAction,
  updateStepAction,
  moveStepAction,
  deleteStepAction,
  jsonText,
  jsonError,
  handleJsonChange,
  openSavePreset,
  openAddStep,
  stepHistory,
}: StepInspectorProps) {
  return (
        <section className="flex-1 flex flex-col bg-sidebar overflow-hidden">
          {selectedStep ? (
            <>
          {/* Inspector Top Bar */}
          <div className="px-4 py-2.5 border-b border-border bg-titlebar flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xs font-mono font-bold text-primary shrink-0">
                Step #{selectedStepIdx + 1}
              </span>
              <div className="flex-1 max-w-md">
                <Input
                  size="sm"
                  value={selectedStep.name}
                  onChange={(e) => updateStep(selectedStepIdx, { name: e.target.value })}
                  placeholder="Step milestone name..."
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="xs"
                variant="secondary"
                onClick={() => openSavePreset(selectedStep.name)}
                icon={<Copy className="w-3.5 h-3.5 text-primary" />}
              >
                Save as Preset
              </Button>

              <div className="flex items-center gap-1">
                <TabButton
                  variant="pills"
                  active={inspectorMode === "designer"}
                  onClick={() => setInspectorMode("designer")}
                >
                  Actions & Config
                </TabButton>
                <TabButton
                  variant="pills"
                  active={inspectorMode === "json"}
                  onClick={() => setInspectorMode("json")}
                >
                  Raw JSON
                </TabButton>
              </div>
            </div>
          </div>

          {/* Inspector Body */}
          <div className="flex-1 overflow-y-auto p-4 select-text">
            {inspectorMode === "designer" ? (
              <div className="max-w-4xl mx-auto space-y-4">
                {/* Step Platform & Target */}
                <Panel variant="sidebar" className="p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-fg-muted font-medium">
                        Platform Target:
                      </label>
                      <Select
                        size="xs"
                        value={selectedStep.target}
                        onChange={(val) => {
                          const newDriver = getTargetDriver(val)
                          const currentDriver = getTargetDriver(selectedStep.target)
                          if (newDriver !== currentDriver) {
                            let defaultAct: StepAction
                            if (newDriver === "web") {
                              defaultAct = { id: `act_${Date.now()}_1`, action: "navigate", url: "/" }
                            } else if (newDriver === "mobile") {
                              defaultAct = { id: `act_${Date.now()}_1`, action: "tap", selector: "Button" }
                            } else if (newDriver === "http") {
                              defaultAct = { id: `act_${Date.now()}_1`, action: "http_get", url: "/api/test", status: 200 }
                            } else {
                              defaultAct = { id: `act_${Date.now()}_1`, action: "shell", command: "echo 'hello'", exit_code: 0 }
                            }
                            updateStep(selectedStepIdx, { target: val, actions: [defaultAct] })
                          } else {
                            updateStep(selectedStepIdx, { target: val })
                          }
                        }}
                        options={availableTargets.map((t) => ({
                          value: t,
                          label: `${titleCase(t)} (${titleCase(getTargetDriver(t))})`,
                        }))}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 justify-center">
                      <span className="text-xs text-fg-muted">Driver runtime:</span>
                      <span className="text-xs font-mono font-semibold text-fg-bright">
                        {titleCase(stepDriver)} Driver
                      </span>
                    </div>
                  </div>
                </Panel>

                {/* ========================================================================= */}
                {/* STEP ACTIONS SEQUENCE (RENDERED FOR EVERY SINGLE STEP!)                   */}
                {/* ========================================================================= */}
                <Panel variant="sidebar" className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                        {stepDriver === "web" && <Globe className="w-3.5 h-3.5 text-token-type" />}
                        {stepDriver === "mobile" && <Smartphone className="w-3.5 h-3.5 text-token-string" />}
                        {stepDriver === "http" && <Code className="w-3.5 h-3.5 text-token-var" />}
                        {stepDriver === "shell" && <Terminal className="w-3.5 h-3.5 text-token-fn" />}
                        Step Actions Sequence
                      </label>
                      <span className="text-xs text-fg-muted">
                        Atomic execution actions performed in sequence for this {stepDriver} step
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral" size="xs">
                        {selectedStep.actions?.length ?? 0} {(selectedStep.actions?.length ?? 0) === 1 ? "Action" : "Actions"}
                      </Badge>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => addStepAction(selectedStepIdx)}
                        icon={<Plus className="w-3.5 h-3.5 text-primary" />}
                      >
                        Add Action
                      </Button>
                    </div>
                  </div>

                  {/* Actions List */}
                  <div className="space-y-2.5">
                    {(selectedStep.actions ?? []).map((act, actIdx) => (
                      <StepActionCard
                        key={act.id || actIdx}
                        act={act}
                        actIdx={actIdx}
                        actionCount={selectedStep.actions?.length ?? 1}
                        stepDriver={stepDriver}
                        onUpdate={(updates) => updateStepAction(selectedStepIdx, actIdx, updates)}
                        onMove={(direction) => moveStepAction(selectedStepIdx, actIdx, direction)}
                        onDelete={() => deleteStepAction(selectedStepIdx, actIdx)}
                      />
                    ))}
                  </div>

                  {/* Prominent + Add Action Button */}
                  <Button
                    size="xs"
                    variant="secondary"
                    className="w-full justify-center py-2 border-dashed"
                    onClick={() => addStepAction(selectedStepIdx)}
                    icon={<Plus className="w-3.5 h-3.5 text-primary" />}
                  >
                    Add Action to Step
                  </Button>
                </Panel>

                {/* Execution & Retry Policy */}
                <Panel variant="sidebar" className="p-3 space-y-3">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold text-fg-bright">
                      Execution & Retry Policy
                    </label>
                    <span className="text-xs text-fg-muted">
                      Timeout limit and automated retries upon failure
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <NumberInput
                      size="xs"
                      label="Timeout (ms)"
                      value={selectedStep.timeout_ms ?? 15000}
                      onChange={(val) => updateStep(selectedStepIdx, { timeout_ms: val })}
                      min={500}
                      max={120000}
                    />
                    <NumberInput
                      size="xs"
                      label="Max Retries"
                      value={selectedStep.retry?.times ?? 0}
                      onChange={(val) =>
                        updateStep(selectedStepIdx, {
                          retry: {
                            times: val ?? 0,
                            delay_ms: selectedStep.retry?.delay_ms ?? 1000,
                          },
                        })
                      }
                      min={0}
                      max={10}
                    />
                    <NumberInput
                      size="xs"
                      label="Retry Delay (ms)"
                      value={selectedStep.retry?.delay_ms ?? 1000}
                      onChange={(val) =>
                        updateStep(selectedStepIdx, {
                          retry: {
                            times: selectedStep.retry?.times ?? 0,
                            delay_ms: val ?? 1000,
                          },
                        })
                      }
                      min={100}
                      max={60000}
                    />
                  </div>
                </Panel>

                <StepHistoryPanel history={stepHistory} />
              </div>
            ) : (
              /* RAW JSON VIEW */
              <div className="max-w-4xl mx-auto space-y-2">
                {jsonError && (
                  <div className="p-2.5 rounded-xs bg-error-bg border border-error-border text-xs text-error font-mono">
                    {jsonError}
                  </div>
                )}
                <Textarea
                  aria-label="Scenario JSON"
                  rows={22}
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  mono
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <EmptyState
            title={
              draftScenario.steps.length === 0
                ? "No Steps to Inspect"
                : "Select a Step to Inspect"
            }
            description={
              draftScenario.steps.length === 0
                ? "Add your first step using the Add Step button in the sequence column."
                : "Click on any step from the sequence column to configure its actions, driver options, and assertions."
            }
            icon={<Layers className="w-6 h-6 text-fg-muted" />}
            action={
              draftScenario.steps.length === 0 ? (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={openAddStep}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Step
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </section>
  )
}
