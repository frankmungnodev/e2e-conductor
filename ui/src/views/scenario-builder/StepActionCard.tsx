import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { Button } from "../../components/Button.tsx"
import { Select } from "../../components/Select.tsx"
import type { StepAction } from "../../types.ts"
import { HttpShellActionInputs } from "./HttpShellActionInputs.tsx"
import { MobileActionInputs } from "./MobileActionInputs.tsx"
import { getActionOptions, type StepDriver } from "./stepDefaults.ts"
import { WebActionInputs } from "./WebActionInputs.tsx"

export interface StepActionCardProps {
  act: StepAction
  actIdx: number
  actionCount: number
  stepDriver: StepDriver
  onUpdate: (updates: Partial<StepAction>) => void
  onMove: (direction: "up" | "down") => void
  onDelete: () => void
}

/** One action in a step: its type picker, reorder/delete controls, and the inputs for its type. */
export function StepActionCard({
  act,
  actIdx,
  actionCount,
  stepDriver,
  onUpdate,
  onMove,
  onDelete,
}: StepActionCardProps) {
  const actionOptions = getActionOptions(stepDriver)
  const actType = act.action || actionOptions[0]?.value || "navigate"

  return (
    <div
                                  className="p-3 rounded-xs border border-border bg-input/40 space-y-2.5"
    >
      {/* Action Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-mono font-bold text-fg-muted shrink-0">
            #{actIdx + 1}
          </span>
          <Select
            size="xs"
            value={actType}
            onChange={(val) => {
              onUpdate({ action: val })
            }}
            options={actionOptions}
            className="w-72"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onMove("up")}
            disabled={actIdx === 0}
            className="p-1 h-6 w-6 text-fg-muted hover:text-fg disabled:opacity-20"
            title="Move action up"
            icon={<ArrowUp className="w-3.5 h-3.5" />}
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onMove("down")}
            disabled={actIdx === actionCount - 1}
            className="p-1 h-6 w-6 text-fg-muted hover:text-fg disabled:opacity-20"
            title="Move action down"
            icon={<ArrowDown className="w-3.5 h-3.5" />}
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onDelete()}
            className="p-1 h-6 w-6 text-fg-muted hover:text-error"
            title="Delete action"
            icon={<Trash2 className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Action Inputs based on Type */}
      <div className="space-y-2 pt-1 border-t border-border/60">
        <HttpShellActionInputs act={act} actType={actType} stepDriver={stepDriver} onUpdate={onUpdate} />
        <WebActionInputs act={act} actType={actType} stepDriver={stepDriver} onUpdate={onUpdate} />
        <MobileActionInputs act={act} actType={actType} stepDriver={stepDriver} onUpdate={onUpdate} />
      </div>
    </div>
  )
}
