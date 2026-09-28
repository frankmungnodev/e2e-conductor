import {
  ArrowDown,
  ArrowUp,
  Check,
  Code,
  Copy,
  ExternalLink,
  FilePlus2,
  Globe,
  Layers,
  Plus,
  Save,
  Search,
  Settings,
  Smartphone,
  Terminal,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { deleteStepPreset, fetchStepPresets, saveStepPreset } from "../api.ts"
import type { ConfigMeta, FlowItem, ScenarioItem, ScenarioStep, StepAction, StepPreset } from "../types.ts"
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { EmptyState } from "./EmptyState.tsx"
import { Modal } from "./Modal.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { Panel } from "./Panel.tsx"
import { Select } from "./Select.tsx"
import { useToast } from "./Toast.tsx"

const WEB_ACTION_OPTIONS = [
  { value: "navigate", label: "Navigate to URL" },
  { value: "click", label: "Click Element" },
  { value: "fill", label: "Fill / Type Text" },
  { value: "press", label: "Press Key (e.g. Enter)" },
  { value: "wait_for", label: "Wait for Element or Timeout" },
  { value: "assert_visible", label: "Assert Element Visible" },
  { value: "assert_text", label: "Assert Element Contains Text" },
  { value: "hover", label: "Hover over Element" },
  { value: "select", label: "Select Dropdown Option" },
  { value: "check", label: "Check Checkbox" },
  { value: "uncheck", label: "Uncheck Checkbox" },
  { value: "screenshot", label: "Capture Screenshot" },
  { value: "eval", label: "Evaluate JavaScript" },
]

const MOBILE_ACTION_OPTIONS = [
  { value: "tap", label: "Tap Element / Text" },
  { value: "type", label: "Type Text" },
  { value: "press", label: "Press Hardware Key" },
  { value: "assert_visible", label: "Assert Element Visible" },
  { value: "assert_not_visible", label: "Assert Not Visible" },
  { value: "swipe", label: "Swipe Screen" },
  { value: "wait", label: "Wait for Element or Timeout" },
  { value: "back", label: "Press Back Button" },
  { value: "hidekeyboard", label: "Hide Keyboard" },
  { value: "launch", label: "Launch Application" },
  { value: "stop", label: "Stop Application" },
]

export type ScenarioBuilderProps = {
  scenarios: ScenarioItem[]
  flows?: FlowItem[]
  config?: ConfigMeta
  isRunning?: boolean
  onStartRun?: (options: any) => void
  onSaveScenario: (
    id: string,
    content: any,
  ) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>
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
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [draftScenario, setDraftScenario] = useState<ScenarioItem | null>(null)
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0)
  const [inspectorMode, setInspectorMode] = useState<"designer" | "json">("designer")
  const [showScenarioSettings, setShowScenarioSettings] = useState(false)

  // Presets state
  const [stepPresets, setStepPresets] = useState<StepPreset[]>([])
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false)
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")
  const [newPresetDesc, setNewPresetDesc] = useState("")

  // Form states
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [newVarKey, setNewVarKey] = useState("")
  const [newVarVal, setNewVarVal] = useState("")

  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast()

  // Target options from config
  const configuredTargets = Object.keys(config?.targets ?? {})
  const availableTargets = Array.from(
    new Set([...configuredTargets, "web", "mobile", "shell", "api"]),
  )

  const capitalize = (str: string) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ""

  const getTargetDriver = (target: string): "http" | "web" | "mobile" | "shell" => {
    if (target === "shell") return "shell"
    const targetObj = config?.targets?.[target]
    if (targetObj) return targetObj.driver
    if (target.includes("web") || target.includes("browser")) return "web"
    if (target.includes("mobile") || target.includes("app")) return "mobile"
    return "http"
  }

  const getTargetBadgeVariant = (target: string): BadgeVariant => {
    const driver = getTargetDriver(target)
    if (driver === "shell") return "driver-shell"
    if (driver === "http") return "driver-http"
    if (driver === "mobile") return "driver-mobile"
    return "driver-web"
  }

  // Load presets from SQLite & .e2e/presets/
  const loadPresets = async () => {
    try {
      const data = await fetchStepPresets()
      setStepPresets(data.presets ?? [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadPresets()
  }, [])

  // Auto-select first scenario on mount
  useEffect(() => {
    if (!selectedScenarioId && scenarios.length > 0) {
      selectScenario(scenarios[0].id)
    }
  }, [scenarios, selectedScenarioId])

  const selectScenario = (id: string) => {
    const sc = scenarios.find((s) => s.id === id)
    if (!sc) return
    setSelectedScenarioId(id)
    const cloned = JSON.parse(JSON.stringify(sc)) as ScenarioItem
    // Ensure all steps have actions array initialized if web or mobile
    if (cloned.steps) {
      cloned.steps = cloned.steps.map((st) => {
        const driver = getTargetDriver(st.target)
        if ((driver === "web" || driver === "mobile") && (!st.actions || st.actions.length === 0)) {
          const defaultAct = driver === "web" ? "navigate" : "tap"
          return {
            ...st,
            actions: [
              {
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                action: defaultAct,
                url: driver === "web" ? "/" : undefined,
                selector: driver === "mobile" ? "Button" : undefined,
              },
            ],
          }
        }
        return st
      })
    }
    setDraftScenario(cloned)
    setSelectedStepIdx(0)
    setShowScenarioSettings(false)
    setJsonText(JSON.stringify(cloned.raw, null, 2))
    setJsonError(null)
  }

  const createNewScenario = () => {
    const newId = `scenario_${Date.now().toString().slice(-4)}`
    const defaultTarget = availableTargets.find((t) => getTargetDriver(t) === "web") ?? "web"
    const newSc: ScenarioItem = {
      id: newId,
      file: `${newId}.json`,
      name: "New Scenario",
      description: "Description of test scenario",
      steps: [
        {
          name: "Open Application",
          target: defaultTarget,
          actions: [
            {
              id: `act_${Date.now()}_1`,
              action: "navigate",
              url: "/",
            },
          ],
        },
      ],
      setup: [],
      vars: {},
      targets: [defaultTarget],
      isValid: true,
      errors: [],
      raw: {
        name: "New Scenario",
        description: "Description of test scenario",
        steps: [
          {
            name: "Open Application",
            target: defaultTarget,
            actions: [
              {
                id: `act_${Date.now()}_1`,
                action: "navigate",
                url: "/",
              },
            ],
          },
        ],
      },
    }
    setDraftScenario(newSc)
    setSelectedScenarioId(newId)
    setSelectedStepIdx(0)
    setShowScenarioSettings(false)
    setJsonText(JSON.stringify(newSc.raw, null, 2))
    setJsonError(null)
  }

  const updateDraft = (newScenario: ScenarioItem) => {
    setDraftScenario(newScenario)
    setJsonText(JSON.stringify(newScenario.raw, null, 2))
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
    const driver = getTargetDriver(step.target)
    const actType = defaultAction ?? (driver === "web" ? "navigate" : "tap")
    const newAction: StepAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action: actType,
      url: actType === "navigate" ? "/" : undefined,
    }
    const currentActions = step.actions ?? []
    updateStep(stepIdx, { actions: [...currentActions, newAction] })
  }

  const updateStepAction = (
    stepIdx: number,
    actionIdx: number,
    updates: Partial<StepAction>,
  ) => {
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

  const moveStepAction = (
    stepIdx: number,
    actionIdx: number,
    direction: "up" | "down",
  ) => {
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
  const addStep = (driverType: "web" | "mobile" | "http" | "shell") => {
    if (!draftScenario) return
    let matchingTarget = configuredTargets.find(
      (t) => config?.targets?.[t].driver === driverType,
    )
    if (!matchingTarget) matchingTarget = driverType

    const newStep: ScenarioStep = {
      id: `step_${Date.now()}`,
      name: `New ${capitalize(driverType)} Step`,
      target: matchingTarget,
    }

    if (driverType === "web") {
      newStep.actions = [
        {
          id: `act_${Date.now()}_1`,
          action: "navigate",
          url: "/",
        },
      ]
    } else if (driverType === "mobile") {
      newStep.actions = [
        {
          id: `act_${Date.now()}_1`,
          action: "tap",
          selector: "Button",
        },
      ]
    } else if (driverType === "http") {
      newStep.method = "GET"
      newStep.url = "/api/status"
      newStep.assert = { status: 200 }
    } else if (driverType === "shell") {
      newStep.command = "echo 'Step execution'"
      newStep.assert = { exit_code: 0 }
    }

    const newSteps = [...draftScenario.steps, newStep]
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(newSteps.length - 1)
    setShowScenarioSettings(false)
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

  // Presets Integration
  const insertStepPreset = (preset: StepPreset) => {
    if (!draftScenario) return
    const clonedStep = JSON.parse(JSON.stringify(preset.step)) as ScenarioStep
    clonedStep.id = `step_${Date.now()}`
    const insertAt = draftScenario.steps.length > 0 ? selectedStepIdx + 1 : 0
    const newSteps = [
      ...draftScenario.steps.slice(0, insertAt),
      clonedStep,
      ...draftScenario.steps.slice(insertAt),
    ]
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(insertAt)
    setIsPresetModalOpen(false)
    toastSuccess(`Added step "${clonedStep.name}" from preset`, "Preset Inserted")
  }

  const handleSaveStepAsPreset = async () => {
    if (!draftScenario || selectedStepIdx < 0 || !newPresetName.trim()) return
    const stepToSave = draftScenario.steps[selectedStepIdx]
    if (!stepToSave) return

    try {
      const presetId = `preset-${newPresetName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || Date.now()}`
      await saveStepPreset({
        id: presetId,
        name: newPresetName.trim(),
        description: newPresetDesc.trim() || undefined,
        target: stepToSave.target,
        step: JSON.parse(JSON.stringify(stepToSave)),
      })
      await loadPresets()
      setIsSavePresetModalOpen(false)
      setNewPresetName("")
      setNewPresetDesc("")
      toastSuccess(`Saved step as preset "${newPresetName.trim()}"`, "Preset Saved")
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Preset")
    }
  }

  const handleDeletePreset = async (id: string, name: string) => {
    try {
      await deleteStepPreset(id)
      await loadPresets()
      toastInfo(`Deleted preset "${name}"`, "Preset Removed")
    } catch (err) {
      toastError((err as Error).message, "Failed to Delete Preset")
    }
  }

  // Save Scenario
  const handleSaveScenario = async () => {
    if (!draftScenario) return
    setIsSaving(true)
    try {
      let content = draftScenario.raw
      if (inspectorMode === "json") {
        try {
          content = JSON.parse(jsonText)
        } catch (e) {
          setJsonError((e as Error).message)
          setIsSaving(false)
          return
        }
      }
      const res = await onSaveScenario(draftScenario.id, content)
      if (res) {
        setDraftScenario((prev) =>
          prev ? { ...prev, isValid: res.isValid, errors: res.errors } : null,
        )
      }
      setSaveSuccess(true)
      toastSuccess(`Scenario "${draftScenario.name}" saved`, "Saved")
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (e) {
      toastError((e as Error).message, "Failed to save scenario")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteScenario = async () => {
    if (!draftScenario) return
    if (!confirm(`Are you sure you want to delete scenario "${draftScenario.id}"?`)) return
    await onDeleteScenario(draftScenario.id)
    toastSuccess(`Scenario "${draftScenario.id}" deleted`, "Deleted")
    if (scenarios.length > 1) {
      const other = scenarios.find((s) => s.id !== draftScenario.id)
      if (other) selectScenario(other.id)
    } else {
      setDraftScenario(null)
      setSelectedScenarioId(null)
    }
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

  const stepDriver = selectedStep ? getTargetDriver(selectedStep.target) : "web"
  const isWebOrMobile = stepDriver === "web" || stepDriver === "mobile"

  return (
    <div className="flex h-[calc(100vh-49px)] overflow-hidden bg-editor text-fg select-none">
      {/* ========================================================================= */}
      {/* COLUMN 1: SCENARIOS EXPLORER                                              */}
      {/* ========================================================================= */}
      <section className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search scenarios..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg placeholder-fg-muted focus:outline-none focus:border-border-focus"
            />
          </div>

          <Button
            size="xs"
            variant="secondary"
            className="w-full justify-center"
            onClick={createNewScenario}
            icon={<FilePlus2 className="w-3.5 h-3.5 text-primary" />}
          >
            New Scenario
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredScenarios.map((sc) => {
            const isSelected = selectedScenarioId === sc.id
            return (
              <div
                key={sc.id}
                onClick={() => selectScenario(sc.id)}
                className={`p-2.5 rounded-xs border transition cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-primary/10 border-primary text-fg-bright font-medium"
                    : "bg-sidebar border-transparent hover:bg-hover hover:border-border text-fg"
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs truncate font-medium">{sc.name}</span>
                  <span className="text-xs text-fg-muted font-mono truncate">{sc.id}</span>
                </div>
                <Badge variant="neutral" size="xs">
                  {sc.steps.length} {sc.steps.length === 1 ? "Step" : "Steps"}
                </Badge>
              </div>
            )
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* COLUMN 2: STEPPER SEQUENCE & SCENARIO OVERVIEW                            */}
      {/* ========================================================================= */}
      <section className="w-84 border-r border-border bg-titlebar flex flex-col shrink-0">
        {draftScenario ? (
          <>
            <div className="p-3 border-b border-border bg-sidebar flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-fg-bright truncate">
                  {draftScenario.name}
                </span>
                <span className="text-xs text-fg-muted">
                  {draftScenario.steps.length} sequential milestone steps
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="xs"
                  variant={saveSuccess ? "primary" : "secondary"}
                  onClick={handleSaveScenario}
                  isLoading={isSaving}
                  icon={<Save className="w-3.5 h-3.5" />}
                >
                  {saveSuccess ? "Saved" : "Save"}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setIsPresetModalOpen(true)}
                  title="Insert Step from Preset"
                  icon={<Plus className="w-3.5 h-3.5 text-primary" />}
                >
                  Preset
                </Button>
              </div>
            </div>

            {/* Scenario Global Settings Toggle */}
            <div className="p-2 border-b border-border bg-sidebar/50">
              <button
                type="button"
                onClick={() => setShowScenarioSettings(!showScenarioSettings)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xs flex items-center justify-between text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Settings className="w-3.5 h-3.5 text-fg-muted" />
                  Scenario Settings & Fixtures
                </span>
                <span className="text-xs text-fg-muted font-mono">
                  {showScenarioSettings ? "Hide" : "Edit"}
                </span>
              </button>

              {showScenarioSettings && (
                <div className="mt-2 p-2.5 rounded-xs border border-border bg-sidebar space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-fg-muted font-medium">Scenario Name:</label>
                    <input
                      type="text"
                      value={draftScenario.name}
                      onChange={(e) => {
                        const name = e.target.value
                        updateDraft({
                          ...draftScenario,
                          name,
                          raw: { ...draftScenario.raw, name },
                        })
                      }}
                      className="w-full px-2 py-1 text-xs rounded-xs bg-input border border-border text-fg font-medium focus:border-border-focus focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-fg-muted font-medium">Description:</label>
                    <input
                      type="text"
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
                      className="w-full px-2 py-1 text-xs rounded-xs bg-input border border-border text-fg focus:border-border-focus focus:outline-none"
                    />
                  </div>

                  {/* Setup Fixtures */}
                  <div className="space-y-1.5 pt-1 border-t border-border">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-fg-muted font-medium">Setup Fixtures:</label>
                      {onNavigateToConfig && (
                        <button
                          type="button"
                          onClick={() => onNavigateToConfig("fixtures")}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          Manage <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(config?.fixtures ? Object.keys(config.fixtures) : []).map((fix) => {
                        const isSet = draftScenario.setup?.includes(fix)
                        return (
                          <button
                            key={fix}
                            type="button"
                            onClick={() => {
                              const curr = draftScenario.setup ?? []
                              const next = isSet ? curr.filter((f) => f !== fix) : [...curr, fix]
                              const raw = { ...draftScenario.raw, setup: next }
                              updateDraft({ ...draftScenario, setup: next, raw })
                            }}
                            className={`px-2 py-0.5 text-xs font-mono rounded-xs border transition cursor-pointer flex items-center gap-1 ${
                              isSet
                                ? "bg-primary/20 text-primary border-primary/50 font-semibold"
                                : "bg-input text-fg-muted border-border hover:border-fg-muted"
                            }`}
                          >
                            {isSet && <Check className="w-3 h-3 text-primary" />}
                            {fix}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Scenario Variables */}
                  <div className="space-y-1.5 pt-1 border-t border-border">
                    <label className="text-xs text-fg-muted font-medium">Scenario Variables:</label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {Object.entries(draftScenario.vars ?? {}).map(([key, val]) => (
                        <div key={key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1">
                          <span className="text-xs font-mono text-primary truncate">{key}</span>
                          <span className="text-xs font-mono text-fg-muted truncate">{String(val)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const nextVars = { ...(draftScenario.vars ?? {}) }
                              delete nextVars[key]
                              const raw = { ...draftScenario.raw, vars: nextVars }
                              updateDraft({ ...draftScenario, vars: nextVars, raw })
                            }}
                            className="p-1 text-fg-muted hover:text-error"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-1 pt-1">
                        <input
                          type="text"
                          placeholder="Var name"
                          value={newVarKey}
                          onChange={(e) => setNewVarKey(e.target.value)}
                          className="px-1.5 py-0.5 text-xs rounded-xs bg-input border border-border text-primary font-mono focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={newVarVal}
                          onChange={(e) => setNewVarVal(e.target.value)}
                          className="px-1.5 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:outline-none"
                        />
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => {
                            if (newVarKey.trim()) {
                              const nextVars = {
                                ...(draftScenario.vars ?? {}),
                                [newVarKey.trim()]: newVarVal,
                              }
                              const raw = { ...draftScenario.raw, vars: nextVars }
                              updateDraft({ ...draftScenario, vars: nextVars, raw })
                              setNewVarKey("")
                              setNewVarVal("")
                            }
                          }}
                          disabled={!newVarKey.trim()}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex justify-end">
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={handleDeleteScenario}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Delete Scenario
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Stepper Steps List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {draftScenario.steps.map((st, idx) => {
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
                      <Badge variant={getTargetBadgeVariant(st.target)} size="xs">
                        {capitalize(st.target)}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-fg-muted">
                      <span className="truncate">
                        {actionsCount > 0
                          ? `${actionsCount} action(s): ${actionsSummary}${actionsCount > 3 ? "..." : ""}`
                          : st.url || st.command || "Configured step"}
                      </span>
                      <div
                        className="flex items-center gap-0.5 opacity-60 hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => moveStep(idx, "up")}
                          disabled={idx === 0}
                          className="p-1 text-fg-muted hover:text-fg disabled:opacity-30 cursor-pointer"
                          title="Move step up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(idx, "down")}
                          disabled={idx === draftScenario.steps.length - 1}
                          className="p-1 text-fg-muted hover:text-fg disabled:opacity-30 cursor-pointer"
                          title="Move step down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateStep(idx)}
                          className="p-1 text-fg-muted hover:text-primary cursor-pointer"
                          title="Duplicate step"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStep(idx)}
                          className="p-1 text-fg-muted hover:text-error cursor-pointer"
                          title="Delete step"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add Step Toolbar */}
            <div className="p-2 border-t border-border bg-sidebar flex items-center gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                className="flex-1"
                onClick={() => addStep("web")}
                icon={<Globe className="w-3.5 h-3.5 text-[#4ec9b0]" />}
              >
                + Web
              </Button>
              <Button
                size="xs"
                variant="secondary"
                className="flex-1"
                onClick={() => addStep("mobile")}
                icon={<Smartphone className="w-3.5 h-3.5 text-[#ce9178]" />}
              >
                + Mobile
              </Button>
              <Button
                size="xs"
                variant="secondary"
                className="flex-1"
                onClick={() => addStep("http")}
                icon={<Code className="w-3.5 h-3.5 text-[#9cdcfe]" />}
              >
                + API
              </Button>
              <Button
                size="xs"
                variant="secondary"
                className="flex-1"
                onClick={() => addStep("shell")}
                icon={<Terminal className="w-3.5 h-3.5 text-[#dcdcaa]" />}
              >
                + Shell
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="No Scenario Selected"
            description="Select a scenario from the left column or create a new one."
            icon={<Layers className="w-8 h-8 text-fg-muted" />}
          />
        )}
      </section>

      {/* ========================================================================= */}
      {/* COLUMN 3: STEP INSPECTOR & ACTIONS EDITOR                                 */}
      {/* ========================================================================= */}
      <section className="flex-1 flex flex-col bg-sidebar overflow-hidden">
        {draftScenario && selectedStep ? (
          <>
            {/* Inspector Top Bar */}
            <div className="px-4 py-2.5 border-b border-border bg-titlebar flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs font-mono font-bold text-primary shrink-0">
                  Step #{selectedStepIdx + 1}
                </span>
                <input
                  type="text"
                  value={selectedStep.name}
                  onChange={(e) => updateStep(selectedStepIdx, { name: e.target.value })}
                  placeholder="Step milestone name..."
                  className="px-2 py-1 text-xs font-semibold text-fg-bright bg-input border border-border rounded-xs focus:border-border-focus focus:outline-none flex-1 max-w-md"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    setNewPresetName(selectedStep.name)
                    setNewPresetDesc("")
                    setIsSavePresetModalOpen(true)
                  }}
                  icon={<Copy className="w-3.5 h-3.5 text-primary" />}
                >
                  Save as Preset
                </Button>

                <div className="flex items-center bg-input p-0.5 rounded-xs border border-border">
                  <button
                    type="button"
                    onClick={() => setInspectorMode("designer")}
                    className={`px-2.5 py-1 text-xs rounded-xs font-medium transition cursor-pointer ${
                      inspectorMode === "designer"
                        ? "bg-primary text-white"
                        : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    Actions & Config
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorMode("json")}
                    className={`px-2.5 py-1 text-xs rounded-xs font-medium transition cursor-pointer ${
                      inspectorMode === "json"
                        ? "bg-primary text-white"
                        : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    Raw JSON
                  </button>
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
                        <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
                          Platform Target:
                        </label>
                        <Select
                          size="xs"
                          value={selectedStep.target}
                          onChange={(val) => {
                            const newDriver = getTargetDriver(val)
                            const currentDriver = getTargetDriver(selectedStep.target)
                            if (newDriver !== currentDriver) {
                              if (newDriver === "web") {
                                updateStep(selectedStepIdx, {
                                  target: val,
                                  actions: [{ id: `act_${Date.now()}_1`, action: "navigate", url: "/" }],
                                })
                              } else if (newDriver === "mobile") {
                                updateStep(selectedStepIdx, {
                                  target: val,
                                  actions: [{ id: `act_${Date.now()}_1`, action: "tap", selector: "Button" }],
                                })
                              } else if (newDriver === "http") {
                                updateStep(selectedStepIdx, {
                                  target: val,
                                  method: "GET",
                                  url: "/api/test",
                                  actions: undefined,
                                })
                              } else {
                                updateStep(selectedStepIdx, {
                                  target: val,
                                  command: "echo 'hello'",
                                  actions: undefined,
                                })
                              }
                            } else {
                              updateStep(selectedStepIdx, { target: val })
                            }
                          }}
                          options={availableTargets.map((t) => ({
                            value: t,
                            label: `${capitalize(t)} (${capitalize(getTargetDriver(t))})`,
                          }))}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5 justify-center">
                        <span className="text-xs text-fg-muted">Driver runtime:</span>
                        <span className="text-xs font-mono font-semibold text-fg-bright">
                          {capitalize(stepDriver)} Driver
                        </span>
                      </div>
                    </div>
                  </Panel>

                  {/* ========================================================================= */}
                  {/* COMPOSITE STEP ACTIONS (Web & Mobile)                                    */}
                  {/* ========================================================================= */}
                  {isWebOrMobile && (
                    <Panel variant="sidebar" className="p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                            {stepDriver === "web" ? (
                              <Globe className="w-3.5 h-3.5 text-[#4ec9b0]" />
                            ) : (
                              <Smartphone className="w-3.5 h-3.5 text-[#ce9178]" />
                            )}
                            Step Actions Sequence
                          </label>
                          <span className="text-xs text-fg-muted">
                            Ordered atomic {stepDriver} actions executed sequentially in this step
                          </span>
                        </div>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStepAction(selectedStepIdx)}
                          icon={<Plus className="w-3.5 h-3.5 text-primary" />}
                        >
                          Add Action
                        </Button>
                      </div>

                      {/* Actions List */}
                      <div className="space-y-2.5">
                        {(selectedStep.actions ?? []).map((act, actIdx) => {
                          const actionOptions =
                            stepDriver === "web" ? WEB_ACTION_OPTIONS : MOBILE_ACTION_OPTIONS
                          const isWeb = stepDriver === "web"
                          const actType = act.action ?? (isWeb ? "navigate" : "tap")

                          return (
                            <div
                              key={act.id || actIdx}
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
                                      updateStepAction(selectedStepIdx, actIdx, { action: val })
                                    }}
                                    options={actionOptions}
                                    className="w-56"
                                  />
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => moveStepAction(selectedStepIdx, actIdx, "up")}
                                    disabled={actIdx === 0}
                                    className="p-1 text-fg-muted hover:text-fg disabled:opacity-20 cursor-pointer"
                                    title="Move action up"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveStepAction(selectedStepIdx, actIdx, "down")}
                                    disabled={actIdx === (selectedStep.actions?.length ?? 1) - 1}
                                    className="p-1 text-fg-muted hover:text-fg disabled:opacity-20 cursor-pointer"
                                    title="Move action down"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteStepAction(selectedStepIdx, actIdx)}
                                    className="p-1 text-fg-muted hover:text-error cursor-pointer"
                                    title="Delete action"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Action Inputs */}
                              <div className="space-y-2 pt-1 border-t border-border/60">
                                {/* Web: Navigate */}
                                {isWeb && (actType === "navigate" || actType === "goto") && (
                                  <div className="space-y-1">
                                    <label className="text-xs text-fg-muted font-medium">
                                      URL / Path:
                                    </label>
                                    <input
                                      type="text"
                                      value={act.url ?? act.value ?? ""}
                                      onChange={(e) =>
                                        updateStepAction(selectedStepIdx, actIdx, {
                                          url: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. /login, /checkout, or https://example.com"
                                      className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>
                                )}

                                {/* Web: Click, Hover, Check, Uncheck, Assert Visible */}
                                {isWeb &&
                                  [
                                    "click",
                                    "hover",
                                    "check",
                                    "uncheck",
                                    "assert_visible",
                                  ].includes(actType) && (
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Element Selector:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. button[type='submit'], #login-btn, .nav-item"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  )}

                                {/* Web: Fill / Type */}
                                {isWeb && (actType === "fill" || actType === "type") && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Element Selector:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. #email, input[name='username']"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Input Value:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.value ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            value: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. admin@example.com"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Web: Press Key */}
                                {isWeb && actType === "press" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Key to Press:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.key ?? act.value ?? "Enter"}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            key: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. Enter, Tab, Escape"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Selector (Optional):
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. #search-input (default: page)"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Web: Assert Text */}
                                {isWeb && actType === "assert_text" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Element Selector:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. .status-badge, #message"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Expected Text:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.value ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            value: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. Order Placed Successfully"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Web: Select Dropdown */}
                                {isWeb && actType === "select" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Select Element:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. select#country"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Option Value / Label:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.value ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            value: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. US, admin"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Web & Mobile: Wait / Delay */}
                                {["wait_for", "wait"].includes(actType) && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Wait for Selector (Optional):
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. .spinner or #modal"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Delay (ms):
                                      </label>
                                      <NumberInput
                                        size="xs"
                                        value={act.ms ?? 1000}
                                        onChange={(val) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            ms: val,
                                          })
                                        }
                                        min={100}
                                        step={500}
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Web: Screenshot */}
                                {isWeb && actType === "screenshot" && (
                                  <div className="space-y-1">
                                    <label className="text-xs text-fg-muted font-medium">
                                      Screenshot File Path (Optional):
                                    </label>
                                    <input
                                      type="text"
                                      value={act.value ?? ""}
                                      onChange={(e) =>
                                        updateStepAction(selectedStepIdx, actIdx, {
                                          value: e.target.value,
                                        })
                                      }
                                      placeholder="Leave blank for automatic run artifact capture"
                                      className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>
                                )}

                                {/* Web: JavaScript Expression */}
                                {isWeb && actType === "eval" && (
                                  <div className="space-y-1">
                                    <label className="text-xs text-fg-muted font-medium">
                                      JavaScript Expression:
                                    </label>
                                    <textarea
                                      rows={2}
                                      value={act.value ?? ""}
                                      onChange={(e) =>
                                        updateStepAction(selectedStepIdx, actIdx, {
                                          value: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. document.title, window.scrollTo(0, 500)"
                                      className="w-full p-2 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>
                                )}

                                {/* Mobile: Tap, Assert Visible */}
                                {!isWeb &&
                                  [
                                    "tap",
                                    "click",
                                    "assert_visible",
                                    "assert_not_visible",
                                  ].includes(actType) && (
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Element Text, Label, or ID:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? act.value ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. Sign In, btn_submit, or com.app:id/title"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  )}

                                {/* Mobile: Type Text */}
                                {!isWeb && (actType === "type" || actType === "fill") && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Tap First (Optional Selector):
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. Input Field Selector"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Text to Type:
                                      </label>
                                      <input
                                        type="text"
                                        value={act.value ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            value: e.target.value,
                                          })
                                        }
                                        placeholder="e.g. hello world"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Mobile: Swipe */}
                                {!isWeb && actType === "swipe" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        Swipe Direction:
                                      </label>
                                      <Select
                                        size="xs"
                                        value={act.key ?? "RIGHT"}
                                        onChange={(val) =>
                                          updateStepAction(selectedStepIdx, actIdx, { key: val })
                                        }
                                        options={[
                                          { value: "RIGHT", label: "Swipe Right" },
                                          { value: "LEFT", label: "Swipe Left" },
                                          { value: "UP", label: "Swipe Up" },
                                          { value: "DOWN", label: "Swipe Down" },
                                        ]}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-fg-muted font-medium">
                                        From Element (Optional):
                                      </label>
                                      <input
                                        type="text"
                                        value={act.selector ?? ""}
                                        onChange={(e) =>
                                          updateStepAction(selectedStepIdx, actIdx, {
                                            selector: e.target.value,
                                          })
                                        }
                                        placeholder="Element to start swipe from"
                                        className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Mobile: Press Key */}
                                {!isWeb && actType === "press" && (
                                  <div className="space-y-1">
                                    <label className="text-xs text-fg-muted font-medium">
                                      Key Name:
                                    </label>
                                    <Select
                                      size="xs"
                                      value={act.key ?? "BACK"}
                                      onChange={(val) =>
                                        updateStepAction(selectedStepIdx, actIdx, { key: val })
                                      }
                                      options={[
                                        { value: "BACK", label: "Back Key" },
                                        { value: "ENTER", label: "Enter Key" },
                                        { value: "HOME", label: "Home Key" },
                                        { value: "TAB", label: "Tab Key" },
                                      ]}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Prominent + Add Action Button */}
                      <Button
                        size="xs"
                        variant="secondary"
                        className="w-full justify-center py-2 border-dashed"
                        onClick={() => addStepAction(selectedStepIdx)}
                        icon={<Plus className="w-3.5 h-3.5 text-primary" />}
                      >
                        + Add Action to Step
                      </Button>
                    </Panel>
                  )}

                  {/* ========================================================================= */}
                  {/* HTTP API REQUEST CONFIGURATION                                            */}
                  {/* ========================================================================= */}
                  {stepDriver === "http" && (
                    <Panel variant="sidebar" className="p-3 space-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                          <Code className="w-3.5 h-3.5 text-[#9cdcfe]" />
                          HTTP API Request
                        </label>
                        <span className="text-xs text-fg-muted">
                          REST endpoint request configuration
                        </span>
                      </div>

                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-fg-muted font-medium">Method:</label>
                          <Select
                            size="xs"
                            value={selectedStep.method ?? "GET"}
                            onChange={(val) =>
                              updateStep(selectedStepIdx, { method: val })
                            }
                            options={[
                              { value: "GET", label: "GET" },
                              { value: "POST", label: "POST" },
                              { value: "PUT", label: "PUT" },
                              { value: "PATCH", label: "PATCH" },
                              { value: "DELETE", label: "DELETE" },
                            ]}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-fg-muted font-medium">URL / Endpoint:</label>
                          <input
                            type="text"
                            value={selectedStep.url ?? ""}
                            onChange={(e) => updateStep(selectedStepIdx, { url: e.target.value })}
                            placeholder="e.g. /api/users or https://api.example.com/v1"
                            className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Request Body */}
                      {["POST", "PUT", "PATCH"].includes(selectedStep.method ?? "") && (
                        <div className="space-y-1">
                          <label className="text-xs text-fg-muted font-medium">
                            Request Body (JSON):
                          </label>
                          <textarea
                            rows={4}
                            value={
                              typeof selectedStep.body === "object"
                                ? JSON.stringify(selectedStep.body, null, 2)
                                : String(selectedStep.body ?? "")
                            }
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value)
                                updateStep(selectedStepIdx, { body: parsed })
                              } catch {
                                updateStep(selectedStepIdx, { body: e.target.value })
                              }
                            }}
                            placeholder='{"key": "value"}'
                            className="w-full p-2.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                          />
                        </div>
                      )}
                    </Panel>
                  )}

                  {/* ========================================================================= */}
                  {/* SHELL COMMAND CONFIGURATION                                              */}
                  {/* ========================================================================= */}
                  {stepDriver === "shell" && (
                    <Panel variant="sidebar" className="p-3 space-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-[#dcdcaa]" />
                          Shell Command
                        </label>
                        <span className="text-xs text-fg-muted">
                          Local command executed in project shell
                        </span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted font-medium">Command:</label>
                        <input
                          type="text"
                          value={selectedStep.command ?? ""}
                          onChange={(e) => updateStep(selectedStepIdx, { command: e.target.value })}
                          placeholder="e.g. pnpm run seed, docker compose up -d"
                          className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted font-medium">
                          Working Directory (Optional):
                        </label>
                        <input
                          type="text"
                          value={selectedStep.cwd ?? ""}
                          onChange={(e) => updateStep(selectedStepIdx, { cwd: e.target.value })}
                          placeholder="Default: workspace root"
                          className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                        />
                      </div>
                    </Panel>
                  )}

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
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-fg-muted">Timeout (ms)</span>
                        <NumberInput
                          size="xs"
                          value={selectedStep.timeout_ms ?? 15000}
                          onChange={(val) => updateStep(selectedStepIdx, { timeout_ms: val })}
                          min={500}
                          max={120000}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-fg-muted">Max Retries</span>
                        <NumberInput
                          size="xs"
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
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-fg-muted">Retry Delay (ms)</span>
                        <NumberInput
                          size="xs"
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
                    </div>
                  </Panel>

                  {/* Step Assertions Form */}
                  <Panel variant="sidebar" className="p-3 space-y-3">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold text-fg-bright">
                        Step Assertions
                      </label>
                      <span className="text-xs text-fg-muted">
                        Verification criteria evaluated when step finishes
                      </span>
                    </div>

                    <div className="space-y-2">
                      {stepDriver === "http" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-muted w-36">Expected Status Code:</span>
                          <NumberInput
                            size="xs"
                            value={selectedStep.assert?.status ?? 200}
                            onChange={(val) =>
                              updateStep(selectedStepIdx, {
                                assert: { ...(selectedStep.assert ?? {}), status: val },
                              })
                            }
                            min={100}
                            max={599}
                            className="w-32"
                          />
                        </div>
                      )}

                      {stepDriver === "shell" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-muted w-36">Expected Exit Code:</span>
                          <NumberInput
                            size="xs"
                            value={selectedStep.assert?.exit_code ?? 0}
                            onChange={(val) =>
                              updateStep(selectedStepIdx, {
                                assert: { ...(selectedStep.assert ?? {}), exit_code: val },
                              })
                            }
                            min={0}
                            max={255}
                            className="w-32"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-fg-muted w-36">Output Contains:</span>
                        <input
                          type="text"
                          value={selectedStep.assert?.output_contains ?? ""}
                          onChange={(e) =>
                            updateStep(selectedStepIdx, {
                              assert: {
                                ...(selectedStep.assert ?? {}),
                                output_contains: e.target.value || undefined,
                              },
                            })
                          }
                          placeholder="Optional substring match..."
                          className="flex-1 px-2 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                        />
                      </div>
                    </div>
                  </Panel>
                </div>
              ) : (
                /* RAW JSON VIEW */
                <div className="max-w-4xl mx-auto space-y-2">
                  {jsonError && (
                    <div className="p-2.5 rounded-xs bg-error-bg border border-error-border text-xs text-error font-mono">
                      {jsonError}
                    </div>
                  )}
                  <textarea
                    rows={22}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value)
                      try {
                        const parsed = JSON.parse(e.target.value)
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
                    }}
                    className="w-full p-3 rounded-xs bg-titlebar border border-border text-xs font-mono text-fg focus:border-border-focus focus:outline-none"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            title="Select a Step to Inspect"
            description="Click on any step from the center sequence column to configure its actions, driver options, and assertions."
            icon={<Layers className="w-8 h-8 text-fg-muted" />}
          />
        )}
      </section>

      {/* ========================================================================= */}
      {/* MODAL: INSERT STEP PRESET                                                 */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        title="Insert Reusable Step Preset"
        description="Select a pre-configured step template to insert into your scenario"
        maxWidth="lg"
      >
        <div className="space-y-3">
          {stepPresets.length === 0 ? (
            <div className="p-6 text-center text-xs text-fg-muted space-y-1">
              <p className="font-semibold text-fg-bright">No Step Presets Saved Yet</p>
              <p>Configure a step in any scenario and click "Save as Preset" to build reusable templates.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {stepPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="p-3 rounded-xs border border-border bg-sidebar hover:border-primary/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-fg-bright truncate">
                        {preset.name}
                      </span>
                      <Badge variant={getTargetBadgeVariant(preset.target)} size="xs">
                        {capitalize(preset.target)}
                      </Badge>
                      <Badge variant="neutral" size="xs">
                        {preset.step.actions?.length ?? 1} {(preset.step.actions?.length ?? 1) === 1 ? "Action" : "Actions"}
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
                      onClick={() => handleDeletePreset(preset.id, preset.name)}
                      title="Delete preset"
                      icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: SAVE AS STEP PRESET                                                */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isSavePresetModalOpen}
        onClose={() => {
          setIsSavePresetModalOpen(false)
          setNewPresetName("")
          setNewPresetDesc("")
        }}
        title="Save Current Step as Reusable Preset"
        description="Create a named reusable template from this step for re-use across test scenarios"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                setIsSavePresetModalOpen(false)
                setNewPresetName("")
                setNewPresetDesc("")
              }}
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
          <div className="space-y-1">
            <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
              Preset Name:
            </label>
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g. Admin Web Login, Seed Database"
              className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-medium focus:border-border-focus focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
              Description (Optional):
            </label>
            <input
              type="text"
              value={newPresetDesc}
              onChange={(e) => setNewPresetDesc(e.target.value)}
              placeholder="Brief description of what this step accomplishes"
              className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg focus:border-border-focus focus:outline-none"
            />
          </div>

          <div className="p-2.5 rounded-xs bg-sidebar border border-border text-xs text-fg-muted flex items-center justify-between">
            <span>Target Platform:</span>
            <span className="font-semibold text-fg-bright">
              {capitalize(selectedStep?.target || "None")}
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
    </div>
  )
}
