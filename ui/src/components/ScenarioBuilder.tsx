import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  Code,
  Copy,
  ExternalLink,
  FilePlus2,
  Globe,
  Layers,
  Loader2,
  Plus,
  Search,
  Settings,
  Smartphone,
  Terminal,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { deleteStepPreset, fetchStepPresets, saveStepPreset } from "../api.ts"
import type { ConfigMeta, FlowItem, ScenarioItem, ScenarioStep, StepAction, StepPreset } from "../types.ts"
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { useConfirmDialog } from "./ConfirmModal.tsx"
import { EmptyState } from "./EmptyState.tsx"
import {
  EnvVariablesEditor,
  envRowsToRecord,
  recordToEnvRows,
} from "./EnvVariablesEditor.tsx"
import { Input, Textarea } from "./FormControls.tsx"
import { Modal } from "./Modal.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { Panel } from "./Panel.tsx"
import { Select } from "./Select.tsx"
import { TabButton, useUrlTab } from "./Tabs.tsx"
import { useToast } from "./Toast.tsx"

const WEB_ACTION_OPTIONS = [
  // Navigation & Page Lifecycle
  { value: "navigate", label: "Navigate to URL" },
  { value: "reload", label: "Reload Page" },
  { value: "go_back", label: "Go Back (History)" },
  { value: "go_forward", label: "Go Forward (History)" },
  // Mouse & Element Interaction
  { value: "click", label: "Click Element" },
  { value: "dblclick", label: "Double Click Element" },
  { value: "hover", label: "Hover over Element" },
  { value: "focus", label: "Focus Element" },
  { value: "clear", label: "Clear Input / Textarea" },
  { value: "drag_and_drop", label: "Drag and Drop" },
  { value: "scroll_into_view", label: "Scroll into View" },
  // Keyboard & Forms
  { value: "fill", label: "Fill Text (Replace)" },
  { value: "type", label: "Type Text (Keystrokes)" },
  { value: "press", label: "Press Key (e.g. Enter)" },
  { value: "check", label: "Check Checkbox / Radio" },
  { value: "uncheck", label: "Uncheck Checkbox" },
  { value: "select", label: "Select Dropdown Option" },
  { value: "upload_file", label: "Upload File" },
  // Waiting & Synchronization
  { value: "wait_for", label: "Wait for Element or Timeout" },
  { value: "wait_for_url", label: "Wait for URL" },
  { value: "wait_for_load_state", label: "Wait for Load State" },
  // Assertions
  { value: "assert_visible", label: "Assert Element Visible" },
  { value: "assert_not_visible", label: "Assert Element Not Visible" },
  { value: "assert_text", label: "Assert Element Contains Text" },
  { value: "assert_not_text", label: "Assert Element Does Not Contain Text" },
  { value: "assert_value", label: "Assert Input Value" },
  { value: "assert_checked", label: "Assert Checkbox Checked" },
  { value: "assert_not_checked", label: "Assert Checkbox Unchecked" },
  { value: "assert_disabled", label: "Assert Element Disabled" },
  { value: "assert_enabled", label: "Assert Element Enabled" },
  { value: "assert_url", label: "Assert URL Contains" },
  { value: "assert_title", label: "Assert Page Title Contains" },
  // Viewport & Utilities
  { value: "set_viewport", label: "Set Viewport Size" },
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

const HTTP_ACTION_OPTIONS = [
  { value: "http_get", label: "HTTP GET Request" },
  { value: "http_post", label: "HTTP POST Request" },
  { value: "http_put", label: "HTTP PUT Request" },
  { value: "http_patch", label: "HTTP PATCH Request" },
  { value: "http_delete", label: "HTTP DELETE Request" },
]

const SHELL_ACTION_OPTIONS = [
  { value: "shell", label: "Run Shell Command" },
]

const DRIVER_OPTIONS: Array<{
  id: "web" | "mobile" | "http" | "shell"
  title: string
  subtitle: string
  badgeVariant: BadgeVariant
  badgeLabel: string
  icon: React.ReactNode
  iconBg: string
}> = [
  {
    id: "web",
    title: "Web Browser",
    subtitle: "Automate browser interactions with Playwright (navigate, click, fill, assert)",
    badgeVariant: "driver-web",
    badgeLabel: "Web",
    icon: <Globe className="w-4 h-4 text-token-type" />,
    iconBg: "bg-success-bg/30 border-success-border/50",
  },
  {
    id: "http",
    title: "HTTP / REST API",
    subtitle: "Execute API requests (GET, POST, PUT, DELETE) and validate status & response body",
    badgeVariant: "driver-http",
    badgeLabel: "API",
    icon: <Code className="w-4 h-4 text-token-var" />,
    iconBg: "bg-info-bg/30 border-info-border/50",
  },
  {
    id: "shell",
    title: "Shell Command",
    subtitle: "Run terminal commands and shell scripts, verifying output and exit codes",
    badgeVariant: "driver-shell",
    badgeLabel: "Shell",
    icon: <Terminal className="w-4 h-4 text-token-fn" />,
    iconBg: "bg-warning-bg/30 border-warning-border/50",
  },
  {
    id: "mobile",
    title: "Mobile App",
    subtitle: "Automate Android or iOS mobile applications with Appium touch events",
    badgeVariant: "driver-mobile",
    badgeLabel: "Mobile",
    icon: <Smartphone className="w-4 h-4 text-token-comment" />,
    iconBg: "bg-selection/20 border-selection/40",
  },
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
  const [inspectorMode, setInspectorMode] = useUrlTab<"designer" | "json">(
    "mode",
    "designer",
    ["designer", "json"] as const,
  )
  const [showScenarioSettings, setShowScenarioSettings] = useState(false)

  // Step addition & Presets state
  const [stepPresets, setStepPresets] = useState<StepPreset[]>([])
  const [isAddStepModalOpen, setIsAddStepModalOpen] = useState(false)
  const [addStepModalTab, setAddStepModalTab] = useState<"drivers" | "presets">("drivers")
  const [presetSearch, setPresetSearch] = useState("")
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")
  const [newPresetDesc, setNewPresetDesc] = useState("")

  const filteredStepPresets = useMemo(() => {
    if (!presetSearch.trim()) return stepPresets
    const q = presetSearch.toLowerCase()
    return stepPresets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.target.toLowerCase().includes(q),
    )
  }, [stepPresets, presetSearch])

  // Form states
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const isDirtyRef = useRef(false)
  const isInitialMount = useRef(true)
  const draftScenarioRef = useRef<ScenarioItem | null>(null)
  draftScenarioRef.current = draftScenario

  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast()
  const { confirm, ConfirmDialog } = useConfirmDialog()

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
      cloned.steps = cloned.steps.map((st, i) => {
        if (!st.actions || st.actions.length === 0) {
          const driver = getTargetDriver(st.target)
          let defaultAct: StepAction
          if (driver === "http") {
            const method = (st.method ?? "GET").toLowerCase()
            defaultAct = {
              id: `act_${Date.now()}_${i}`,
              action: `http_${method}`,
              method: st.method ?? "GET",
              url: st.url ?? "/api",
              status: st.assert?.status ?? 200,
            }
          } else if (driver === "shell") {
            defaultAct = {
              id: `act_${Date.now()}_${i}`,
              action: "shell",
              command: st.command ?? "echo 'Step execution'",
              exit_code: st.assert?.exit_code ?? 0,
            }
          } else if (driver === "mobile") {
            defaultAct = {
              id: `act_${Date.now()}_${i}`,
              action: "tap",
              selector: "Button",
            }
          } else {
            defaultAct = {
              id: `act_${Date.now()}_${i}`,
              action: "navigate",
              url: st.url ?? "/",
            }
          }
          return { ...st, actions: [defaultAct] }
        }
        return st
      })
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
    let actType = defaultAction
    if (!actType) {
      if (driver === "http") actType = "http_get"
      else if (driver === "shell") actType = "shell"
      else if (driver === "mobile") actType = "tap"
      else actType = "navigate"
    }

    const newAction: StepAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action: actType,
      url: actType === "navigate" || actType.startsWith("http_") ? "/" : undefined,
      command: actType === "shell" ? "echo 'Step execution'" : undefined,
      selector: actType === "tap" ? "Button" : undefined,
      width: actType === "set_viewport" ? 1280 : undefined,
      height: actType === "set_viewport" ? 720 : undefined,
      ms: actType === "wait_for" || actType === "wait" ? 1000 : undefined,
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
      newStep.actions = [
        {
          id: `act_${Date.now()}_1`,
          action: "http_get",
          url: "/api/status",
          status: 200,
        },
      ]
    } else if (driverType === "shell") {
      newStep.actions = [
        {
          id: `act_${Date.now()}_1`,
          action: "shell",
          command: "echo 'Step execution'",
          exit_code: 0,
        },
      ]
    }

    const newSteps = [...draftScenario.steps, newStep]
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    updateDraft({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(newSteps.length - 1)
    setShowScenarioSettings(false)
    setIsAddStepModalOpen(false)
    setPresetSearch("")
    toastSuccess(`Added ${capitalize(driverType)} step "${newStep.name}"`, "Step Added")
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
    setIsAddStepModalOpen(false)
    setPresetSearch("")
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

  const handleDeletePreset = (id: string, name: string) => {
    confirm({
      title: "Delete Preset",
      message: (
        <span>
          Are you sure you want to delete step preset{" "}
          <strong className="text-fg-bright font-mono">"{name}"</strong>?
        </span>
      ),
      confirmText: "Delete Preset",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteStepPreset(id)
          await loadPresets()
          toastInfo(`Deleted preset "${name}"`, "Preset Removed")
        } catch (err) {
          toastError((err as Error).message, "Failed to Delete Preset")
        }
      },
    })
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

  const getActionOptions = (driver: string) => {
    if (driver === "http") return HTTP_ACTION_OPTIONS
    if (driver === "shell") return SHELL_ACTION_OPTIONS
    if (driver === "mobile") return MOBILE_ACTION_OPTIONS
    return WEB_ACTION_OPTIONS
  }

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
      <section className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <Input
            size="sm"
            icon={<Search className="w-3.5 h-3.5" />}
            placeholder="Search scenarios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <Button
            size="xs"
            variant="secondary"
            className="w-full justify-center"
            onClick={createNewScenario}
            isLoading={isSaving}
            icon={<FilePlus2 className="w-3.5 h-3.5 text-primary" />}
          >
            New Scenario
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredScenarios.length === 0 ? (
            <div className="p-4 text-center text-xs text-fg-subtle">
              {searchQuery ? `No matches for "${searchQuery}"` : "No scenarios yet"}
            </div>
          ) : (
            filteredScenarios.map((sc) => {
              const isSelected = selectedScenarioId === sc.id
              return (
                <div
                  key={sc.id}
                  onClick={() => selectScenario(sc.id)}
                  className={`p-2.5 rounded-xs border transition cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? "bg-primary/10 border-primary text-fg-bright font-medium"
                      : "bg-sidebar border-transparent hover:bg-hover hover:border-border text-fg"
                  }`}
                >
                  <span className="text-xs truncate font-medium leading-tight" title={sc.name}>
                    {sc.name}
                  </span>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-xs text-fg-muted font-mono truncate">{sc.id}</span>
                    <Badge variant="neutral" size="xs">
                      {sc.steps.length} {sc.steps.length === 1 ? "Step" : "Steps"}
                    </Badge>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {draftScenario ? (
        <>
          {/* ========================================================================= */}
          {/* COLUMN 2: STEPPER SEQUENCE & SCENARIO OVERVIEW                            */}
          {/* ========================================================================= */}
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
                onClick={() => {
                  setAddStepModalTab("drivers")
                  setIsAddStepModalOpen(true)
                }}
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
                        onClick={() => {
                          setAddStepModalTab("drivers")
                          setIsAddStepModalOpen(true)
                        }}
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
                      <Badge variant={getTargetBadgeVariant(st.target)} size="xs">
                        {capitalize(st.target)}
                      </Badge>
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

          {/* ========================================================================= */}
          {/* COLUMN 3: STEP INSPECTOR & COMPOSITE ACTIONS                              */}
          {/* ========================================================================= */}
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
                  onClick={() => {
                    setNewPresetName(selectedStep.name)
                    setNewPresetDesc("")
                    setIsSavePresetModalOpen(true)
                  }}
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
                      {(selectedStep.actions ?? []).map((act, actIdx) => {
                        const actionOptions = getActionOptions(stepDriver)
                        const actType = act.action || actionOptions[0]?.value || "navigate"

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
                                  className="w-72"
                                />
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => moveStepAction(selectedStepIdx, actIdx, "up")}
                                  disabled={actIdx === 0}
                                  className="p-1 h-6 w-6 text-fg-muted hover:text-fg disabled:opacity-20"
                                  title="Move action up"
                                  icon={<ArrowUp className="w-3.5 h-3.5" />}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => moveStepAction(selectedStepIdx, actIdx, "down")}
                                  disabled={actIdx === (selectedStep.actions?.length ?? 1) - 1}
                                  className="p-1 h-6 w-6 text-fg-muted hover:text-fg disabled:opacity-20"
                                  title="Move action down"
                                  icon={<ArrowDown className="w-3.5 h-3.5" />}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => deleteStepAction(selectedStepIdx, actIdx)}
                                  className="p-1 h-6 w-6 text-fg-muted hover:text-error"
                                  title="Delete action"
                                  icon={<Trash2 className="w-3.5 h-3.5" />}
                                />
                              </div>
                            </div>

                            {/* Action Inputs based on Type */}
                            <div className="space-y-2 pt-1 border-t border-border/60">
                              {/* HTTP Actions */}
                              {actType.startsWith("http_") && (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-[1fr_130px] gap-2 items-start">
                                    <Input
                                      size="xs"
                                      label="URL / Endpoint"
                                      value={act.url ?? ""}
                                      onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { url: e.target.value })}
                                      placeholder="e.g. /api/users or https://api.example.com"
                                      mono
                                    />
                                    <NumberInput
                                      size="xs"
                                      label="Expected Status"
                                      value={act.status ?? 200}
                                      onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { status: val })}
                                      min={100}
                                      max={599}
                                    />
                                  </div>
                                  {["http_post", "http_put", "http_patch"].includes(actType) && (
                                    <Textarea
                                      size="xs"
                                      label="Request Body (JSON)"
                                      rows={3}
                                      value={typeof act.body === "object" ? JSON.stringify(act.body, null, 2) : String(act.body ?? "")}
                                      onChange={(e) => {
                                        try {
                                          const parsed = JSON.parse(e.target.value)
                                          updateStepAction(selectedStepIdx, actIdx, { body: parsed })
                                        } catch {
                                          updateStepAction(selectedStepIdx, actIdx, { body: e.target.value })
                                        }
                                      }}
                                      placeholder='{"key": "value"}'
                                      mono
                                    />
                                  )}
                                </div>
                              )}

                              {/* Shell Action */}
                              {actType === "shell" && (
                                <div className="space-y-2">
                                  <Input
                                    size="xs"
                                    label="Shell Command"
                                    value={act.command ?? (typeof act.value === "string" ? act.value : "")}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { command: e.target.value })}
                                    placeholder="e.g. pnpm run seed, curl -sf http://localhost:4173/"
                                    mono
                                  />
                                  <div className="grid grid-cols-[1fr_130px] gap-2 items-start">
                                    <Input
                                      size="xs"
                                      label="Working Directory (Optional)"
                                      value={act.cwd ?? ""}
                                      onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { cwd: e.target.value })}
                                      placeholder="Default: workspace root"
                                      mono
                                    />
                                    <NumberInput
                                      size="xs"
                                      label="Expected Exit Code"
                                      value={act.exit_code ?? 0}
                                      onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { exit_code: val })}
                                      min={0}
                                      max={255}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Web: Navigate */}
                              {(actType === "navigate" || actType === "goto") && (
                                <Input
                                  size="xs"
                                  label="URL / Path"
                                  value={act.url ?? (typeof act.value === "string" ? act.value : "")}
                                  onChange={(e) =>
                                    updateStepAction(selectedStepIdx, actIdx, {
                                      url: e.target.value,
                                      value: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. /login, /checkout, or https://example.com"
                                  mono
                                />
                              )}

                              {/* Web: Reload Page */}
                              {stepDriver === "web" && actType === "reload" && (
                                <div className="flex flex-col gap-1 p-2 rounded-xs border border-border/40 bg-input/20">
                                  <span className="text-xs font-medium text-fg">Reload Active Page</span>
                                  <span className="text-xs text-fg-muted">Reloads the current browser page and waits for it to refresh.</span>
                                </div>
                              )}

                              {/* Web: Go Back */}
                              {stepDriver === "web" && actType === "go_back" && (
                                <div className="flex flex-col gap-1 p-2 rounded-xs border border-border/40 bg-input/20">
                                  <span className="text-xs font-medium text-fg">Navigate Back in History</span>
                                  <span className="text-xs text-fg-muted">Navigates the browser back one step in session history.</span>
                                </div>
                              )}

                              {/* Web: Go Forward */}
                              {stepDriver === "web" && actType === "go_forward" && (
                                <div className="flex flex-col gap-1 p-2 rounded-xs border border-border/40 bg-input/20">
                                  <span className="text-xs font-medium text-fg">Navigate Forward in History</span>
                                  <span className="text-xs text-fg-muted">Navigates the browser forward one step in session history.</span>
                                </div>
                              )}

                              {/* Web: Single Element Selector Actions */}
                              {stepDriver === "web" &&
                                [
                                  "click",
                                  "dblclick",
                                  "hover",
                                  "focus",
                                  "clear",
                                  "scroll_into_view",
                                  "check",
                                  "uncheck",
                                  "assert_visible",
                                  "assert_not_visible",
                                  "assert_hidden",
                                  "assert_checked",
                                  "assert_not_checked",
                                  "assert_disabled",
                                  "assert_enabled",
                                ].includes(actType) && (
                                  <Input
                                    size="xs"
                                    label={
                                      actType === "click"
                                        ? "Element Selector"
                                        : actType === "dblclick"
                                          ? "Element Selector to Double Click"
                                          : actType === "hover"
                                            ? "Element Selector to Hover"
                                            : actType === "focus"
                                              ? "Element Selector to Focus"
                                              : actType === "clear"
                                                ? "Input / Textarea Selector to Clear"
                                                : actType === "scroll_into_view"
                                                  ? "Element Selector to Scroll into View"
                                                  : actType === "check"
                                                    ? "Checkbox / Radio Selector to Check"
                                                    : actType === "uncheck"
                                                      ? "Checkbox Selector to Uncheck"
                                                      : actType === "assert_visible"
                                                        ? "Element Selector to Assert Visible"
                                                        : actType === "assert_not_visible" || actType === "assert_hidden"
                                                          ? "Element Selector to Assert Hidden / Not Visible"
                                                          : actType === "assert_checked"
                                                            ? "Checkbox Selector to Assert Checked"
                                                            : actType === "assert_not_checked"
                                                              ? "Checkbox Selector to Assert Unchecked"
                                                              : actType === "assert_disabled"
                                                                ? "Element Selector to Assert Disabled"
                                                                : "Element Selector to Assert Enabled"
                                    }
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder={
                                      actType.includes("check")
                                        ? "e.g. input[type='checkbox']#agree, #remember-me"
                                        : actType === "clear"
                                          ? "e.g. input#username, textarea#comment"
                                          : "e.g. button[type='submit'], #login-btn, .nav-item"
                                    }
                                    mono
                                  />
                                )}

                              {/* Web: Fill / Type */}
                              {stepDriver === "web" && (actType === "fill" || actType === "type") && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="Element Selector"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. #email, input[name='username']"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label={actType === "fill" ? "Input Value (Replace)" : "Text to Type (Keystrokes)"}
                                    value={act.value ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                    placeholder="e.g. admin@example.com"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web: Drag and Drop */}
                              {stepDriver === "web" && actType === "drag_and_drop" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="Source Element Selector"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. #draggable-item, .card"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label="Target Drop Selector"
                                    value={act.target_selector ?? (typeof act.value === "string" ? act.value : "")}
                                    onChange={(e) =>
                                      updateStepAction(selectedStepIdx, actIdx, {
                                        target_selector: e.target.value,
                                        value: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. #dropzone, .target-column"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web: Upload File */}
                              {stepDriver === "web" && (actType === "upload_file" || actType === "set_input_files") && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="File Input Selector"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. input[type='file'], #avatar-upload"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label="File Path on Disk"
                                    value={act.value ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                    placeholder="e.g. ./fixtures/sample.pdf"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web: Press Key */}
                              {stepDriver === "web" && actType === "press" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="Key to Press"
                                    value={act.key ?? (typeof act.value === "string" ? act.value : "Enter")}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { key: e.target.value })}
                                    placeholder="e.g. Enter, Tab, Escape, ArrowDown"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label="Selector (Optional)"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. #search-input (default: page)"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web: Assert Text & Assert Not Text */}
                              {stepDriver === "web" && (actType === "assert_text" || actType === "assert_not_text") && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="Element Selector"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. .status-badge, #message"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label={actType === "assert_text" ? "Expected Text (Contains)" : "Forbidden Text (Must Not Contain)"}
                                    value={act.value ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                    placeholder="e.g. Order Placed Successfully"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web: Assert Input Value */}
                              {stepDriver === "web" && actType === "assert_value" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="Input / Textarea Selector"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. input#username, select#country"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label="Expected Value"
                                    value={act.value ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                    placeholder="e.g. admin"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web: Assert Page URL */}
                              {stepDriver === "web" && actType === "assert_url" && (
                                <Input
                                  size="xs"
                                  label="Expected URL Substring"
                                  value={act.url ?? (typeof act.value === "string" ? act.value : "")}
                                  onChange={(e) =>
                                    updateStepAction(selectedStepIdx, actIdx, {
                                      url: e.target.value,
                                      value: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. /dashboard or https://example.com"
                                  mono
                                />
                              )}

                              {/* Web: Assert Page Title */}
                              {stepDriver === "web" && actType === "assert_title" && (
                                <Input
                                  size="xs"
                                  label="Expected Page Title Substring"
                                  value={act.value ?? ""}
                                  onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                  placeholder="e.g. Dashboard - Acme App"
                                  mono
                                />
                              )}

                              {/* Web: Select Dropdown */}
                              {stepDriver === "web" && (actType === "select" || actType === "select_option") && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    size="xs"
                                    label="Select Element Selector"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. select#country, select[name='role']"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label="Option Value / Label"
                                    value={act.value ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                    placeholder="e.g. US, admin"
                                    mono
                                  />
                                </div>
                              )}

                              {/* Web & Mobile: Wait / Delay */}
                              {["wait_for", "wait"].includes(actType) && (
                                <div className="grid grid-cols-2 gap-2 items-start">
                                  <Input
                                    size="xs"
                                    label="Wait for Selector (Optional)"
                                    value={act.selector ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. .spinner or #modal"
                                    mono
                                  />
                                  <NumberInput
                                    size="xs"
                                    label="Delay (ms)"
                                    value={act.ms ?? 1000}
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { ms: val })}
                                    min={100}
                                    step={500}
                                  />
                                </div>
                              )}

                              {/* Web: Wait for URL */}
                              {stepDriver === "web" && actType === "wait_for_url" && (
                                <div className="grid grid-cols-2 gap-2 items-start">
                                  <Input
                                    size="xs"
                                    label="URL Pattern / Substring"
                                    value={act.url ?? (typeof act.value === "string" ? act.value : "")}
                                    onChange={(e) =>
                                      updateStepAction(selectedStepIdx, actIdx, {
                                        url: e.target.value,
                                        value: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. **/dashboard, /orders/**"
                                    mono
                                  />
                                  <NumberInput
                                    size="xs"
                                    label="Timeout (ms)"
                                    value={act.timeout_ms ?? 15000}
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { timeout_ms: val })}
                                    min={500}
                                    step={1000}
                                  />
                                </div>
                              )}

                              {/* Web: Wait for Load State */}
                              {stepDriver === "web" && actType === "wait_for_load_state" && (
                                <div className="grid grid-cols-2 gap-2 items-start">
                                  <Select
                                    size="xs"
                                    label="Load State Event"
                                    value={typeof act.value === "string" ? act.value : "load"}
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { value: val })}
                                    options={[
                                      { value: "load", label: "load (Full Page Loaded)" },
                                      { value: "domcontentloaded", label: "domcontentloaded (DOM Content Ready)" },
                                      { value: "networkidle", label: "networkidle (No Network Requests for 500ms)" },
                                    ]}
                                  />
                                  <NumberInput
                                    size="xs"
                                    label="Timeout (ms)"
                                    value={act.timeout_ms ?? 15000}
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { timeout_ms: val })}
                                    min={500}
                                    step={1000}
                                  />
                                </div>
                              )}

                              {/* Web: Set Viewport Size */}
                              {stepDriver === "web" && actType === "set_viewport" && (
                                <div className="grid grid-cols-2 gap-2 items-start">
                                  <NumberInput
                                    size="xs"
                                    label="Viewport Width (px)"
                                    value={act.width ?? 1280}
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { width: val })}
                                    min={320}
                                    max={3840}
                                    step={40}
                                  />
                                  <NumberInput
                                    size="xs"
                                    label="Viewport Height (px)"
                                    value={act.height ?? 720}
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { height: val })}
                                    min={240}
                                    max={2160}
                                    step={40}
                                  />
                                </div>
                              )}

                              {/* Web: Screenshot */}
                              {actType === "screenshot" && (
                                <Input
                                  size="xs"
                                  label="Screenshot File Path (Optional)"
                                  value={act.value ?? ""}
                                  onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                  placeholder="Leave blank for automatic run artifact capture"
                                  mono
                                />
                              )}

                              {/* Web: JavaScript Expression */}
                              {actType === "eval" && (
                                <Textarea
                                  size="xs"
                                  label="JavaScript Expression"
                                  rows={2}
                                  value={act.value ?? ""}
                                  onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
                                  placeholder="e.g. document.title, window.scrollTo(0, 500)"
                                  mono
                                />
                              )}

                              {/* Mobile: Tap, Assert Visible */}
                              {stepDriver === "mobile" && ["tap", "click", "assert_visible", "assert_not_visible"].includes(actType) && (
                                <Input
                                  size="xs"
                                  label="Element Text, Label, or ID"
                                  value={act.selector ?? act.value ?? ""}
                                  onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
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
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
                                    placeholder="e.g. Input Field Selector"
                                    mono
                                  />
                                  <Input
                                    size="xs"
                                    label="Text to Type"
                                    value={act.value ?? ""}
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { value: e.target.value })}
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
                                    onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { key: val })}
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
                                    onChange={(e) => updateStepAction(selectedStepIdx, actIdx, { selector: e.target.value })}
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
                                  onChange={(val) => updateStepAction(selectedStepIdx, actIdx, { key: val })}
                                  options={[
                                    { value: "BACK", label: "Back Key" },
                                    { value: "ENTER", label: "Enter Key" },
                                    { value: "HOME", label: "Home Key" },
                                    { value: "TAB", label: "Tab Key" },
                                  ]}
                                />
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
                    rows={22}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value)
                      try {
                        const parsed = JSON.parse(e.target.value)
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
                    }}
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
                    onClick={() => {
                      setAddStepModalTab("drivers")
                      setIsAddStepModalOpen(true)
                    }}
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
    </>
  ) : (
    /* ========================================================================= */
    /* UNIFIED WORKSPACE: NO SCENARIO SELECTED                                   */
    /* ========================================================================= */
    <section className="flex-1 flex flex-col items-center justify-center bg-editor p-8 text-center">
      {scenarios.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<FilePlus2 className="w-7 h-7 text-primary" />}
          title="No Scenarios in Workspace"
          description="Create end-to-end test scenarios to orchestrate automated steps across Web (Playwright), HTTP APIs, Shell commands, and Mobile devices."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button
                size="sm"
                variant="primary"
                onClick={createNewScenario}
                isLoading={isSaving}
                icon={<FilePlus2 className="w-3.5 h-3.5" />}
              >
                Create First Scenario
              </Button>
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <span>Drivers:</span>
                <Badge variant="driver-web" size="xs">
                  Web
                </Badge>
                <Badge variant="driver-http" size="xs">
                  API
                </Badge>
                <Badge variant="driver-shell" size="xs">
                  Shell
                </Badge>
                <Badge variant="driver-mobile" size="xs">
                  Mobile
                </Badge>
              </div>
            </div>
          }
        />
      ) : (
        <EmptyState
          size="lg"
          icon={<Layers className="w-7 h-7 text-fg-muted" />}
          title="No Scenario Selected"
          description="Select a scenario from the sidebar on the left to inspect its sequence and configure steps, or create a new scenario."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={createNewScenario}
              isLoading={isSaving}
              icon={<FilePlus2 className="w-3.5 h-3.5 text-primary" />}
            >
              Create New Scenario
            </Button>
          }
        />
      )}
    </section>
  )}

      {/* ========================================================================= */}
      {/* MODAL: ADD STEP (DRIVERS & PRESETS)                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddStepModalOpen}
        onClose={() => {
          setIsAddStepModalOpen(false)
          setPresetSearch("")
        }}
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
            <div className="h-[284px] space-y-2 overflow-y-auto pr-0.5">
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
            <div className="h-[284px] flex flex-col space-y-3">
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
                            {capitalize(preset.target)}
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

      {/* ========================================================================= */}
      {/* MODAL: SCENARIO SETTINGS & FIXTURES                                        */}
      {/* ========================================================================= */}
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
            </div>

            {/* Scenario Variables */}
            <div className="pt-2 border-t border-border">
              <EnvVariablesEditor
                rows={recordToEnvRows(draftScenario.vars as Record<string, string>)}
                onChange={(newRows) => {
                  const nextVars = envRowsToRecord(newRows) ?? {}
                  const raw = { ...draftScenario.raw, vars: nextVars }
                  updateDraft({ ...draftScenario, vars: nextVars, raw })
                }}
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog />
    </div>
  )
}
