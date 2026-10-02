import { useEffect, useRef, useState } from "react"
import type { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import { useToast } from "../../components/Toast.tsx"
import type { ConfigMeta, ScenarioItem, ScenarioStep, StepAction } from "../../types.ts"
import {
  capitalize,
  defaultActionType,
  getTargetDriver,
  newStep,
  newStepAction,
  type StepDriver,
  withDefaultActions,
} from "./stepDefaults.ts"

export type SaveScenario = (
  id: string,
  content: any,
) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>

type UseScenarioDraftOptions = {
  scenarios: ScenarioItem[]
  config?: ConfigMeta
  inspectorMode: "designer" | "json"
  onSaveScenario: SaveScenario
  onDeleteScenario: (id: string) => Promise<void>
  confirm: ReturnType<typeof useConfirmDialog>["confirm"]
}

/**
 * The scenario being edited: selection, the editable draft, debounced auto-save, the raw JSON mirror,
 * and every scenario, step, and action edit.
 */
export function useScenarioDraft({
  scenarios,
  config,
  inspectorMode,
  onSaveScenario,
  onDeleteScenario,
  confirm,
}: UseScenarioDraftOptions) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [draftScenario, setDraftScenario] = useState<ScenarioItem | null>(null)
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0)
  const [showScenarioSettings, setShowScenarioSettings] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const isDirtyRef = useRef(false)
  const isInitialMount = useRef(true)
  const draftScenarioRef = useRef<ScenarioItem | null>(null)
  draftScenarioRef.current = draftScenario

  const { error: toastError, success: toastSuccess } = useToast()

  const configuredTargets = Object.keys(config?.targets ?? {})

  // Auto-select first scenario on mount
  useEffect(() => {
    if (!selectedScenarioId && scenarios.length > 0) {
      selectScenario(scenarios[0].id)
    }
  }, [scenarios, selectedScenarioId])

  // Save Scenario (Auto-saved)
  const handleSaveScenario = async (targetScenario = draftScenario) => {
    if (!targetScenario) return
    setIsSaving(true)
    try {
      let content = {
        ...targetScenario.raw,
        name: targetScenario.name,
        description: targetScenario.description,
        setup: targetScenario.setup,
        vars: targetScenario.vars,
        steps: targetScenario.steps,
      }
      if (inspectorMode === "json") {
        try {
          content = JSON.parse(jsonText)
        } catch (e) {
          setJsonError((e as Error).message)
          setIsSaving(false)
          return
        }
      }
      const res = await onSaveScenario(targetScenario.id, content)
      if (res) {
        setDraftScenario((prev) =>
          prev && prev.id === targetScenario.id
            ? { ...prev, isValid: res.isValid, errors: res.errors }
            : prev,
        )
      }
      isDirtyRef.current = false
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 1500)
    } catch (e) {
      toastError((e as Error).message, "Failed to save scenario")
    } finally {
      setIsSaving(false)
    }
  }

  // Debounced auto-save effect
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!isDirtyRef.current || !draftScenario) return

    const timer = setTimeout(() => {
      handleSaveScenario(draftScenario)
    }, 600)

    return () => clearTimeout(timer)
  }, [draftScenario, inspectorMode, jsonText])

  // Flush unsaved changes on unmount
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && draftScenarioRef.current) {
        const scenario = draftScenarioRef.current
        const content = {
          ...scenario.raw,
          name: scenario.name,
          description: scenario.description,
          setup: scenario.setup,
          vars: scenario.vars,
          steps: scenario.steps,
        }
        onSaveScenario(scenario.id, content).catch(() => {})
      }
    }
  }, [onSaveScenario])

  const selectScenario = async (id: string) => {
    const sc = scenarios.find((s) => s.id === id)
    if (!sc) return

    if (isDirtyRef.current && draftScenario && draftScenario.id !== id) {
      await handleSaveScenario(draftScenario)
    }
    isDirtyRef.current = false

    setSelectedScenarioId(id)
    const cloned = JSON.parse(JSON.stringify(sc)) as ScenarioItem

    // GUARANTEE: Every step has an initialized actions array so Step Actions is ALWAYS visible!
    if (cloned.steps) {
      cloned.steps = withDefaultActions(cloned.steps, config)
      cloned.raw = { ...cloned.raw, steps: cloned.steps }
    }

    setDraftScenario(cloned)
    setSelectedStepIdx(0)
    setShowScenarioSettings(false)
    setJsonText(JSON.stringify(cloned.raw, null, 2))
    setJsonError(null)
  }

  const createNewScenario = async () => {
    const newId = `scenario_${Date.now().toString().slice(-4)}`
    const newSc: ScenarioItem = {
      id: newId,
      file: `${newId}.json`,
      name: "New Scenario",
      description: "Description of test scenario",
      steps: [],
      setup: [],
      vars: {},
      targets: [],
      isValid: true,
      errors: [],
      raw: {
        name: "New Scenario",
        description: "Description of test scenario",
        steps: [],
      },
    }
    isDirtyRef.current = false
    try {
      setIsSaving(true)
      const res = await onSaveScenario(newId, newSc.raw)
      if (res) {
        newSc.isValid = res.isValid
        newSc.errors = res.errors
      }
      setDraftScenario(newSc)
      setSelectedScenarioId(newId)
      setSelectedStepIdx(0)
      setShowScenarioSettings(false)
      setJsonText(JSON.stringify(newSc.raw, null, 2))
      setJsonError(null)
      toastSuccess(`Scenario "${newSc.name}" created`, "Created")
    } catch (e) {
      toastError((e as Error).message, "Failed to create scenario")
    } finally {
      setIsSaving(false)
    }
  }

  const updateDraft = (newScenario: ScenarioItem) => {
    isDirtyRef.current = true
    setDraftScenario(newScenario)
    setJsonText(JSON.stringify(newScenario.raw, null, 2))
  }

  /** Applies hand-edited raw JSON to the draft when it parses, or shows the parse error. */
  const handleJsonChange = (text: string) => {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      isDirtyRef.current = true
      setDraftScenario((prev) =>
        prev
          ? {
              ...prev,
              name: parsed.name ?? prev.name,
              description: parsed.description ?? prev.description,
              steps: parsed.steps ?? [],
              setup: parsed.setup ?? [],
              vars: parsed.vars ?? {},
              raw: parsed,
            }
          : null,
      )
      setJsonError(null)
    } catch (err) {
      setJsonError((err as Error).message)
    }
  }

  const updateStep = (index: number, updates: Partial<ScenarioStep>) => {
    if (!draftScenario?.steps[index]) return
    const newSteps = [...draftScenario.steps]
    newSteps[index] = { ...newSteps[index], ...updates }
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
  }

  // Action Manipulation within a Step
  const addStepAction = (stepIdx: number, defaultAction?: string) => {
    const step = draftScenario?.steps[stepIdx]
    if (!step) return
    const actType = defaultAction || defaultActionType(getTargetDriver(step.target, config))
    const currentActions = step.actions ?? []
    updateStep(stepIdx, { actions: [...currentActions, newStepAction(actType)] })
  }

  const updateStepAction = (stepIdx: number, actionIdx: number, updates: Partial<StepAction>) => {
    const step = draftScenario?.steps[stepIdx]
    if (!step?.actions?.[actionIdx]) return
    const currentActions = [...step.actions]
    currentActions[actionIdx] = { ...currentActions[actionIdx], ...updates }
    updateStep(stepIdx, { actions: currentActions })
  }

  const deleteStepAction = (stepIdx: number, actionIdx: number) => {
    const step = draftScenario?.steps[stepIdx]
    if (!step?.actions) return
    const currentActions = step.actions.filter((_, i) => i !== actionIdx)
    updateStep(stepIdx, { actions: currentActions })
  }

  const moveStepAction = (stepIdx: number, actionIdx: number, direction: "up" | "down") => {
    const step = draftScenario?.steps[stepIdx]
    if (!step?.actions) return
    const targetIdx = direction === "up" ? actionIdx - 1 : actionIdx + 1
    if (targetIdx < 0 || targetIdx >= step.actions.length) return
    const currentActions = [...step.actions]
    const temp = currentActions[actionIdx]
    currentActions[actionIdx] = currentActions[targetIdx]
    currentActions[targetIdx] = temp
    updateStep(stepIdx, { actions: currentActions })
  }

  // Step Sequence Operations
  const addStep = (driverType: StepDriver) => {
    if (!draftScenario) return
    let matchingTarget = configuredTargets.find((t) => config?.targets?.[t].driver === driverType)
    if (!matchingTarget) matchingTarget = driverType

    const step = newStep(driverType, matchingTarget)
    const newSteps = [...draftScenario.steps, step]
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(newSteps.length - 1)
    setShowScenarioSettings(false)
    toastSuccess(`Added ${capitalize(driverType)} step "${step.name}"`, "Step Added")
  }

  const deleteStep = (index: number) => {
    if (!draftScenario) return
    const newSteps = draftScenario.steps.filter((_, i) => i !== index)
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    if (selectedStepIdx >= newSteps.length) {
      setSelectedStepIdx(Math.max(0, newSteps.length - 1))
    }
  }

  const duplicateStep = (index: number) => {
    if (!draftScenario) return
    const stepToCopy = JSON.parse(JSON.stringify(draftScenario.steps[index])) as ScenarioStep
    stepToCopy.id = `step_${Date.now()}`
    stepToCopy.name = `${stepToCopy.name} (Copy)`
    const newSteps = [...draftScenario.steps]
    newSteps.splice(index + 1, 0, stepToCopy)
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(index + 1)
  }

  const moveStep = (index: number, direction: "up" | "down") => {
    if (!draftScenario) return
    const targetIdx = direction === "up" ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= draftScenario.steps.length) return
    const newSteps = [...draftScenario.steps]
    const temp = newSteps[index]
    newSteps[index] = newSteps[targetIdx]
    newSteps[targetIdx] = temp
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(targetIdx)
  }

  /** Inserts a copy of a preset's step after the selected step (or first, when the scenario is empty). */
  const insertPresetStep = (presetStep: ScenarioStep) => {
    if (!draftScenario) return
    const clonedStep = JSON.parse(JSON.stringify(presetStep)) as ScenarioStep
    clonedStep.id = `step_${Date.now()}`
    const insertAt = draftScenario.steps.length > 0 ? selectedStepIdx + 1 : 0
    const newSteps = [...draftScenario.steps.slice(0, insertAt), clonedStep, ...draftScenario.steps.slice(insertAt)]
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(insertAt)
    toastSuccess(`Added step "${clonedStep.name}" from preset`, "Preset Inserted")
  }

  const handleDeleteScenario = () => {
    if (!draftScenario) return
    const id = draftScenario.id
    const name = draftScenario.name
    confirm({
      title: "Delete Scenario",
      message: (
        <span>
          Are you sure you want to delete scenario{" "}
          <strong className="text-fg-bright font-mono">"{name || id}"</strong>? This action cannot be undone.
        </span>
      ),
      confirmText: "Delete Scenario",
      variant: "danger",
      onConfirm: async () => {
        isDirtyRef.current = false
        await onDeleteScenario(id)
        toastSuccess(`Scenario "${id}" deleted`, "Deleted")
        if (scenarios.length > 1) {
          const other = scenarios.find((s) => s.id !== id)
          if (other) selectScenario(other.id)
        } else {
          setDraftScenario(null)
          setSelectedScenarioId(null)
        }
      },
    })
  }

  return {
    selectedScenarioId,
    draftScenario,
    selectedStepIdx,
    setSelectedStepIdx,
    showScenarioSettings,
    setShowScenarioSettings,
    isSaving,
    saveSuccess,
    jsonText,
    jsonError,
    handleJsonChange,
    selectScenario,
    createNewScenario,
    updateDraft,
    updateStep,
    addStepAction,
    updateStepAction,
    deleteStepAction,
    moveStepAction,
    addStep,
    deleteStep,
    duplicateStep,
    moveStep,
    insertPresetStep,
    handleDeleteScenario,
  }
}

export type ScenarioDraft = ReturnType<typeof useScenarioDraft>
