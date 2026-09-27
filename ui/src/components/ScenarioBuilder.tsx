import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCode,
  FilePlus2,
  Layers,
  Play,
  Plus,
  Save,
  Search,
  Smartphone,
  Terminal,
  Trash2,
  Variable,
  X,
  XCircle,
} from "lucide-react"
import { useEffect, useState } from "react"
import { fetchStepRuns } from "../api.ts"
import type { ConfigMeta, FlowItem, ScenarioItem, ScenarioStep, StepRunItem } from "../types.ts"
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { EmptyState } from "./EmptyState.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { Panel } from "./Panel.tsx"
import { Select } from "./Select.tsx"
import { TabButton, useUrlTab } from "./Tabs.tsx"
import { useToast } from "./Toast.tsx"

type ScenarioBuilderProps = {
  scenarios: ScenarioItem[]
  flows: FlowItem[]
  config?: ConfigMeta
  isRunning?: boolean
  onStartRun?: (options: {
    scenarios: string[]
    repeat: number
    start: boolean
    install: boolean
    headless: boolean
    verbose: boolean
  }) => void
  onSaveScenario: (
    id: string,
    content: any,
  ) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>
  onDeleteScenario: (id: string) => Promise<void>
  onSaveFlow: (
    target: string,
    file: string,
    content: string,
  ) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>
  onNavigateToConfig?: (sub?: string) => void
}

export function ScenarioBuilder({
  scenarios,
  flows,
  config,
  isRunning = false,
  onStartRun,
  onSaveScenario,
  onDeleteScenario,
  onSaveFlow,
  onNavigateToConfig,
}: ScenarioBuilderProps) {
  // Explorer selection state
  const [activeItem, setActiveItem] = useState<{ type: "scenario" | "flow"; id: string } | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState("")

  // Scenario editing draft
  const [draftScenario, setDraftScenario] = useState<ScenarioItem | null>(null)
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0)
  const [inspectorView, setInspectorView] = useState<"step" | "context">("step")

  // Step Inspector sub-tabs
  const [stepTab, setStepTab] = useUrlTab<"runs" | "config" | "json">("stepTab", "runs", [
    "runs",
    "config",
    "json",
  ])

  // Context sub-tabs
  const [contextTab, setContextTab] = useState<"fixtures" | "vars" | "json">("fixtures")

  // Step runs telemetry loaded from SQLite
  const [scenarioStepRuns, setScenarioStepRuns] = useState<StepRunItem[]>([])
  const [isLoadingStepRuns, setIsLoadingStepRuns] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  // Raw JSON state
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Flow editing draft
  const [draftFlow, setDraftFlow] = useState<FlowItem | null>(null)
  const [flowText, setFlowText] = useState("")

  // Form drafts & UI states
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [bodyDrafts, setBodyDrafts] = useState<Record<number, string>>({})
  const [newVarKey, setNewVarKey] = useState("")
  const [newVarVal, setNewVarVal] = useState("")

  const { error: toastError, success: toastSuccess } = useToast()

  // Target options from config plus driver defaults
  const configuredTargets = Object.keys(config?.targets ?? {})
  const availableTargets = Array.from(
    new Set([...configuredTargets, "shell", "api", "web", "mobile"]),
  )

  const capitalizeFirst = (str: string) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ""

  const formatTargetLabel = (target: string) => {
    if (target.toLowerCase() === "api") return "Platform: API"
    const capitalized = target
      .split(/[-_]/)
      .map((word) => (word.toLowerCase() === "api" ? "API" : capitalizeFirst(word)))
      .join(" ")
    return `Platform: ${capitalized}`
  }

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

  // Load step runs for current scenario
  const loadScenarioStepRuns = async (scenarioId: string) => {
    setIsLoadingStepRuns(true)
    try {
      const runs = await fetchStepRuns({ scenarioId, limit: 200 })
      setScenarioStepRuns(runs)
    } catch {
      // ignore
    } finally {
      setIsLoadingStepRuns(false)
    }
  }

  // Default selection
  useEffect(() => {
    if (!activeItem && scenarios.length > 0) {
      selectScenario(scenarios[0].id)
    }
  }, [scenarios])

  // Reload step runs when isRunning finishes or when active scenario changes
  useEffect(() => {
    if (draftScenario?.id && !isRunning) {
      loadScenarioStepRuns(draftScenario.id)
    }
  }, [draftScenario?.id, isRunning])

  const selectScenario = (id: string) => {
    const sc = scenarios.find((s) => s.id === id)
    if (!sc) return
    setActiveItem({ type: "scenario", id })
    setDraftScenario(JSON.parse(JSON.stringify(sc)))
    setSelectedStepIdx(0)
    setInspectorView("step")
    setJsonText(JSON.stringify(sc.raw, null, 2))
    setJsonError(null)
    setBodyDrafts({})
    loadScenarioStepRuns(id)
  }

  const selectFlow = (file: string) => {
    const fl = flows.find((f) => f.file === file)
    if (!fl) return
    setActiveItem({ type: "flow", id: file })
    setDraftFlow(JSON.parse(JSON.stringify(fl)))
    setFlowText(fl.content)
  }

  const createNewScenario = () => {
    const newId = `scenario_${Date.now().toString().slice(-4)}`
    const defaultTarget = availableTargets[0] ?? "shell"
    const newSc: ScenarioItem = {
      id: newId,
      file: `${newId}.json`,
      name: "New Scenario",
      description: "Description of test scenario",
      steps: [
        {
          name: "Health Check Step",
          target: defaultTarget,
          method: "GET",
          url: "/health",
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
            name: "Health Check Step",
            target: defaultTarget,
            method: "GET",
            url: "/health",
          },
        ],
      },
    }
    setActiveItem({ type: "scenario", id: newId })
    setDraftScenario(newSc)
    setSelectedStepIdx(0)
    setInspectorView("step")
    setScenarioStepRuns([])
    setJsonText(JSON.stringify(newSc.raw, null, 2))
    setJsonError(null)
  }

  const createNewFlow = () => {
    const mobileTarget =
      configuredTargets.find((t) => config?.targets?.[t].driver === "mobile") ?? "mobile"
    const newFileName = `flow_${Date.now().toString().slice(-4)}.yaml`
    const starterYaml = `# Android Flow YAML\n- launchApp:\n    clearState: false\n- tapOn:\n    text: "Sign In"\n`

    const newFl: FlowItem = {
      target: mobileTarget,
      file: newFileName,
      path: `flows/${newFileName}`,
      content: starterYaml,
      isValid: true,
      errors: [],
    }
    setActiveItem({ type: "flow", id: newFileName })
    setDraftFlow(newFl)
    setFlowText(starterYaml)
  }

  // Update step in draft scenario
  const updateStep = (index: number, patch: Partial<ScenarioStep>) => {
    if (!draftScenario) return
    const newSteps = [...draftScenario.steps]
    newSteps[index] = { ...newSteps[index], ...patch }

    const newRaw = {
      ...draftScenario.raw,
      steps: newSteps,
    }

    setDraftScenario({
      ...draftScenario,
      steps: newSteps,
      raw: newRaw,
    })
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const toggleSetupFixture = (fixtureName: string) => {
    if (!draftScenario) return
    const currentSetup = draftScenario.setup ?? []
    const nextSetup = currentSetup.includes(fixtureName)
      ? currentSetup.filter((f) => f !== fixtureName)
      : [...currentSetup, fixtureName]

    const newRaw = { ...draftScenario.raw }
    if (nextSetup.length > 0) {
      newRaw.setup = nextSetup
    } else {
      delete newRaw.setup
    }

    setDraftScenario({
      ...draftScenario,
      setup: nextSetup,
      raw: newRaw,
    })
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const updateScenarioVar = (key: string, value: string, oldKey?: string) => {
    if (!draftScenario) return
    const nextVars = { ...(draftScenario.vars ?? {}) }
    if (oldKey && oldKey !== key) {
      delete nextVars[oldKey]
    }
    if (key.trim()) {
      let parsedVal: unknown = value
      if (value === "true") parsedVal = true
      else if (value === "false") parsedVal = false
      else if (!Number.isNaN(Number(value)) && value.trim() !== "") parsedVal = Number(value)
      nextVars[key.trim()] = parsedVal
    }
    const newRaw = { ...draftScenario.raw }
    if (Object.keys(nextVars).length > 0) {
      newRaw.vars = nextVars
    } else {
      delete newRaw.vars
    }
    setDraftScenario({
      ...draftScenario,
      vars: nextVars,
      raw: newRaw,
    })
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const deleteScenarioVar = (key: string) => {
    if (!draftScenario) return
    const nextVars = { ...(draftScenario.vars ?? {}) }
    delete nextVars[key]
    const newRaw = { ...draftScenario.raw }
    if (Object.keys(nextVars).length > 0) {
      newRaw.vars = nextVars
    } else {
      delete newRaw.vars
    }
    setDraftScenario({
      ...draftScenario,
      vars: nextVars,
      raw: newRaw,
    })
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const updateStepExtract = (
    stepIdx: number,
    varName: string,
    path: string,
    oldName?: string,
  ) => {
    if (!draftScenario) return
    const currentExtract = { ...(draftScenario.steps[stepIdx].extract ?? {}) }
    if (oldName && oldName !== varName) {
      delete currentExtract[oldName]
    }
    if (varName.trim()) {
      currentExtract[varName.trim()] = path
    }
    const nextExtract = Object.keys(currentExtract).length > 0 ? currentExtract : undefined
    updateStep(stepIdx, { extract: nextExtract })
  }

  const deleteStepExtract = (stepIdx: number, varName: string) => {
    if (!draftScenario) return
    const currentExtract = { ...(draftScenario.steps[stepIdx].extract ?? {}) }
    delete currentExtract[varName]
    const nextExtract = Object.keys(currentExtract).length > 0 ? currentExtract : undefined
    updateStep(stepIdx, { extract: nextExtract })
  }

  const addStepHeader = (stepIdx: number) => {
    if (!draftScenario) return
    const currentHeaders = { ...(draftScenario.steps[stepIdx].headers ?? {}) }
    let newKey = "Header"
    if (!("Content-Type" in currentHeaders)) {
      newKey = "Content-Type"
      currentHeaders[newKey] = "application/json"
    } else if (!("Authorization" in currentHeaders)) {
      newKey = "Authorization"
      currentHeaders[newKey] = "Bearer "
    } else {
      let counter = 1
      while (`Header-${counter}` in currentHeaders) {
        counter++
      }
      newKey = `Header-${counter}`
      currentHeaders[newKey] = ""
    }
    updateStep(stepIdx, { headers: currentHeaders })
  }

  const updateStepHeader = (
    stepIdx: number,
    headerIdx: number,
    newKey: string,
    newVal: string,
  ) => {
    if (!draftScenario) return
    const entries = Object.entries(draftScenario.steps[stepIdx].headers ?? {})
    if (headerIdx >= 0 && headerIdx < entries.length) {
      entries[headerIdx] = [newKey, newVal]
    } else {
      entries.push([newKey, newVal])
    }
    const nextHeaders: Record<string, string> = {}
    for (const [k, v] of entries) {
      nextHeaders[k] = v
    }
    updateStep(stepIdx, {
      headers: Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined,
    })
  }

  const deleteStepHeader = (stepIdx: number, headerIdx: number) => {
    if (!draftScenario) return
    const entries = Object.entries(draftScenario.steps[stepIdx].headers ?? {})
    const nextEntries = entries.filter((_, i) => i !== headerIdx)
    const nextHeaders =
      nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined
    updateStep(stepIdx, { headers: nextHeaders })
  }

  const addStep = (driverType: "http" | "web" | "mobile" | "shell") => {
    if (!draftScenario) return

    let matchingTarget = configuredTargets.find(
      (t) => config?.targets?.[t].driver === driverType,
    )
    if (!matchingTarget) matchingTarget = driverType

    let newStep: ScenarioStep = {
      name: `New ${driverType.toUpperCase()} Step`,
      target: matchingTarget,
    }

    if (driverType === "http") {
      newStep = { ...newStep, method: "GET", url: "/api/test", assert: { status: 200 } }
    } else if (driverType === "shell") {
      newStep = { ...newStep, command: "echo 'hello'", assert: { exit_code: 0 } }
    } else if (driverType === "mobile") {
      newStep = { ...newStep, flow: "login.yaml", launch: "restart" }
    } else if (driverType === "web") {
      newStep = { ...newStep, run: "runLoginFlow" }
    }

    const newSteps = [...draftScenario.steps, newStep]
    const newRaw = { ...draftScenario.raw, steps: newSteps }

    setDraftScenario({
      ...draftScenario,
      steps: newSteps,
      raw: newRaw,
    })
    setSelectedStepIdx(newSteps.length - 1)
    setInspectorView("step")
    setStepTab("config")
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const deleteStep = (index: number) => {
    if (!draftScenario) return
    const newSteps = draftScenario.steps.filter((_, i) => i !== index)
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    setDraftScenario({ ...draftScenario, steps: newSteps, raw: newRaw })
    if (selectedStepIdx >= newSteps.length) {
      setSelectedStepIdx(Math.max(0, newSteps.length - 1))
    }
    setJsonText(JSON.stringify(newRaw, null, 2))
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
    setDraftScenario({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(targetIdx)
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const duplicateStep = (index: number) => {
    if (!draftScenario) return
    const stepToCopy = JSON.parse(JSON.stringify(draftScenario.steps[index]))
    stepToCopy.name = `${stepToCopy.name} (Copy)`
    const newSteps = [...draftScenario.steps]
    newSteps.splice(index + 1, 0, stepToCopy)

    const newRaw = { ...draftScenario.raw, steps: newSteps }
    setDraftScenario({ ...draftScenario, steps: newSteps, raw: newRaw })
    setSelectedStepIdx(index + 1)
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const handleSaveScenario = async () => {
    if (!draftScenario) return
    setIsSaving(true)
    try {
      let content = draftScenario.raw
      if (inspectorView === "context" && contextTab === "json") {
        try {
          content = JSON.parse(jsonText)
        } catch (e) {
          setJsonError((e as Error).message)
          setIsSaving(false)
          return
        }
      } else if (content.steps && Array.isArray(content.steps)) {
        const sanitizedSteps = content.steps.map((st: ScenarioStep) => {
          if (!st.headers) return st
          const cleanHeaders: Record<string, string> = {}
          for (const [k, v] of Object.entries(st.headers)) {
            if (k.trim()) cleanHeaders[k.trim()] = v
          }
          return {
            ...st,
            headers: Object.keys(cleanHeaders).length > 0 ? cleanHeaders : undefined,
          }
        })
        content = { ...content, steps: sanitizedSteps }
      }
      const res = await onSaveScenario(draftScenario.id, content)
      if (res) {
        setDraftScenario((prev) =>
          prev ? { ...prev, isValid: res.isValid, errors: res.errors } : null,
        )
      }
      setSaveSuccess(true)
      toastSuccess(`Scenario "${draftScenario.name}" saved`, "Saved")
      setTimeout(() => setSaveSuccess(false), 2500)
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
      setActiveItem(null)
      setDraftScenario(null)
    }
  }

  const handleSaveFlow = async () => {
    if (!draftFlow) return
    setIsSaving(true)
    try {
      const res = await onSaveFlow(draftFlow.target, draftFlow.file, flowText)
      if (res) {
        setDraftFlow((prev) =>
          prev ? { ...prev, isValid: res.isValid, errors: res.errors } : null,
        )
      }
      setSaveSuccess(true)
      toastSuccess(`Flow "${draftFlow.file}" saved`, "Saved")
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (e) {
      toastError((e as Error).message, "Failed to save flow")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRunScenario = () => {
    if (!draftScenario || !onStartRun || isRunning) return
    onStartRun({
      scenarios: [draftScenario.id],
      repeat: 1,
      start: true,
      install: false,
      headless: false,
      verbose: true,
    })
    toastSuccess(`Executing scenario "${draftScenario.name}"`, "Run Started")
  }

  // Filtered explorer lists
  const filteredScenarios = scenarios.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredFlows = flows.filter(
    (f) =>
      f.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.target.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Step-level runs query helper
  const getRunsForStep = (
    stepRuns: StepRunItem[],
    scenarioId: string,
    step: ScenarioStep,
    stepIdx: number,
  ) => {
    const stepId = step.id || `${scenarioId}:step:${stepIdx + 1}`
    return stepRuns
      .filter(
        (r) =>
          r.stepId === stepId ||
          r.stepId === `${scenarioId}:step:${stepIdx + 1}` ||
          r.id.includes(`:${scenarioId}:${stepIdx}:`),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  const selectedStep =
    draftScenario && draftScenario.steps[selectedStepIdx] !== undefined
      ? draftScenario.steps[selectedStepIdx]
      : null

  const selectedStepRuns =
    draftScenario && selectedStep
      ? getRunsForStep(scenarioStepRuns, draftScenario.id, selectedStep, selectedStepIdx)
      : []

  const latestStepRun = selectedStepRuns[0]

  return (
    <div className="flex h-[calc(100vh-49px)] overflow-hidden bg-editor text-fg select-none">
      {/* ========================================================================= */}
      {/* COLUMN 1: EXPLORER (Scenarios & Mobile Flows)                             */}
      {/* ========================================================================= */}
      <section className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search scenarios & flows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg placeholder-fg-muted focus:outline-none focus:border-border-focus"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              className="flex-1"
              onClick={createNewScenario}
              icon={<FilePlus2 className="w-3.5 h-3.5 text-primary" />}
            >
              New Scenario
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={createNewFlow}
              title="New Mobile Flow"
              icon={<Smartphone className="w-3.5 h-3.5 text-success" />}
            >
              New Flow
            </Button>
          </div>
        </div>

        {/* Explorer Tree List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Scenarios Section */}
          <div>
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-fg-muted flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-primary" />
                Test Scenarios
              </span>
              <span className="font-mono text-xs text-fg-muted">
                {filteredScenarios.length}
              </span>
            </div>
            <div className="mt-1 space-y-1">
              {filteredScenarios.map((sc) => {
                const isSelected = activeItem?.type === "scenario" && activeItem.id === sc.id
                return (
                  <button
                    key={sc.id}
                    onClick={() => selectScenario(sc.id)}
                    className={`w-full text-left p-2 rounded-xs text-xs transition flex flex-col gap-1 cursor-pointer ${
                      isSelected
                        ? "bg-editor text-fg-bright border-l-2 border-primary shadow-xs"
                        : "text-fg hover:bg-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate font-medium text-xs text-fg-bright">
                        {sc.name}
                      </span>
                      {!sc.isValid && (
                        <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <span className="font-mono truncate">{sc.id}.json</span>
                      <span className="opacity-40">&bull;</span>
                      <span className="shrink-0">{sc.steps.length} {sc.steps.length === 1 ? "step" : "steps"}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Flows Section */}
          {flows.length > 0 && (
            <div className="border-t border-border pt-2.5">
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-fg-muted flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-success" />
                  Mobile Workflows
                </span>
                <span className="font-mono text-xs text-fg-muted">
                  {filteredFlows.length}
                </span>
              </div>
              <div className="mt-1 space-y-1">
                {filteredFlows.map((fl) => {
                  const isSelected = activeItem?.type === "flow" && activeItem.id === fl.file
                  return (
                    <button
                      key={fl.file}
                      onClick={() => selectFlow(fl.file)}
                      className={`w-full text-left p-2 rounded-xs text-xs transition flex flex-col gap-1 cursor-pointer ${
                        isSelected
                          ? "bg-editor text-fg-bright border-l-2 border-success shadow-xs"
                          : "text-fg hover:bg-hover"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium text-xs text-fg-bright">
                          {fl.file}
                        </span>
                        {!fl.isValid && (
                          <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-fg-muted font-sans truncate">
                        {formatTargetLabel(fl.target)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FLOW EDITOR VIEW (If a mobile YAML flow is selected)                      */}
      {/* ========================================================================= */}
      {activeItem?.type === "flow" && draftFlow && (
        <section className="flex-1 flex flex-col bg-editor overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-titlebar flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-success" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-fg-bright text-xs">
                  Workflow: {draftFlow.file}
                </span>
                <span className="text-xs text-fg-muted">
                  {formatTargetLabel(draftFlow.target)}
                </span>
              </div>
            </div>

            <Button
              size="xs"
              variant="primary"
              onClick={handleSaveFlow}
              disabled={isSaving}
              isLoading={isSaving}
              icon={saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            >
              {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save Flow"}
            </Button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto">
            <textarea
              rows={24}
              value={flowText}
              onChange={(e) => setFlowText(e.target.value)}
              className="w-full h-full p-3 text-xs rounded-xs bg-sidebar border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
            />
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* CONCEPT A: 3-COLUMN STUDIO VIEW (SCENARIO SELECTED)                       */}
      {/* ========================================================================= */}
      {activeItem?.type === "scenario" && draftScenario && (
        <>
          {/* ===================================================================== */}
          {/* COLUMN 2: STEPS SEQUENCE / STEPPER (Width 352px)                     */}
          {/* ===================================================================== */}
          <section className="w-88 border-r border-border bg-sidebar/50 flex flex-col shrink-0">
            {/* Scenario Header & Action Bar */}
            <div className="p-3 border-b border-border bg-titlebar flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={draftScenario.name}
                      onChange={(e) => {
                        const val = e.target.value
                        setDraftScenario({
                          ...draftScenario,
                          name: val,
                          raw: { ...draftScenario.raw, name: val },
                        })
                        setJsonText(JSON.stringify({ ...draftScenario.raw, name: val }, null, 2))
                      }}
                      className="text-xs font-bold text-fg-bright bg-input border border-border px-2 py-0.5 rounded-xs w-full focus:outline-none focus:border-border-focus"
                      placeholder="Scenario name..."
                    />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-fg-muted font-mono truncate">
                    <span>{draftScenario.id}.json</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={handleRunScenario}
                    disabled={isRunning}
                    isLoading={isRunning}
                    icon={<Play className="w-3.5 h-3.5 text-white fill-white" />}
                    title="Execute this test scenario"
                  >
                    Run
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={handleSaveScenario}
                    disabled={isSaving}
                    isLoading={isSaving}
                    icon={saveSuccess ? <Check className="w-3.5 h-3.5 text-success" /> : <Save className="w-3.5 h-3.5" />}
                    title="Save scenario"
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={handleDeleteScenario}
                    icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                    title="Delete scenario"
                  />
                </div>
              </div>

              {/* Scenario Context (Fixtures & Variables) Selector Card */}
              <button
                type="button"
                onClick={() => setInspectorView("context")}
                className={`w-full p-2 rounded-xs border text-left flex items-center justify-between transition cursor-pointer ${
                  inspectorView === "context"
                    ? "bg-editor border-primary text-fg-bright shadow-xs"
                    : "bg-input/60 border-border text-fg hover:bg-hover"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold">Scenario Context</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="neutral" size="xs">
                    {`${draftScenario.setup?.length ?? 0} Fixtures`}
                  </Badge>
                  <Badge variant="neutral" size="xs">
                    {`${Object.keys(draftScenario.vars ?? {}).length} Vars`}
                  </Badge>
                </div>
              </button>

              {/* Steps Sequence Header & Add Buttons */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-fg-bright">
                      Test Steps
                    </span>
                    <Badge variant="neutral" size="xs">
                      {draftScenario.steps.length}
                    </Badge>
                  </div>
                  <span className="text-xs text-fg-muted font-medium">Add step:</span>
                </div>

                <div className="grid grid-cols-4 gap-1">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => addStep("http")}
                    title="Add Web API (HTTP) Step"
                    className="text-[#9cdcfe] justify-center"
                    icon={<Plus className="w-3 h-3 text-[#9cdcfe]" />}
                  >
                    API
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => addStep("web")}
                    title="Add Browser Automation Step"
                    className="text-[#4ec9b0] justify-center"
                    icon={<Plus className="w-3 h-3 text-[#4ec9b0]" />}
                  >
                    Web
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => addStep("shell")}
                    title="Add Command Line Step"
                    className="text-[#dcdcaa] justify-center"
                    icon={<Plus className="w-3 h-3 text-[#dcdcaa]" />}
                  >
                    Shell
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => addStep("mobile")}
                    title="Add Mobile Step"
                    className="text-[#89d185] justify-center"
                    icon={<Plus className="w-3 h-3 text-[#89d185]" />}
                  >
                    App
                  </Button>
                </div>
              </div>
            </div>

            {/* Steps Stepper List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {draftScenario.steps.length === 0 ? (
                <div className="p-4 text-center text-xs text-fg-muted">
                  No steps defined. Click "+ API", "+ Web", or "+ Shell" above to add your first step.
                </div>
              ) : (
                draftScenario.steps.map((st, idx) => {
                  const isSelected = inspectorView === "step" && selectedStepIdx === idx
                  const runs = getRunsForStep(scenarioStepRuns, draftScenario.id, st, idx)
                  const latestRun = runs[0]

                  let stepSummary = ""
                  const driver = getTargetDriver(st.target)
                  if (driver === "http") stepSummary = `${st.method ?? "GET"} ${st.url ?? ""}`
                  else if (driver === "shell") stepSummary = st.command ?? ""
                  else if (driver === "web") stepSummary = st.run ?? ""
                  else if (driver === "mobile") stepSummary = st.flow ?? st.launch ?? ""

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedStepIdx(idx)
                        setInspectorView("step")
                      }}
                      className={`p-2 rounded-xs border transition cursor-pointer flex flex-col gap-1.5 ${
                        isSelected
                          ? "bg-editor border-2 border-primary shadow-xs"
                          : "bg-editor/50 border-border text-fg hover:bg-hover"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-xs flex items-center justify-center font-mono text-xs font-semibold shrink-0 ${
                              isSelected
                                ? "bg-primary text-white"
                                : "bg-input text-fg-muted border border-border"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-fg-bright truncate">
                            {st.name}
                          </span>
                        </div>

                        {/* Recent Execution Badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {latestRun ? (
                            <Badge
                              size="xs"
                              variant={
                                latestRun.status === "PASSED"
                                  ? "success"
                                  : latestRun.status === "FAILED"
                                    ? "danger"
                                    : latestRun.status === "RUNNING"
                                      ? "info"
                                      : "neutral"
                              }
                            >
                              {latestRun.status === "PASSED"
                                ? "Passed"
                                : latestRun.status === "FAILED"
                                  ? "Failed"
                                  : latestRun.status === "RUNNING"
                                    ? "Running"
                                    : "Idle"}
                            </Badge>
                          ) : (
                            <Badge size="xs" variant={getTargetBadgeVariant(st.target)}>
                              {capitalizeFirst(driver)}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Subtitle / Driver details & execution stats */}
                      <div className="flex items-center justify-between text-xs text-fg-muted pl-7">
                        <span className="font-mono truncate max-w-[170px]" title={stepSummary}>
                          {stepSummary || formatTargetLabel(st.target)}
                        </span>
                        {latestRun?.durationMs !== undefined && (
                          <span className="font-mono text-xs text-fg-muted shrink-0">
                            {latestRun.durationMs}ms
                          </span>
                        )}
                      </div>

                      {/* Controls on hover / active */}
                      {isSelected && (
                        <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/50">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              moveStep(idx, "up")
                            }}
                            disabled={idx === 0}
                            title="Move Up"
                            icon={<ArrowUp className="w-3.5 h-3.5" />}
                          />
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              moveStep(idx, "down")
                            }}
                            disabled={idx === draftScenario.steps.length - 1}
                            title="Move Down"
                            icon={<ArrowDown className="w-3.5 h-3.5" />}
                          />
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              duplicateStep(idx)
                            }}
                            title="Duplicate Step"
                            icon={<Copy className="w-3.5 h-3.5" />}
                          />
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteStep(idx)
                            }}
                            title="Delete Step"
                            icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* COLUMN 3: STEP INSPECTOR & TELEMETRY STUDIO (Flex-1)                  */}
          {/* ===================================================================== */}
          <section className="flex-1 flex flex-col bg-editor overflow-hidden">
            {inspectorView === "step" && selectedStep ? (
              <>
                {/* Step Inspector Header */}
                <div className="p-3 border-b border-border bg-titlebar flex items-center justify-between shrink-0 gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="px-2 py-0.5 rounded-xs bg-primary/20 text-primary border border-primary/40 font-mono text-xs font-semibold shrink-0">
                      Step {selectedStepIdx + 1} of {draftScenario.steps.length}
                    </span>
                    <div className="flex-1 max-w-md min-w-0">
                      <input
                        type="text"
                        value={selectedStep.name}
                        onChange={(e) => updateStep(selectedStepIdx, { name: e.target.value })}
                        className="w-full text-xs font-bold text-fg-bright bg-input border border-border px-2.5 py-1 rounded-xs focus:border-border-focus focus:outline-none"
                        placeholder="Step name..."
                      />
                    </div>
                    <Select
                      size="xs"
                      value={selectedStep.target}
                      onChange={(val) => updateStep(selectedStepIdx, { target: val })}
                      options={availableTargets.map((t) => ({
                        value: t,
                        label: formatTargetLabel(t),
                      }))}
                      className="w-40 shrink-0"
                    />
                    <Badge size="xs" variant={getTargetBadgeVariant(selectedStep.target)}>
                      {capitalizeFirst(getTargetDriver(selectedStep.target))}
                    </Badge>
                  </div>

                  {/* Sub-resource Navigation Tabs */}
                  <div className="flex items-center bg-sidebar p-0.5 rounded-xs border border-border shrink-0">
                    <TabButton
                      variant="pills"
                      active={stepTab === "runs"}
                      onClick={() => setStepTab("runs")}
                      icon={<Clock className="w-3.5 h-3.5" />}
                    >
                      Step Runs ({selectedStepRuns.length})
                    </TabButton>
                    <TabButton
                      variant="pills"
                      active={stepTab === "config"}
                      onClick={() => setStepTab("config")}
                      icon={<Layers className="w-3.5 h-3.5" />}
                    >
                      Configuration
                    </TabButton>
                    <TabButton
                      variant="pills"
                      active={stepTab === "json"}
                      onClick={() => setStepTab("json")}
                      icon={<Code2 className="w-3.5 h-3.5" />}
                    >
                      Raw JSON
                    </TabButton>
                  </div>
                </div>

                {/* Step Details Content Body */}
                <div className="flex-1 overflow-y-auto p-4 select-text">
                  {/* TAB 1: STEP RUNS & TELEMETRY */}
                  {stepTab === "runs" && (
                    <div className="max-w-4xl mx-auto space-y-4">
                      {/* Status Summary Banner */}
                      {latestStepRun ? (
                        <div
                          className={`p-3 rounded-xs border flex items-center justify-between ${
                            latestStepRun.status === "PASSED"
                              ? "bg-success-bg/40 border-success-border text-fg-bright"
                              : latestStepRun.status === "FAILED"
                                ? "bg-error-bg/40 border-error-border text-fg-bright"
                                : "bg-sidebar border-border text-fg-bright"
                          }`}
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold flex items-center gap-1.5">
                              {latestStepRun.status === "PASSED" ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-success" />
                                  Latest Step Execution Passed ({latestStepRun.durationMs}ms)
                                </>
                              ) : latestStepRun.status === "FAILED" ? (
                                <>
                                  <XCircle className="w-4 h-4 text-error" />
                                  Latest Execution Failed (Attempt {latestStepRun.attempt})
                                </>
                              ) : (
                                <>
                                  <Activity className="w-4 h-4 text-info animate-spin" />
                                  Step Execution In Progress
                                </>
                              )}
                            </span>
                            <span className="text-xs text-fg-muted">
                              {latestStepRun.errorMessage
                                ? latestStepRun.errorMessage
                                : latestStepRun.statusCode
                                  ? `Response Code: ${latestStepRun.statusCode}`
                                  : `Recorded under run ${latestStepRun.runId}`}
                            </span>
                          </div>

                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={handleRunScenario}
                            disabled={isRunning}
                            isLoading={isRunning}
                            icon={<Play className="w-3.5 h-3.5 text-primary" />}
                          >
                            Run Scenario
                          </Button>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xs border border-border bg-sidebar flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-fg-bright">
                              No Runs Recorded Yet
                            </span>
                            <span className="text-xs text-fg-muted">
                              Execute the scenario to collect step-level attempts, duration, and telemetry.
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={handleRunScenario}
                            disabled={isRunning}
                            isLoading={isRunning}
                            icon={<Play className="w-3.5 h-3.5" />}
                          >
                            Run Scenario
                          </Button>
                        </div>
                      )}

                      {/* Step Runs Table */}
                      {selectedStepRuns.length > 0 ? (
                        <div className="border border-border rounded-xs overflow-hidden bg-sidebar">
                          <div className="px-3 py-2 border-b border-border bg-titlebar flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-semibold text-fg-bright">
                                Execution History
                              </span>
                              <span className="text-xs text-fg-muted">
                                Attempts and outcomes recorded in SQLite
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isLoadingStepRuns && <Activity className="w-3.5 h-3.5 text-info animate-spin" />}
                              <span className="text-xs text-fg-muted">
                                {selectedStepRuns.length} {selectedStepRuns.length === 1 ? "run" : "runs"}
                              </span>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-input/60 text-fg-muted border-b border-border text-xs uppercase font-semibold">
                                <tr>
                                  <th className="p-2.5">Run & Timestamp</th>
                                  <th className="p-2.5">Attempt</th>
                                  <th className="p-2.5">Status</th>
                                  <th className="p-2.5">Duration</th>
                                  <th className="p-2.5">Code / Result</th>
                                  <th className="p-2.5 text-right">Details</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {selectedStepRuns.map((r) => {
                                  const dateStr = new Date(r.createdAt).toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })
                                  const isExpanded = expandedRunId === r.id
                                  return (
                                    <tr
                                      key={r.id}
                                      className={`hover:bg-hover/60 transition ${
                                        r.status === "FAILED" ? "bg-error-bg/10" : ""
                                      }`}
                                    >
                                      <td className="p-2.5 font-mono text-fg-bright">
                                        <span className="block truncate max-w-[160px] font-semibold">
                                          {r.runId}
                                        </span>
                                        <span className="block text-xs text-fg-muted font-sans">
                                          {dateStr}
                                        </span>
                                      </td>
                                      <td className="p-2.5 font-mono">
                                        Attempt {r.attempt}
                                        {r.iteration > 1 ? ` (Iter ${r.iteration})` : ""}
                                      </td>
                                      <td className="p-2.5">
                                        <Badge
                                          size="xs"
                                          variant={
                                            r.status === "PASSED"
                                              ? "success"
                                              : r.status === "FAILED"
                                                ? "danger"
                                                : r.status === "RUNNING"
                                                  ? "info"
                                                  : "neutral"
                                          }
                                        >
                                          {r.status === "PASSED"
                                            ? "Passed"
                                            : r.status === "FAILED"
                                              ? "Failed"
                                              : r.status === "RUNNING"
                                                ? "Running"
                                                : "Cancelled"}
                                        </Badge>
                                      </td>
                                      <td className="p-2.5 font-mono">
                                        {r.durationMs !== undefined ? `${r.durationMs}ms` : "-"}
                                      </td>
                                      <td className="p-2.5 font-mono">
                                        {r.statusCode !== undefined ? (
                                          <span
                                            className={
                                              r.statusCode >= 200 && r.statusCode < 300
                                                ? "text-success font-semibold"
                                                : "text-error font-semibold"
                                            }
                                          >
                                            Code {r.statusCode}
                                          </span>
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                      <td className="p-2.5 text-right">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                                          className="text-xs text-primary hover:underline cursor-pointer font-medium"
                                        >
                                          {isExpanded ? "Hide" : "Inspect"}
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <EmptyState
                          title="No Historical Runs For This Step"
                          description="Run the scenario using the 'Run' button above to generate telemetry for this step."
                          icon={<Clock className="w-8 h-8 text-fg-muted" />}
                        />
                      )}

                      {/* Expanded Run Detail Inspector */}
                      {expandedRunId && (
                        (() => {
                          const targetRun = selectedStepRuns.find((r) => r.id === expandedRunId)
                          if (!targetRun) return null
                          return (
                            <Panel variant="sidebar" className="p-3 space-y-2 border-border-focus">
                              <div className="flex items-center justify-between pb-2 border-b border-border">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-semibold text-fg-bright">
                                    Execution Trace: {targetRun.id}
                                  </span>
                                  <span className="text-xs text-fg-muted">
                                    Attempt {targetRun.attempt} &bull; Status: {targetRun.status}
                                  </span>
                                </div>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => setExpandedRunId(null)}
                                  icon={<X className="w-3.5 h-3.5" />}
                                />
                              </div>

                              {targetRun.errorMessage && (
                                <div className="space-y-1">
                                  <span className="text-xs font-semibold text-error">
                                    Error Message / Trace:
                                  </span>
                                  <pre className="p-2.5 rounded-xs bg-editor border border-error-border text-error font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                    {targetRun.errorMessage}
                                  </pre>
                                </div>
                              )}

                              {Boolean(targetRun.resultData) && (
                                <div className="space-y-1">
                                  <span className="text-xs font-semibold text-fg-bright">
                                    Result Data / Response:
                                  </span>
                                  <pre className="p-2.5 rounded-xs bg-editor border border-border text-fg font-mono text-xs overflow-x-auto">
                                    {typeof targetRun.resultData === "string"
                                      ? targetRun.resultData
                                      : JSON.stringify(targetRun.resultData, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </Panel>
                          )
                        })()
                      )}
                    </div>
                  )}

                  {/* TAB 2: STEP CONFIGURATION */}
                  {stepTab === "config" && (
                    <div className="max-w-4xl mx-auto space-y-4">
                      {/* Driver Configuration Fields */}
                      {(() => {
                        const stepDriver = getTargetDriver(selectedStep.target)
                        return (
                          <div className="space-y-3">
                            {/* HTTP Driver Form */}
                            {stepDriver === "http" && (
                              <Panel variant="sidebar" className="p-3 space-y-3">
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-xs font-semibold text-fg-bright">
                                    Web API Endpoint (HTTP)
                                  </label>
                                  <span className="text-xs text-fg-muted">
                                    Request method and destination path
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
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
                                    className="w-28 font-bold text-info"
                                  />
                                  <input
                                    type="text"
                                    placeholder="URL Address / Path e.g. /v1/users"
                                    value={selectedStep.url ?? ""}
                                    onChange={(e) =>
                                      updateStep(selectedStepIdx, { url: e.target.value })
                                    }
                                    className="flex-1 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                  />
                                </div>

                                {["POST", "PUT", "PATCH"].includes(selectedStep.method ?? "") && (
                                  <div className="space-y-1 pt-1 border-t border-border/50">
                                    <label className="text-xs text-fg-muted font-medium uppercase tracking-wider">
                                      Request Payload (JSON):
                                    </label>
                                    <textarea
                                      rows={3}
                                      value={
                                        bodyDrafts[selectedStepIdx] !== undefined
                                          ? bodyDrafts[selectedStepIdx]
                                          : selectedStep.body !== undefined
                                            ? typeof selectedStep.body === "string"
                                              ? selectedStep.body
                                              : JSON.stringify(selectedStep.body, null, 2)
                                            : ""
                                      }
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setBodyDrafts((prev) => ({ ...prev, [selectedStepIdx]: val }))
                                        try {
                                          const parsed = JSON.parse(val)
                                          updateStep(selectedStepIdx, { body: parsed })
                                        } catch {
                                          if (!val.trim()) {
                                            updateStep(selectedStepIdx, { body: undefined })
                                          }
                                        }
                                      }}
                                      placeholder='{"amount": 100}'
                                      className="w-full p-2 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>
                                )}

                                {/* HTTP Request Headers */}
                                <div className="pt-2 border-t border-border/50 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs text-fg-muted font-semibold uppercase tracking-wider">
                                      Request Headers ({Object.keys(selectedStep.headers ?? {}).length})
                                    </label>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => addStepHeader(selectedStepIdx)}
                                      icon={<Plus className="w-3.5 h-3.5" />}
                                    >
                                      Add Header
                                    </Button>
                                  </div>
                                  {selectedStep.headers && Object.keys(selectedStep.headers).length > 0 && (
                                    <div className="space-y-1.5">
                                      {Object.entries(selectedStep.headers).map(([hKey, hVal], hIdx) => (
                                        <div key={hIdx} className="flex items-center gap-1.5">
                                          <input
                                            type="text"
                                            value={hKey}
                                            onChange={(e) =>
                                              updateStepHeader(selectedStepIdx, hIdx, e.target.value, hVal)
                                            }
                                            placeholder="Header name"
                                            className="w-40 px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                          />
                                          <span className="text-fg-muted font-mono">:</span>
                                          <input
                                            type="text"
                                            value={hVal}
                                            onChange={(e) =>
                                              updateStepHeader(selectedStepIdx, hIdx, hKey, e.target.value)
                                            }
                                            placeholder="Header value"
                                            className="flex-1 px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                          />
                                          <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => deleteStepHeader(selectedStepIdx, hIdx)}
                                            icon={<X className="w-3.5 h-3.5 text-error" />}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Response Value Extraction */}
                                <div className="pt-2 border-t border-border/50 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs text-fg-muted font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                      <Variable className="w-3.5 h-3.5 text-secondary" />
                                      Extract Variables ({Object.keys(selectedStep.extract ?? {}).length})
                                    </label>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => {
                                        const baseName = `var_${Object.keys(selectedStep.extract ?? {}).length + 1}`
                                        updateStepExtract(selectedStepIdx, baseName, "data[0].id")
                                      }}
                                      icon={<Plus className="w-3.5 h-3.5" />}
                                    >
                                      Add Extraction
                                    </Button>
                                  </div>
                                  {selectedStep.extract && Object.keys(selectedStep.extract).length > 0 && (
                                    <div className="space-y-1.5">
                                      {Object.entries(selectedStep.extract).map(([varName, jsonPath]) => (
                                        <div key={varName} className="grid grid-cols-[1fr_auto_1.4fr_auto] items-center gap-2">
                                          <input
                                            type="text"
                                            value={varName}
                                            onChange={(e) =>
                                              updateStepExtract(selectedStepIdx, e.target.value, jsonPath, varName)
                                            }
                                            className="px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-secondary font-mono focus:border-border-focus focus:outline-none"
                                          />
                                          <span className="text-fg-muted font-mono">&larr;</span>
                                          <input
                                            type="text"
                                            value={jsonPath}
                                            onChange={(e) =>
                                              updateStepExtract(selectedStepIdx, varName, e.target.value)
                                            }
                                            className="px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                          />
                                          <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => deleteStepExtract(selectedStepIdx, varName)}
                                            icon={<X className="w-3.5 h-3.5 text-error" />}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </Panel>
                            )}

                            {/* Shell Driver Form */}
                            {stepDriver === "shell" && (
                              <Panel variant="sidebar" className="p-3 space-y-3">
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                                    <Terminal className="w-3.5 h-3.5 text-warning" />
                                    Command Line Execution (Shell)
                                  </label>
                                  <span className="text-xs text-fg-muted">
                                    Terminal command executed on test host
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
                                    Command:
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedStep.command ?? ""}
                                    onChange={(e) =>
                                      updateStep(selectedStepIdx, { command: e.target.value })
                                    }
                                    placeholder="e.g. ./scripts/seed.sh --clean"
                                    className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-warning font-mono focus:border-border-focus focus:outline-none"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
                                    Working Directory (CWD):
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedStep.cwd ?? ""}
                                    onChange={(e) =>
                                      updateStep(selectedStepIdx, { cwd: e.target.value })
                                    }
                                    placeholder="Relative directory (optional)"
                                    className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                  />
                                </div>
                              </Panel>
                            )}

                            {/* Mobile Driver Form */}
                            {stepDriver === "mobile" && (
                              <Panel variant="sidebar" className="p-3 space-y-3">
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                                    <Smartphone className="w-3.5 h-3.5 text-success" />
                                    Mobile App Automation
                                  </label>
                                  <span className="text-xs text-fg-muted">
                                    Workflow YAML or application state launch
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
                                      Flow File:
                                    </label>
                                    <input
                                      type="text"
                                      value={selectedStep.flow ?? ""}
                                      onChange={(e) =>
                                        updateStep(selectedStepIdx, { flow: e.target.value })
                                      }
                                      placeholder="e.g. login.yaml"
                                      className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
                                      Launch Behavior:
                                    </label>
                                    <Select
                                      size="xs"
                                      value={selectedStep.launch ?? "restart"}
                                      onChange={(val) =>
                                        updateStep(selectedStepIdx, { launch: val as "fresh" | "restart" })
                                      }
                                      options={[
                                        { value: "restart", label: "Restart Clean" },
                                        { value: "fresh", label: "Fresh Clean" },
                                      ]}
                                    />
                                  </div>
                                </div>
                              </Panel>
                            )}

                            {/* Web Browser Driver Form */}
                            {stepDriver === "web" && (
                              <Panel variant="sidebar" className="p-3 space-y-3">
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-xs font-semibold text-fg-bright">
                                    Web Browser Action
                                  </label>
                                  <span className="text-xs text-fg-muted">
                                    Playwright browser execution step
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-xs text-fg-muted uppercase tracking-wider font-medium">
                                    Flow / Function Name:
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedStep.run ?? ""}
                                    onChange={(e) =>
                                      updateStep(selectedStepIdx, { run: e.target.value })
                                    }
                                    placeholder="e.g. runCheckoutFlow"
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
                                    value={selectedStep.timeout_ms ?? 5000}
                                    onChange={(val) =>
                                      updateStep(selectedStepIdx, { timeout_ms: val })
                                    }
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
                                          assert: {
                                            ...(selectedStep.assert ?? {}),
                                            status: val,
                                          },
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
                                          assert: {
                                            ...(selectedStep.assert ?? {}),
                                            exit_code: val,
                                          },
                                        })
                                      }
                                      min={0}
                                      max={255}
                                      className="w-32"
                                    />
                                  </div>
                                )}
                              </div>
                            </Panel>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* TAB 3: STEP RAW JSON */}
                  {stepTab === "json" && (
                    <div className="max-w-4xl mx-auto space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                          Step JSON Payload
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(selectedStep, null, 2))
                            toastSuccess("Step JSON copied", "Copied")
                          }}
                          icon={<Copy className="w-3.5 h-3.5" />}
                        >
                          Copy
                        </Button>
                      </div>
                      <pre className="p-3 rounded-xs border border-border bg-sidebar font-mono text-xs text-fg overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selectedStep, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            ) : inspectorView === "context" ? (
              /* ================================================================= */
              /* SCENARIO CONTEXT (Fixtures, Variables, Full JSON)                 */
              /* ================================================================= */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border bg-titlebar flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-primary" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-fg-bright">
                        Scenario Setup & Context
                      </span>
                      <span className="text-xs text-fg-muted">
                        Fixtures and scenario variables applied across all steps
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center bg-sidebar p-0.5 rounded-xs border border-border">
                    <TabButton
                      variant="pills"
                      active={contextTab === "fixtures"}
                      onClick={() => setContextTab("fixtures")}
                    >
                      Setup Fixtures ({draftScenario.setup?.length ?? 0})
                    </TabButton>
                    <TabButton
                      variant="pills"
                      active={contextTab === "vars"}
                      onClick={() => setContextTab("vars")}
                    >
                      Variables ({Object.keys(draftScenario.vars ?? {}).length})
                    </TabButton>
                    <TabButton
                      variant="pills"
                      active={contextTab === "json"}
                      onClick={() => setContextTab("json")}
                    >
                      Scenario JSON
                    </TabButton>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 select-text">
                  <div className="max-w-4xl mx-auto space-y-4">
                    {/* Setup Fixtures */}
                    {contextTab === "fixtures" && (
                      <Panel variant="sidebar" className="p-3 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-xs font-semibold text-fg-bright">
                              Setup Fixtures
                            </label>
                            <span className="text-xs text-fg-muted">
                              Fixtures execute sequentially before Step 1 starts
                            </span>
                          </div>
                          {onNavigateToConfig && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => onNavigateToConfig("fixtures")}
                              icon={<ExternalLink className="w-3.5 h-3.5" />}
                            >
                              Manage Fixtures
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {(config?.fixtures ?? []).map((fix) => {
                            const isSelected = draftScenario.setup?.includes(fix)
                            return (
                              <button
                                key={fix}
                                type="button"
                                onClick={() => toggleSetupFixture(fix)}
                                className={`px-2.5 py-1 text-xs font-mono rounded-xs border transition flex items-center gap-1.5 cursor-pointer ${
                                  isSelected
                                    ? "bg-primary/20 text-primary border-primary/50 font-semibold"
                                    : "bg-input text-fg-muted border-border hover:border-fg-muted/40"
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                                {fix}
                              </button>
                            )
                          })}
                        </div>
                      </Panel>
                    )}

                    {/* Scenario Variables */}
                    {contextTab === "vars" && (
                      <Panel variant="sidebar" className="p-3 space-y-3">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs font-semibold text-fg-bright">
                            Scenario Variables
                          </label>
                          <span className="text-xs text-fg-muted">
                            Values available throughout steps in this scenario
                          </span>
                        </div>

                        <div className="space-y-2">
                          {Object.entries(draftScenario.vars ?? {}).map(([key, val]) => (
                            <div key={key} className="grid grid-cols-[1fr_1.2fr_auto] items-center gap-2">
                              <input
                                type="text"
                                value={key}
                                onChange={(e) => updateScenarioVar(e.target.value, String(val), key)}
                                className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-primary font-mono"
                              />
                              <input
                                type="text"
                                value={typeof val === "object" ? JSON.stringify(val) : String(val)}
                                onChange={(e) => updateScenarioVar(key, e.target.value)}
                                className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono"
                              />
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => deleteScenarioVar(key)}
                                icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                              />
                            </div>
                          ))}

                          <div className="grid grid-cols-[1fr_1.2fr_auto] items-center gap-2 pt-2 border-t border-border">
                            <input
                              type="text"
                              placeholder="New variable name..."
                              value={newVarKey}
                              onChange={(e) => setNewVarKey(e.target.value)}
                              className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-primary font-mono"
                            />
                            <input
                              type="text"
                              placeholder="Initial value..."
                              value={newVarVal}
                              onChange={(e) => setNewVarVal(e.target.value)}
                              className="w-full px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono"
                            />
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => {
                                if (newVarKey.trim()) {
                                  updateScenarioVar(newVarKey, newVarVal)
                                  setNewVarKey("")
                                  setNewVarVal("")
                                }
                              }}
                              disabled={!newVarKey.trim()}
                              icon={<Plus className="w-3.5 h-3.5" />}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </Panel>
                    )}

                    {/* Scenario JSON */}
                    {contextTab === "json" && (
                      <div className="space-y-2">
                        {jsonError && (
                          <div className="p-2.5 rounded-xs bg-error-bg border border-error-border text-xs text-error font-mono">
                            {jsonError}
                          </div>
                        )}
                        <textarea
                          rows={20}
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
                          className="w-full p-3 rounded-xs bg-sidebar border border-border text-xs font-mono text-fg focus:border-border-focus focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Select a Step to Inspect"
                description="Click on any step from the center sequence column to view its telemetry, configure driver options, or inspect its JSON definition."
                icon={<Layers className="w-8 h-8 text-fg-muted" />}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
