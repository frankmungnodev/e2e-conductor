import { Bookmark, Layers, Search, Trash2 } from "lucide-react"
import { Badge, type BadgeVariant } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
import { Input } from "../../components/FormControls.tsx"
import { Modal } from "../../components/Modal.tsx"
import { TabButton } from "../../components/Tabs.tsx"
import type { StepDriver } from "../../targetDriver.ts"
import type { StepPreset } from "../../types.ts"
import { DRIVER_OPTIONS } from "./constants.tsx"
import { titleCase } from "./stepDefaults.ts"

export interface AddStepModalProps {
  isAddStepModalOpen: boolean
  onClose: () => void
  addStepModalTab: "drivers" | "presets"
  setAddStepModalTab: (tab: "drivers" | "presets") => void
  stepPresets: StepPreset[]
  filteredStepPresets: StepPreset[]
  presetSearch: string
  setPresetSearch: (value: string) => void
  addStep: (driver: StepDriver) => void
  insertStepPreset: (preset: StepPreset) => void
  handleDeletePreset: (id: string, name: string) => void
  getTargetBadgeVariant: (target: string) => BadgeVariant
}

/** Add Step dialog: pick a driver, or insert a saved preset. */
export function AddStepModal({
  isAddStepModalOpen,
  onClose,
  addStepModalTab,
  setAddStepModalTab,
  stepPresets,
  filteredStepPresets,
  presetSearch,
  setPresetSearch,
  addStep,
  insertStepPreset,
  handleDeletePreset,
  getTargetBadgeVariant,
}: AddStepModalProps) {
  return (
    <Modal
      isOpen={isAddStepModalOpen}
      onClose={onClose}
      title="Add Step"
      description="Select an automation driver or choose from saved reusable presets"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Segmented Tab Controls */}
        <div className="flex items-center gap-1.5 border-b border-border pb-3">
          <TabButton
            variant="pills"
            active={addStepModalTab === "drivers"}
            onClick={() => setAddStepModalTab("drivers")}
            icon={<Layers className="w-3.5 h-3.5" />}
          >
            Drivers
          </TabButton>
          <TabButton
            variant="pills"
            active={addStepModalTab === "presets"}
            onClick={() => setAddStepModalTab("presets")}
            icon={<Bookmark className="w-3.5 h-3.5" />}
            badge={
              <span
                className={`text-xs px-1.5 py-0.2 rounded-full font-mono ${
                  addStepModalTab === "presets"
                    ? "bg-white/20 text-white"
                    : "bg-input text-fg-muted"
                }`}
              >
                {stepPresets.length}
              </span>
            }
          >
            Presets
          </TabButton>
        </div>

        {/* TAB 1: DRIVERS */}
        {addStepModalTab === "drivers" && (
          <div className="h-71 space-y-2 overflow-y-auto pr-0.5">
            {DRIVER_OPTIONS.map((driver) => (
              <div
                key={driver.id}
                onClick={() => addStep(driver.id)}
                className="p-3 rounded-xs border border-border bg-sidebar hover:border-primary/60 hover:bg-hover/50 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xs border flex items-center justify-center shrink-0 ${driver.iconBg}`}
                  >
                    {driver.icon}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-fg-bright group-hover:text-primary transition-colors">
                        {driver.title}
                      </span>
                      <Badge variant={driver.badgeVariant} size="xs">
                        {driver.badgeLabel}
                      </Badge>
                    </div>
                    <span className="text-xs text-fg-muted truncate">
                      {driver.subtitle}
                    </span>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  className="group-hover:border-primary group-hover:text-primary shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    addStep(driver.id)
                  }}
                >
                  Add Step
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: PRESETS */}
        {addStepModalTab === "presets" && (
          <div className="h-71 flex flex-col space-y-3">
            {stepPresets.length > 0 && (
              <Input
                size="sm"
                icon={<Search className="w-3.5 h-3.5" />}
                placeholder="Search presets by name or description..."
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
              />
            )}

            {filteredStepPresets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-4 text-center">
                <EmptyState
                  size="sm"
                  icon={<Bookmark className="w-5 h-5 text-fg-muted" />}
                  title={
                    stepPresets.length === 0
                      ? "No Step Presets Saved Yet"
                      : "No Matching Presets"
                  }
                  description={
                    stepPresets.length === 0
                      ? "Configure a step in any scenario and click \"Save as Preset\" to build reusable templates."
                      : `No presets found matching "${presetSearch}".`
                  }
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                {filteredStepPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-3 rounded-xs border border-border bg-sidebar hover:border-primary/50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-fg-bright truncate">
                          {preset.name}
                        </span>
                        <Badge
                          variant={getTargetBadgeVariant(preset.target)}
                          size="xs"
                        >
                          {titleCase(preset.target)}
                        </Badge>
                        <Badge variant="neutral" size="xs">
                          {preset.step.actions?.length ?? 1}{" "}
                          {(preset.step.actions?.length ?? 1) === 1
                            ? "Action"
                            : "Actions"}
                        </Badge>
                      </div>
                      {preset.description && (
                        <span className="text-xs text-fg-muted truncate">
                          {preset.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => insertStepPreset(preset)}
                      >
                        Insert
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          handleDeletePreset(preset.id, preset.name)
                        }
                        title="Delete preset"
                        icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
