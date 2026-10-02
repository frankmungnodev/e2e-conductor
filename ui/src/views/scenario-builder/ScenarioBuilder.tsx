import { useMemo, useState } from "react"
import { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import { useUrlTab } from "../../components/Tabs.tsx"
import type { ConfigMeta, FlowItem, ScenarioItem } from "../../types.ts"
import { AddStepModal } from "./AddStepModal.tsx"
import { NoScenarioState } from "./NoScenarioState.tsx"
import { SavePresetModal } from "./SavePresetModal.tsx"
import { ScenarioListPanel } from "./ScenarioListPanel.tsx"
import { ScenarioSettingsModal } from "./ScenarioSettingsModal.tsx"
import { StepInspector } from "./StepInspector.tsx"
import { StepListPanel } from "./StepListPanel.tsx"
import { getTargetBadgeVariant, getTargetDriver, type StepDriver } from "./stepDefaults.ts"
import { type SaveScenario, useScenarioDraft } from "./useScenarioDraft.tsx"
import { useStepPresets } from "./useStepPresets.tsx"

export type ScenarioBuilderProps = {
  scenarios: ScenarioItem[]
  flows?: FlowItem[]
  config?: ConfigMeta
  isRunning?: boolean
  onStartRun?: (options: any) => void
  onSaveScenario: SaveScenario
  onDeleteScenario: (id: string) => Promise<void>
  onSaveFlow?: (
    target: string,
    file: string,
    content: string,
  ) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>
  onNavigateToConfig?: (sub?: string) => void
}

export function ScenarioBuilder({
  scenarios,
  config,
  onSaveScenario,
  onDeleteScenario,
  onNavigateToConfig,
}: ScenarioBuilderProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [inspectorMode, setInspectorMode] = useUrlTab<"designer" | "json">(
    "mode",
    "designer",
    ["designer", "json"] as const,
  )
  const [isAddStepModalOpen, setIsAddStepModalOpen] = useState(false)
  const [addStepModalTab, setAddStepModalTab] = useState<"drivers" | "presets">("drivers")

  const { confirm, ConfirmDialog } = useConfirmDialog()
  const presets = useStepPresets(confirm)
  const draft = useScenarioDraft({ scenarios, config, inspectorMode, onSaveScenario, onDeleteScenario, confirm })
  const { draftScenario, selectedStepIdx } = draft

  // Target options from config
  const configuredTargets = Object.keys(config?.targets ?? {})
  const availableTargets = Array.from(
    new Set([...configuredTargets, "web", "mobile", "shell", "api"]),
  )
  const driverOf = (target: string) => getTargetDriver(target, config)
  const badgeVariantOf = (target: string) => getTargetBadgeVariant(target, config)

  const openAddStep = () => {
    setAddStepModalTab("drivers")
    setIsAddStepModalOpen(true)
  }

  const closeAddStep = () => {
    setIsAddStepModalOpen(false)
    presets.setPresetSearch("")
  }

  const handleAddStep = (driverType: StepDriver) => {
    if (!draftScenario) return
    draft.addStep(driverType)
    closeAddStep()
  }

  const filteredScenarios = scenarios.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const selectedStep =
    draftScenario && draftScenario.steps[selectedStepIdx] !== undefined
      ? draftScenario.steps[selectedStepIdx]
      : null

  const stepDriver = selectedStep ? driverOf(selectedStep.target) : "web"

  const availableFixtures = useMemo(() => {
    const list: string[] = []
    if (Array.isArray(config?.fixtures)) {
      list.push(...config.fixtures)
    } else if (config?.fixtures && typeof config.fixtures === "object") {
      list.push(...Object.keys(config.fixtures))
    }
    if (draftScenario?.setup) {
      list.push(...draftScenario.setup)
    }
    return Array.from(new Set(list.filter(Boolean)))
  }, [config?.fixtures, draftScenario?.setup])

  return (
    <div className="flex h-[calc(100vh-49px)] overflow-hidden bg-editor text-fg select-none">
      {/* ========================================================================= */}
      {/* COLUMN 1: SCENARIOS EXPLORER                                              */}
      {/* ========================================================================= */}
      <ScenarioListPanel
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        createNewScenario={draft.createNewScenario}
        isSaving={draft.isSaving}
        filteredScenarios={filteredScenarios}
        selectedScenarioId={draft.selectedScenarioId}
        selectScenario={draft.selectScenario}
      />

      {draftScenario ? (
        <>
          {/* ========================================================================= */}
          {/* COLUMN 2: STEPPER SEQUENCE & SCENARIO OVERVIEW                            */}
          {/* ========================================================================= */}
          <StepListPanel
            draftScenario={draftScenario}
            isSaving={draft.isSaving}
            saveSuccess={draft.saveSuccess}
            selectedStepIdx={selectedStepIdx}
            setSelectedStepIdx={draft.setSelectedStepIdx}
            setShowScenarioSettings={draft.setShowScenarioSettings}
            openAddStep={openAddStep}
            moveStep={draft.moveStep}
            duplicateStep={draft.duplicateStep}
            deleteStep={draft.deleteStep}
            getTargetBadgeVariant={badgeVariantOf}
          />

          {/* ========================================================================= */}
          {/* COLUMN 3: STEP INSPECTOR & COMPOSITE ACTIONS                              */}
          {/* ========================================================================= */}
          <StepInspector
            draftScenario={draftScenario}
            selectedStep={selectedStep}
            selectedStepIdx={selectedStepIdx}
            stepDriver={stepDriver}
            inspectorMode={inspectorMode}
            setInspectorMode={setInspectorMode}
            availableTargets={availableTargets}
            getTargetDriver={driverOf}
            updateStep={draft.updateStep}
            addStepAction={draft.addStepAction}
            updateStepAction={draft.updateStepAction}
            moveStepAction={draft.moveStepAction}
            deleteStepAction={draft.deleteStepAction}
            jsonText={draft.jsonText}
            jsonError={draft.jsonError}
            handleJsonChange={draft.handleJsonChange}
            openSavePreset={presets.openSavePreset}
            openAddStep={openAddStep}
          />
        </>
      ) : (
        /* ========================================================================= */
        /* UNIFIED WORKSPACE: NO SCENARIO SELECTED                                   */
        /* ========================================================================= */
        <NoScenarioState scenarios={scenarios} createNewScenario={draft.createNewScenario} isSaving={draft.isSaving} />
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD STEP (DRIVERS & PRESETS)                                       */}
      {/* ========================================================================= */}
      <AddStepModal
        isAddStepModalOpen={isAddStepModalOpen}
        onClose={closeAddStep}
        addStepModalTab={addStepModalTab}
        setAddStepModalTab={setAddStepModalTab}
        stepPresets={presets.stepPresets}
        filteredStepPresets={presets.filteredStepPresets}
        presetSearch={presets.presetSearch}
        setPresetSearch={presets.setPresetSearch}
        addStep={handleAddStep}
        insertStepPreset={(preset) => {
          if (!draftScenario) return
          draft.insertPresetStep(preset.step)
          closeAddStep()
        }}
        handleDeletePreset={presets.handleDeletePreset}
        getTargetBadgeVariant={badgeVariantOf}
      />

      {/* ========================================================================= */}
      {/* MODAL: SAVE AS STEP PRESET                                                */}
      {/* ========================================================================= */}
      <SavePresetModal
        isSavePresetModalOpen={presets.isSavePresetModalOpen}
        closeSavePreset={presets.closeSavePreset}
        newPresetName={presets.newPresetName}
        setNewPresetName={presets.setNewPresetName}
        newPresetDesc={presets.newPresetDesc}
        setNewPresetDesc={presets.setNewPresetDesc}
        handleSaveStepAsPreset={() => presets.handleSaveStepAsPreset(draftScenario?.steps[selectedStepIdx])}
        selectedStep={selectedStep}
      />

      {/* ========================================================================= */}
      {/* MODAL: SCENARIO SETTINGS & FIXTURES                                        */}
      {/* ========================================================================= */}
      <ScenarioSettingsModal
        showScenarioSettings={draft.showScenarioSettings}
        setShowScenarioSettings={draft.setShowScenarioSettings}
        draftScenario={draftScenario}
        updateDraft={draft.updateDraft}
        handleDeleteScenario={draft.handleDeleteScenario}
        onNavigateToConfig={onNavigateToConfig}
        availableFixtures={availableFixtures}
      />

      <ConfirmDialog />
    </div>
  )
}
