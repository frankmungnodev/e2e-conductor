import { Input } from "../../components/FormControls.tsx"
import { Select } from "../../components/Select.tsx"
import type { StepAction } from "../../types.ts"
import type { StepDriver } from "./stepDefaults.ts"

export interface ActionInputsProps {
  act: StepAction
  actType: string
  stepDriver: StepDriver
  onUpdate: (updates: Partial<StepAction>) => void
}

/** Inputs for mobile app actions. */
export function MobileActionInputs({ act, actType, stepDriver, onUpdate }: ActionInputsProps) {
  return (
    <>
      {/* Mobile: Tap, Assert Visible */}
      {stepDriver === "mobile" && ["tap", "click", "assert_visible", "assert_not_visible"].includes(actType) && (
        <Input
          size="xs"
          label="Element Text, Label, or ID"
          value={act.selector ?? act.value ?? ""}
          onChange={(e) => onUpdate({ selector: e.target.value })}
          placeholder="e.g. Sign In, btn_submit, or com.app:id/title"
          mono
        />
      )}

      {/* Mobile: Type Text */}
      {stepDriver === "mobile" && (actType === "type" || actType === "fill") && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="xs"
            label="Tap First (Optional Selector)"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="e.g. Input Field Selector"
            mono
          />
          <Input
            size="xs"
            label="Text to Type"
            value={act.value ?? ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="e.g. hello world"
            mono
          />
        </div>
      )}

      {/* Mobile: Swipe */}
      {stepDriver === "mobile" && actType === "swipe" && (
        <div className="grid grid-cols-2 gap-2 items-start">
          <Select
            size="xs"
            label="Swipe Direction"
            value={act.key ?? "RIGHT"}
            onChange={(val) => onUpdate({ key: val })}
            options={[
              { value: "RIGHT", label: "Swipe Right" },
              { value: "LEFT", label: "Swipe Left" },
              { value: "UP", label: "Swipe Up" },
              { value: "DOWN", label: "Swipe Down" },
            ]}
          />
          <Input
            size="xs"
            label="From Element (Optional)"
            value={act.selector ?? ""}
            onChange={(e) => onUpdate({ selector: e.target.value })}
            placeholder="Element to start swipe from"
            mono
          />
        </div>
      )}

      {/* Mobile: Press Key */}
      {stepDriver === "mobile" && actType === "press" && (
        <Select
          size="xs"
          label="Key Name"
          value={act.key ?? "BACK"}
          onChange={(val) => onUpdate({ key: val })}
          options={[
            { value: "BACK", label: "Back Key" },
            { value: "ENTER", label: "Enter Key" },
            { value: "HOME", label: "Home Key" },
            { value: "TAB", label: "Tab Key" },
          ]}
        />
      )}
    </>
  )
}
