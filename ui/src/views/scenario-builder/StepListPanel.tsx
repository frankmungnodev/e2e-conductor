import { ArrowDown, ArrowUp, Check, Copy, Layers, Loader2, Plus, Settings, Trash2 } from "lucide-react"
import { Badge, type BadgeVariant } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
import type { ScenarioItem, StepHistory } from "../../types.ts"
import { titleCase } from "./stepDefaults.ts"
import { isFlaky } from "./stepHistory.ts"

export interface StepListPanelProps {
  draftScenario: ScenarioItem
  isSaving: boolean
  saveSuccess: boolean
  selectedStepIdx: number
  setSelectedStepIdx: (idx: number) => void
  setShowScenarioSettings: (show: boolean) => void
  openAddStep: () => void
  moveStep: (index: number, direction: "up" | "down") => void
  duplicateStep: (index: number) => void
  deleteStep: (index: number) => void
  getTargetBadgeVariant: (target: string) => BadgeVariant
  /** Each step's latest runs, keyed by step id. */
  stepHistory: Record<string, StepHistory>
}

/** The draft scenario's header, the Add Step trigger, and its ordered step list. */
export function StepListPanel({
  draftScenario,
  isSaving,
  saveSuccess,
  selectedStepIdx,
  setSelectedStepIdx,
  setShowScenarioSettings,
  openAddStep,
  moveStep,
  duplicateStep,
  deleteStep,
  getTargetBadgeVariant,
  stepHistory,
}: StepListPanelProps) {
  return (
    <section className="w-96 border-r border-border bg-titlebar flex flex-col shrink-0">
      <div className="p-3 border-b border-border bg-sidebar flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs font-semibold text-fg-bright line-clamp-2 leading-snug" title={draftScenario.name}>
            {draftScenario.name}
          </span>
          <span className="text-xs text-fg-muted">
            {draftScenario.steps.length} sequential milestone steps
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSaving && (
            <span className="text-xs text-fg-muted flex items-center gap-1 font-mono">
              <Loader2 className="w-3 h-3 animate-spin text-primary" /> Saving...
            </span>
          )}
          {!isSaving && saveSuccess && (
            <span className="text-xs text-success flex items-center gap-1 font-mono">
              <Check className="w-3 h-3 text-success" /> Saved
            </span>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setShowScenarioSettings(true)}
            title="Scenario Settings & Fixtures"
            className="p-1 h-6 w-6 text-fg-muted hover:text-fg"
            icon={<Settings className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Add Step Trigger */}
      <div className="p-2 border-b border-border bg-sidebar/50">
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={openAddStep}
          className="w-full justify-center gap-1.5"
          icon={<Plus className="w-3.5 h-3.5 text-primary" />}
        >
          Add Step
        </Button>
      </div>

      {/* Stepper Steps List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 flex flex-col">
        {draftScenario.steps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <EmptyState
              size="sm"
              icon={<Layers className="w-5 h-5 text-fg-muted" />}
              title="No Steps in Scenario"
              description="Add steps or insert pre-configured presets to build your automated workflow."
              action={
                <Button
                  size="xs"
                  variant="primary"
                  onClick={openAddStep}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Step
                </Button>
              }
            />
          </div>
        ) : (
          draftScenario.steps.map((st, idx) => {
          const isSelected = selectedStepIdx === idx
          const actionsCount = st.actions?.length ?? 0
          const actionsSummary = st.actions?.slice(0, 3).map((a) => a.action).join(", ")
          return (
            <div
              key={st.id || idx}
              onClick={() => {
                setSelectedStepIdx(idx)
                setShowScenarioSettings(false)
              }}
              className={`p-2.5 rounded-xs border transition cursor-pointer flex flex-col gap-1.5 ${
                isSelected
                  ? "bg-sidebar border-primary shadow-xs"
                  : "bg-sidebar border-border hover:border-fg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono font-semibold text-fg-muted shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-medium text-fg-bright truncate">
                    {st.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {st.id && isFlaky(stepHistory[st.id]) && (
                    <Badge variant="warning" size="xs">
                      Flaky
                    </Badge>
                  )}
                  <Badge variant={getTargetBadgeVariant(st.target)} size="xs">
                    {titleCase(st.target)}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-fg-muted">
                <span className="truncate font-mono">
                  {actionsCount > 0
                    ? `${actionsCount} action(s): ${actionsSummary}${actionsCount > 3 ? "..." : ""}`
                    : "1 action"}
                </span>
                <div
                  className="flex items-center gap-0.5 opacity-60 hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => moveStep(idx, "up")}
                    disabled={idx === 0}
                    className="p-1 h-6 w-6 text-fg-muted hover:text-fg disabled:opacity-30"
                    title="Move step up"
                    icon={<ArrowUp className="w-3 h-3" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => moveStep(idx, "down")}
                    disabled={idx === draftScenario.steps.length - 1}
                    className="p-1 h-6 w-6 text-fg-muted hover:text-fg disabled:opacity-30"
                    title="Move step down"
                    icon={<ArrowDown className="w-3 h-3" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => duplicateStep(idx)}
                    className="p-1 h-6 w-6 text-fg-muted hover:text-primary"
                    title="Duplicate step"
                    icon={<Copy className="w-3 h-3" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => deleteStep(idx)}
                    className="p-1 h-6 w-6 text-fg-muted hover:text-error"
                    title="Delete step"
                    icon={<Trash2 className="w-3 h-3" />}
                  />
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
    </section>
  )
}
