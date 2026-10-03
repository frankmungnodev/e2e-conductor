import { Button } from "../../components/Button.tsx"
import { Input } from "../../components/FormControls.tsx"
import { Modal } from "../../components/Modal.tsx"
import type { ScenarioStep } from "../../types.ts"
import { titleCase } from "./stepDefaults.ts"

export interface SavePresetModalProps {
  isSavePresetModalOpen: boolean
  closeSavePreset: () => void
  newPresetName: string
  setNewPresetName: (value: string) => void
  newPresetDesc: string
  setNewPresetDesc: (value: string) => void
  handleSaveStepAsPreset: () => void
  selectedStep: ScenarioStep | null
}

/** Save the selected step as a named, reusable preset. */
export function SavePresetModal({
  isSavePresetModalOpen,
  closeSavePreset,
  newPresetName,
  setNewPresetName,
  newPresetDesc,
  setNewPresetDesc,
  handleSaveStepAsPreset,
  selectedStep,
}: SavePresetModalProps) {
  return (
    <Modal
      isOpen={isSavePresetModalOpen}
      onClose={closeSavePreset}
      title="Save Current Step as Reusable Preset"
      description="Create a named reusable template from this step for re-use across test scenarios"
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            size="xs"
            variant="secondary"
            onClick={closeSavePreset}
          >
            Cancel
          </Button>
          <Button
            size="xs"
            variant="primary"
            disabled={!newPresetName.trim()}
            onClick={handleSaveStepAsPreset}
          >
            Save Preset
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input
          size="sm"
          label="Preset Name"
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          placeholder="e.g. Admin Web Login, Seed Database"
        />

        <Input
          size="sm"
          label="Description (Optional)"
          value={newPresetDesc}
          onChange={(e) => setNewPresetDesc(e.target.value)}
          placeholder="Brief description of what this step accomplishes"
        />

        <div className="p-2.5 rounded-xs bg-sidebar border border-border text-xs text-fg-muted flex items-center justify-between">
          <span>Target Platform:</span>
          <span className="font-semibold text-fg-bright">
            {titleCase(selectedStep?.target || "None")}
          </span>
        </div>

        <div className="p-2.5 rounded-xs bg-sidebar border border-border text-xs text-fg-muted flex items-center justify-between">
          <span>Actions Configured:</span>
          <span className="font-semibold text-fg-bright">
            {selectedStep?.actions?.length ?? 0} Action(s)
          </span>
        </div>
      </div>
    </Modal>
  )
}
