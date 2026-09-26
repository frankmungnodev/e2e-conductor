import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  FileCode,
  FilePlus2,
  Layers,
  Pencil,
  Plus,
  Save,
  Search,
  Smartphone,
  Trash2,
  Variable,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import type { ConfigMeta, FlowItem, ScenarioItem, ScenarioStep } from "../types.ts"
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { Panel } from "./Panel.tsx"
import { Select } from "./Select.tsx"
import { TabButton, useUrlTab } from "./Tabs.tsx"
import { useToast } from "./Toast.tsx"

type ScenarioBuilderProps = {
  scenarios: ScenarioItem[]
  flows: FlowItem[]
  config?: ConfigMeta
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
}

export function ScenarioBuilder({
  scenarios,
  flows,
  config,
  onSaveScenario,
  onDeleteScenario,
  onSaveFlow,
}: ScenarioBuilderProps) {
  // Explorer state
  const [activeItem, setActiveItem] = useState<{ type: "scenario" | "flow"; id: string } | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [editorMode, setEditorMode] = useUrlTab<"visual" | "json">("view", "visual", [
    "visual",
    "json",
  ])

  // Scenario editing draft
  const [draftScenario, setDraftScenario] = useState<ScenarioItem | null>(null)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Flow editing draft
  const [draftFlow, setDraftFlow] = useState<FlowItem | null>(null)
  const [flowText, setFlowText] = useState("")

  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [bodyDrafts, setBodyDrafts] = useState<Record<number, string>>({})
  const [jsonMatchDrafts, setJsonMatchDrafts] = useState<Record<number, string>>({})
  const [paramsDrafts, setParamsDrafts] = useState<Record<number, string>>({})
  const [customFixtureInput, setCustomFixtureInput] = useState("")
  const [newVarKey, setNewVarKey] = useState("")
  const [newVarVal, setNewVarVal] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(true)

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

  // Default selection
  useEffect(() => {
    if (!activeItem && scenarios.length > 0) {
      selectScenario(scenarios[0].id)
    }
  }, [scenarios])

  const selectScenario = (id: string) => {
    const sc = scenarios.find((s) => s.id === id)
    if (!sc) return
    setActiveItem({ type: "scenario", id })
    setDraftScenario(JSON.parse(JSON.stringify(sc)))
    setJsonText(JSON.stringify(sc.raw, null, 2))
    setJsonError(null)
    setBodyDrafts({})
    setJsonMatchDrafts({})
    setParamsDrafts({})
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

  // Update step in visual editor
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

  const addCustomFixture = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || !draftScenario) return
    if (!draftScenario.setup?.includes(trimmed)) {
      toggleSetupFixture(trimmed)
    }
    setCustomFixtureInput("")
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

  const updateStepHeader = (
    stepIdx: number,
    headerKey: string,
    headerVal: string,
    oldKey?: string,
  ) => {
    if (!draftScenario) return
    const currentHeaders = { ...(draftScenario.steps[stepIdx].headers ?? {}) }
    if (oldKey && oldKey !== headerKey) {
      delete currentHeaders[oldKey]
    }
    if (headerKey.trim()) {
      currentHeaders[headerKey.trim()] = headerVal
    }
    const nextHeaders = Object.keys(currentHeaders).length > 0 ? currentHeaders : undefined
    updateStep(stepIdx, { headers: nextHeaders })
  }

  const deleteStepHeader = (stepIdx: number, headerKey: string) => {
    if (!draftScenario) return
    const currentHeaders = { ...(draftScenario.steps[stepIdx].headers ?? {}) }
    delete currentHeaders[headerKey]
    const nextHeaders = Object.keys(currentHeaders).length > 0 ? currentHeaders : undefined
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
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  const deleteStep = (index: number) => {
    if (!draftScenario) return
    const newSteps = draftScenario.steps.filter((_, i) => i !== index)
    const newRaw = { ...draftScenario.raw, steps: newSteps }
    setDraftScenario({ ...draftScenario, steps: newSteps, raw: newRaw })
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
    setJsonText(JSON.stringify(newRaw, null, 2))
  }

  // Switch between Visual & JSON Editor
  const handleSwitchToVisual = () => {
    try {
      const parsed = JSON.parse(jsonText)
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
      setEditorMode("visual")
    } catch (e) {
      setJsonError(`Invalid JSON syntax: ${(e as Error).message}`)
    }
  }

  const handleSaveScenario = async () => {
    if (!draftScenario) return
    setIsSaving(true)
    try {
      let content = draftScenario.raw
      if (editorMode === "json") {
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

  return (
    <div className="flex h-[calc(100vh-49px)] overflow-hidden bg-editor text-fg select-none">
      {/* Left Sidebar: Explorer */}
      <div className="w-72 border-r border-border bg-sidebar flex flex-col">
        {/* Search & Actions */}
        <div className="p-2.5 border-b border-border space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-2" />
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
              icon={<FilePlus2 className="w-3 h-3 text-primary" />}
            >
              New Scenario
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={createNewFlow}
              title="New Mobile Flow"
              icon={<Smartphone className="w-3 h-3 text-success" />}
            >
              New Flow
            </Button>
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-3">
          {/* Scenarios Section */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted flex items-center justify-between">
              <span>Test Scenarios</span>
              <span className="font-mono text-[10px] text-fg-muted">
                {filteredScenarios.length}
              </span>
            </div>
            <div className="mt-0.5 space-y-0.5">
              {filteredScenarios.map((sc) => {
                const isSelected = activeItem?.type === "scenario" && activeItem.id === sc.id
                return (
                  <button
                    key={sc.id}
                    onClick={() => selectScenario(sc.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-xs text-xs transition flex items-start justify-between cursor-pointer ${
                      isSelected
                        ? "bg-editor text-fg-bright border-l-2 border-primary shadow-xs"
                        : "text-fg hover:bg-hover"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate font-medium text-[11.5px]">{sc.name}</div>
                      <div className="text-[10px] text-fg-muted font-mono truncate">
                        {sc.id}.json
                      </div>
                    </div>
                    <div>
                      {!sc.isValid ? (
                        <AlertTriangle className="w-3 h-3 text-error shrink-0 mt-0.5" />
                      ) : (
                        <span className="text-[10px] font-mono text-fg-muted bg-input px-1.5 py-0.2 rounded-xs border border-border">
                          {sc.steps.length}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Flows Section */}
          {flows.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted flex items-center justify-between">
                <span>Mobile Workflows</span>
                <span className="font-mono text-[10px] text-fg-muted">
                  {filteredFlows.length}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {filteredFlows.map((fl) => {
                  const isSelected = activeItem?.type === "flow" && activeItem.id === fl.file
                  return (
                    <button
                      key={fl.file}
                      onClick={() => selectFlow(fl.file)}
                      className={`w-full text-left px-2 py-1.5 rounded-xs text-xs transition flex items-start justify-between cursor-pointer ${
                        isSelected
                          ? "bg-editor text-fg-bright border-l-2 border-success shadow-xs"
                          : "text-fg hover:bg-hover"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="truncate font-medium text-[11.5px]">{fl.file}</div>
                        <div className="text-[10px] text-fg-muted font-sans truncate">
                          {formatTargetLabel(fl.target)}
                        </div>
                      </div>
                      <div>
                        {!fl.isValid && (
                          <AlertTriangle className="w-3 h-3 text-error shrink-0 mt-0.5" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Inspector & Editor Area */}
      <div className="flex-1 flex flex-col bg-editor overflow-hidden">
        {activeItem?.type === "scenario" && draftScenario ? (
          <>
            {/* Scenario Header Bar */}
            <div className="px-4 py-2 border-b border-border bg-titlebar flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-4 h-4 text-primary" />
                <div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center group">
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
                        className="text-xs font-bold bg-transparent text-fg-bright hover:bg-input pl-1.5 pr-6 py-0.5 rounded-xs border border-transparent hover:border-border focus:border-border-focus focus:bg-input focus:outline-none"
                      />
                      <Pencil className="w-2.5 h-2.5 text-fg-muted/60 group-hover:text-fg-muted absolute right-1.5 pointer-events-none transition-colors" />
                    </div>
                    <span className="text-[10px] font-mono text-fg-muted bg-sidebar px-1.5 py-0.2 rounded-xs border border-border">
                      {draftScenario.id}.json
                    </span>
                  </div>
                  <div className="relative flex items-center group w-96 mt-0.5">
                    <input
                      type="text"
                      placeholder="Add description..."
                      value={draftScenario.description ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        setDraftScenario({
                          ...draftScenario,
                          description: val,
                          raw: { ...draftScenario.raw, description: val },
                        })
                        setJsonText(JSON.stringify({ ...draftScenario.raw, description: val }, null, 2))
                      }}
                      className="text-[11px] text-fg-muted bg-transparent hover:bg-input pl-1.5 pr-6 py-0.5 rounded-xs border border-transparent hover:border-border focus:border-border-focus focus:bg-input focus:outline-none w-full"
                    />
                    <Pencil className="w-2.5 h-2.5 text-fg-muted/60 group-hover:text-fg-muted absolute right-1.5 pointer-events-none transition-colors" />
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {/* View Switcher */}
                <div className="flex items-center bg-sidebar p-0.5 rounded-xs border border-border">
                  <TabButton
                    variant="pills"
                    active={editorMode === "visual"}
                    onClick={handleSwitchToVisual}
                    icon={<Layers className="w-3 h-3" />}
                  >
                    Visual Editor
                  </TabButton>
                  <TabButton
                    variant="pills"
                    active={editorMode === "json"}
                    onClick={() => setEditorMode("json")}
                    icon={<Code2 className="w-3 h-3" />}
                  >
                    Raw Code (JSON)
                  </TabButton>
                </div>

                <Button
                  size="xs"
                  variant="primary"
                  onClick={handleSaveScenario}
                  disabled={isSaving}
                  isLoading={isSaving}
                  icon={saveSuccess ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                >
                  {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save"}
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleDeleteScenario}
                  title="Delete Scenario"
                  icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                />
              </div>
            </div>

            {/* Validation Errors banner if any */}
            {draftScenario.errors.length > 0 && (
              <div className="bg-error-bg border-b border-error-border p-2.5 px-4 text-xs text-error">
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Schema / Validation Errors:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono">
                  {draftScenario.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Editor Content Area */}
            <div className="flex-1 overflow-y-auto p-4 select-text">
              {editorMode === "visual" ? (
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Scenario Configuration Panel */}
                  <div className="bg-panel border border-border rounded-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                      className="w-full px-3 py-2 bg-sidebar hover:bg-input flex items-center justify-between border-b border-border/70 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {isSettingsOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-fg-muted" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-fg-muted" />
                        )}
                        <span className="text-xs font-semibold text-fg tracking-wide flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-primary" />
                          Scenario Setup & Context
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral" size="xs">
                          {`${draftScenario.setup?.length ?? 0} Fixture${(draftScenario.setup?.length ?? 0) === 1 ? "" : "s"}`}
                        </Badge>
                        <Badge variant="neutral" size="xs">
                          {`${Object.keys(draftScenario.vars ?? {}).length} Variable${Object.keys(draftScenario.vars ?? {}).length === 1 ? "" : "s"}`}
                        </Badge>
                      </div>
                    </button>

                    {isSettingsOpen && (
                      <div className="p-3 space-y-3.5 text-xs bg-sidebar/30">
                        {/* Setup Fixtures Section */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] text-fg-muted font-semibold uppercase tracking-wider flex items-center gap-1">
                              <Database className="w-3 h-3 text-primary" /> Setup Fixtures (Run before scenario):
                            </label>
                            <span className="text-[10px] text-fg-muted">Toggled fixtures execute in order before Step 1</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Declared fixtures from config */}
                            {(config?.fixtures ?? []).map((fix) => {
                              const isSelected = draftScenario.setup?.includes(fix)
                              return (
                                <button
                                  key={fix}
                                  type="button"
                                  onClick={() => toggleSetupFixture(fix)}
                                  className={`px-2 py-0.5 text-xs font-mono rounded-xs border transition-colors flex items-center gap-1 cursor-pointer ${
                                    isSelected
                                      ? "bg-primary/20 text-primary border-primary/50 font-medium"
                                      : "bg-input text-fg-muted border-border hover:border-fg-muted/40"
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 text-primary" />}
                                  {fix}
                                </button>
                              )
                            })}

                            {/* Additional custom fixtures already in setup */}
                            {(draftScenario.setup ?? [])
                              .filter((fix) => !(config?.fixtures ?? []).includes(fix))
                              .map((fix) => (
                                <span
                                  key={fix}
                                  className="px-2 py-0.5 text-xs font-mono rounded-xs border bg-primary/20 text-primary border-primary/50 flex items-center gap-1 font-medium"
                                >
                                  <Check className="w-3 h-3 text-primary" />
                                  {fix}
                                  <button
                                    type="button"
                                    onClick={() => toggleSetupFixture(fix)}
                                    className="hover:text-error ml-1 cursor-pointer"
                                    title="Remove fixture"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}

                            {/* Add Custom Fixture Input */}
                            <div className="flex items-center gap-1 ml-1">
                              <input
                                type="text"
                                placeholder="Add custom fixture..."
                                value={customFixtureInput}
                                onChange={(e) => setCustomFixtureInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    addCustomFixture(customFixtureInput)
                                  }
                                }}
                                className="px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none w-36"
                              />
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => addCustomFixture(customFixtureInput)}
                                disabled={!customFixtureInput.trim()}
                                icon={<Plus className="w-2.5 h-2.5" />}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Scenario Variables Section */}
                        <div className="pt-2.5 border-t border-border/60">
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] text-fg-muted font-semibold uppercase tracking-wider flex items-center gap-1">
                              <Variable className="w-3 h-3 text-secondary" /> Initial Variables (ctx):
                            </label>
                            <span className="text-[10px] text-fg-muted">Accessible in steps as &ldquo;${"{"}ctx.varName{"}"}&rdquo;</span>
                          </div>

                          {/* Existing Variables list */}
                          <div className="space-y-1.5">
                            {Object.entries(draftScenario.vars ?? {}).map(([key, val]) => (
                              <div key={key} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={key}
                                  onChange={(e) => updateScenarioVar(e.target.value, String(val), key)}
                                  placeholder="Variable name"
                                  className="w-40 px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-primary font-mono focus:border-border-focus focus:outline-none"
                                />
                                <span className="text-fg-muted font-mono">=</span>
                                <input
                                  type="text"
                                  value={typeof val === "object" ? JSON.stringify(val) : String(val)}
                                  onChange={(e) => updateScenarioVar(key, e.target.value)}
                                  placeholder="Value e.g. 100 or 'test'"
                                  className="flex-1 px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                />
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => deleteScenarioVar(key)}
                                  title="Delete variable"
                                  icon={<X className="w-3 h-3 text-error" />}
                                />
                              </div>
                            ))}

                            {/* Add Variable Row */}
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                placeholder="New variable name..."
                                value={newVarKey}
                                onChange={(e) => setNewVarKey(e.target.value)}
                                className="w-40 px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-primary font-mono focus:border-border-focus focus:outline-none"
                              />
                              <span className="text-fg-muted font-mono">=</span>
                              <input
                                type="text"
                                placeholder="Initial value..."
                                value={newVarVal}
                                onChange={(e) => setNewVarVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && newVarKey.trim()) {
                                    e.preventDefault()
                                    updateScenarioVar(newVarKey, newVarVal)
                                    setNewVarKey("")
                                    setNewVarVal("")
                                  }
                                }}
                                className="flex-1 px-2 py-0.5 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
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
                                icon={<Plus className="w-2.5 h-2.5" />}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step Cards List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                        Test Steps ({draftScenario.steps.length})
                      </h3>
                      {/* Add step quick buttons */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-fg-muted">Add Step:</span>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("http")}
                          className="text-[#9cdcfe]"
                        >
                          + Web API
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("web")}
                          className="text-[#4ec9b0]"
                        >
                          + Web Browser
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("mobile")}
                          className="text-[#89d185]"
                        >
                          + Mobile App
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("shell")}
                          className="text-[#dcdcaa]"
                        >
                          + Command Line
                        </Button>
                      </div>
                    </div>

                    {draftScenario.steps.map((step, idx) => (
                      <Panel
                        key={idx}
                        variant="sidebar"
                        className="p-3 shadow-xs hover:border-border-focus transition"
                      >
                        {/* Step Card Top Controls */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-border mb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-xs bg-input border border-border text-fg-muted flex items-center justify-center text-[10px] font-mono font-bold">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={step.name}
                              onChange={(e) => updateStep(idx, { name: e.target.value })}
                              placeholder="Step Name"
                              className="font-medium text-xs text-fg-bright bg-transparent hover:bg-input px-2 py-0.5 rounded-xs border border-transparent focus:border-border-focus focus:bg-input focus:outline-none w-64"
                            />
                            {/* Target selector */}
                            <Select
                              size="xs"
                              value={step.target}
                              onChange={(val) => updateStep(idx, { target: val })}
                              options={availableTargets.map((t) => ({
                                value: t,
                                label: formatTargetLabel(t),
                              }))}
                              className="w-44"
                              triggerClassName="font-medium text-xs text-fg-bright font-sans"
                            />
                            <Badge size="xs" variant={getTargetBadgeVariant(step.target)}>
                              {capitalizeFirst(getTargetDriver(step.target))}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => moveStep(idx, "up")}
                              disabled={idx === 0}
                              title="Move Up"
                              icon={<ArrowUp className="w-3 h-3" />}
                            />
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => moveStep(idx, "down")}
                              disabled={idx === draftScenario.steps.length - 1}
                              title="Move Down"
                              icon={<ArrowDown className="w-3 h-3" />}
                            />
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => duplicateStep(idx)}
                              title="Duplicate Step"
                              icon={<Copy className="w-3 h-3" />}
                            />
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => deleteStep(idx)}
                              title="Delete Step"
                              icon={<Trash2 className="w-3 h-3 text-error" />}
                            />
                          </div>
                        </div>

                        {/* Step Details Body */}
                        {(() => {
                          const stepDriver = getTargetDriver(step.target)
                          return (
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              {/* Left Column: Driver Actions */}
                              <div className="space-y-2.5">
                                <div className="font-semibold text-fg-muted text-[10px] uppercase tracking-wider">
                                  {stepDriver === "http" && "Web API Request (HTTP)"}
                                  {stepDriver === "web" && "Web Browser Automation"}
                                  {stepDriver === "mobile" && "Mobile App Action"}
                                  {stepDriver === "shell" && "Command Line Action (Shell)"}
                                </div>

                                {/* HTTP Form */}
                                {stepDriver === "http" && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Select
                                        size="xs"
                                        value={step.method ?? "GET"}
                                        onChange={(val) =>
                                          updateStep(idx, { method: val })
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
                                        value={step.url ?? ""}
                                        onChange={(e) => updateStep(idx, { url: e.target.value })}
                                        className="flex-1 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    {["POST", "PUT", "PATCH"].includes(step.method ?? "") && (
                                      <div>
                                        <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                          Data to Send (JSON Format):
                                        </label>
                                        <textarea
                                          rows={2}
                                          value={
                                            bodyDrafts[idx] !== undefined
                                              ? bodyDrafts[idx]
                                              : step.body !== undefined
                                              ? typeof step.body === "string"
                                                ? step.body
                                                : JSON.stringify(step.body, null, 2)
                                              : ""
                                          }
                                          onChange={(e) => {
                                            const val = e.target.value
                                            setBodyDrafts((prev) => ({ ...prev, [idx]: val }))
                                            try {
                                              const parsed = JSON.parse(val)
                                              updateStep(idx, { body: parsed })
                                            } catch {
                                              if (!val.trim()) {
                                                updateStep(idx, { body: undefined })
                                              }
                                            }
                                          }}
                                          onBlur={() => {
                                            const val = bodyDrafts[idx]
                                            if (val !== undefined) {
                                              try {
                                                const parsed = JSON.parse(val)
                                                updateStep(idx, { body: parsed })
                                                setBodyDrafts((prev) => {
                                                  const next = { ...prev }
                                                  delete next[idx]
                                                  return next
                                                })
                                              } catch {
                                                // keep raw draft text while invalid
                                              }
                                            }
                                          }}
                                          placeholder='{"name": "Alice"}'
                                          className="w-full mt-1 p-2 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                        />
                                      </div>
                                    )}

                                    {/* HTTP Request Headers */}
                                    <div className="pt-1.5 border-t border-border/50">
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                          Request Headers ({Object.keys(step.headers ?? {}).length}):
                                        </label>
                                        <Button
                                          size="xs"
                                          variant="ghost"
                                          onClick={() =>
                                            updateStepHeader(idx, "Content-Type", "application/json")
                                          }
                                          icon={<Plus className="w-2.5 h-2.5" />}
                                        >
                                          Add Header
                                        </Button>
                                      </div>
                                      {step.headers && Object.keys(step.headers).length > 0 && (
                                        <div className="space-y-1">
                                          {Object.entries(step.headers).map(([hKey, hVal]) => (
                                            <div key={hKey} className="flex items-center gap-1">
                                              <input
                                                type="text"
                                                value={hKey}
                                                onChange={(e) =>
                                                  updateStepHeader(
                                                    idx,
                                                    e.target.value,
                                                    hVal,
                                                    hKey,
                                                  )
                                                }
                                                placeholder="Header (e.g. Authorization)"
                                                className="w-36 px-2 py-0.5 text-[11px] rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                              />
                                              <span className="text-fg-muted font-mono">:</span>
                                              <input
                                                type="text"
                                                value={hVal}
                                                onChange={(e) =>
                                                  updateStepHeader(idx, hKey, e.target.value)
                                                }
                                                placeholder="Value (e.g. Bearer ${ctx.token})"
                                                className="flex-1 px-2 py-0.5 text-[11px] rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                              />
                                              <Button
                                                size="xs"
                                                variant="ghost"
                                                onClick={() => deleteStepHeader(idx, hKey)}
                                                title="Remove header"
                                                icon={<X className="w-3 h-3 text-error" />}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Response Value Extraction (extract) */}
                                    <div className="pt-1.5 border-t border-border/50">
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                          Extract to Context ({Object.keys(step.extract ?? {}).length}):
                                        </label>
                                        <Button
                                          size="xs"
                                          variant="ghost"
                                          onClick={() =>
                                            updateStepExtract(idx, "extractedVar", "data[0].id")
                                          }
                                          icon={<Plus className="w-2.5 h-2.5" />}
                                        >
                                          Add Extraction
                                        </Button>
                                      </div>
                                      {step.extract && Object.keys(step.extract).length > 0 && (
                                        <div className="space-y-1">
                                          {Object.entries(step.extract).map(
                                            ([varName, jsonPath]) => (
                                              <div
                                                key={varName}
                                                className="flex items-center gap-1"
                                              >
                                                <span className="text-fg-muted font-mono text-[10px]">
                                                  {"${ctx."}
                                                </span>
                                                <input
                                                  type="text"
                                                  value={varName}
                                                  onChange={(e) =>
                                                    updateStepExtract(
                                                      idx,
                                                      e.target.value,
                                                      jsonPath,
                                                      varName,
                                                    )
                                                  }
                                                  placeholder="varName"
                                                  className="w-28 px-1.5 py-0.5 text-[11px] rounded-xs bg-input border border-border text-primary font-mono focus:border-border-focus focus:outline-none"
                                                />
                                                <span className="text-fg-muted font-mono text-[10px]">
                                                  {"}"} &larr;
                                                </span>
                                                <input
                                                  type="text"
                                                  value={jsonPath}
                                                  onChange={(e) =>
                                                    updateStepExtract(idx, varName, e.target.value)
                                                  }
                                                  placeholder="JSON path e.g. data[0].id"
                                                  className="flex-1 px-2 py-0.5 text-[11px] rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                                />
                                                <Button
                                                  size="xs"
                                                  variant="ghost"
                                                  onClick={() => deleteStepExtract(idx, varName)}
                                                  title="Remove extraction"
                                                  icon={<X className="w-3 h-3 text-error" />}
                                                />
                                              </div>
                                            ),
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Shell Form */}
                                {stepDriver === "shell" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Terminal Command:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Terminal command e.g. echo 'hello'"
                                        value={step.command ?? ""}
                                        onChange={(e) =>
                                          updateStep(idx, { command: e.target.value })
                                        }
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Run in Folder (Optional):
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Relative to project folder e.g. ./scripts"
                                        value={step.cwd ?? ""}
                                        onChange={(e) =>
                                          updateStep(idx, { cwd: e.target.value || undefined })
                                        }
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Mobile Form */}
                                {stepDriver === "mobile" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Mobile Step File:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Step file name e.g. login.yaml"
                                        value={step.flow ?? ""}
                                        onChange={(e) => updateStep(idx, { flow: e.target.value })}
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        App Start Mode:
                                      </label>
                                      <Select
                                        size="xs"
                                        value={step.launch ?? "none"}
                                        onChange={(val) =>
                                          updateStep(idx, {
                                            launch:
                                              val === "none"
                                                ? undefined
                                                : (val as any),
                                          })
                                        }
                                        options={[
                                          { value: "none", label: "Keep App As-Is (Don't Restart)" },
                                          {
                                            value: "fresh",
                                            label: "Reset App (Clear Storage & Open)",
                                          },
                                          {
                                            value: "restart",
                                            label: "Restart App (Close & Reopen)",
                                          },
                                        ]}
                                        className="mt-0.5"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Web Form */}
                                {stepDriver === "web" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Browser Script Function:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Function name in test module"
                                        value={step.run ?? ""}
                                        onChange={(e) => updateStep(idx, { run: e.target.value })}
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Module Parameters (params JSON):
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={
                                          paramsDrafts[idx] !== undefined
                                            ? paramsDrafts[idx]
                                            : step.params !== undefined
                                            ? JSON.stringify(step.params, null, 2)
                                            : ""
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value
                                          setParamsDrafts((prev) => ({ ...prev, [idx]: val }))
                                          try {
                                            const parsed = JSON.parse(val)
                                            updateStep(idx, { params: parsed })
                                          } catch {
                                            if (!val.trim()) {
                                              updateStep(idx, { params: undefined })
                                            }
                                          }
                                        }}
                                        onBlur={() => {
                                          const val = paramsDrafts[idx]
                                          if (val !== undefined) {
                                            try {
                                              const parsed = JSON.parse(val)
                                              updateStep(idx, { params: parsed })
                                              setParamsDrafts((prev) => {
                                                const next = { ...prev }
                                                delete next[idx]
                                                return next
                                              })
                                            } catch {
                                              // keep draft
                                            }
                                          }
                                        }}
                                        placeholder='{"role": "admin"}'
                                        className="w-full mt-0.5 p-2 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Assertions & Extractions */}
                              <div className="space-y-2.5">
                                <div className="font-semibold text-fg-muted text-[10px] uppercase tracking-wider">
                                  Verification & Checks
                                </div>

                                {/* Assert Status / Exit Code */}
                                <div className="grid grid-cols-2 gap-2">
                                  {stepDriver === "http" ? (
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Expected Response Status:
                                      </label>
                                      <NumberInput
                                        size="xs"
                                        placeholder="e.g. 200 (Success)"
                                        value={step.assert?.status}
                                        onChange={(val) =>
                                          updateStep(idx, {
                                            assert: {
                                              ...step.assert,
                                              status: val,
                                            },
                                          })
                                        }
                                        mono
                                        className="mt-0.5"
                                      />
                                    </div>
                                  ) : stepDriver === "shell" ? (
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Expected Exit Code:
                                      </label>
                                      <NumberInput
                                        size="xs"
                                        placeholder="0 (Success)"
                                        value={step.assert?.exit_code}
                                        onChange={(val) =>
                                          updateStep(idx, {
                                            assert: {
                                              ...step.assert,
                                              exit_code: val,
                                            },
                                          })
                                        }
                                        mono
                                        className="mt-0.5"
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Driver:
                                      </label>
                                      <div className="mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg-muted font-mono">
                                        {capitalizeFirst(stepDriver)}
                                      </div>
                                    </div>
                                  )}

                                  <div>
                                    <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                      Response Must Contain Text:
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="Sub-text match in response/output"
                                      value={step.assert?.output_contains ?? ""}
                                      onChange={(e) =>
                                        updateStep(idx, {
                                          assert: {
                                            ...step.assert,
                                            output_contains: e.target.value || undefined,
                                          },
                                        })
                                      }
                                      className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>
                                </div>

                                {/* Structured JSON Match */}
                                {stepDriver === "http" && (
                                  <div>
                                    <div className="flex items-center justify-between mb-0.5">
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        JSON Match Assertions (json_match):
                                      </label>
                                      <span className="text-[10px] text-fg-muted">
                                        Supports &ldquo;${"{"}ctx.key{"}"}&rdquo;, $exists, $gte, etc.
                                      </span>
                                    </div>
                                    <textarea
                                      rows={3}
                                      value={
                                        jsonMatchDrafts[idx] !== undefined
                                          ? jsonMatchDrafts[idx]
                                          : step.assert?.json_match !== undefined
                                          ? JSON.stringify(step.assert.json_match, null, 2)
                                          : ""
                                      }
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setJsonMatchDrafts((prev) => ({ ...prev, [idx]: val }))
                                        try {
                                          const parsed = JSON.parse(val)
                                          updateStep(idx, {
                                            assert: {
                                              ...step.assert,
                                              json_match: parsed,
                                            },
                                          })
                                        } catch {
                                          if (!val.trim()) {
                                            const nextAssert = { ...step.assert }
                                            delete nextAssert.json_match
                                            updateStep(idx, {
                                              assert:
                                                Object.keys(nextAssert).length > 0
                                                  ? nextAssert
                                                  : undefined,
                                            })
                                          }
                                        }
                                      }}
                                      onBlur={() => {
                                        const val = jsonMatchDrafts[idx]
                                        if (val !== undefined) {
                                          try {
                                            const parsed = JSON.parse(val)
                                            updateStep(idx, {
                                              assert: {
                                                ...step.assert,
                                                json_match: parsed,
                                              },
                                            })
                                            setJsonMatchDrafts((prev) => {
                                              const next = { ...prev }
                                              delete next[idx]
                                              return next
                                            })
                                          } catch {
                                            // keep draft
                                          }
                                        }
                                      }}
                                      placeholder='{"success": true, "data[0].id": {"$exists": true}}'
                                      className="w-full mt-0.5 p-2 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                    />
                                  </div>
                                )}

                                {/* Retries & Timeout */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                      Retry Attempts if Failed:
                                    </label>
                                    <NumberInput
                                      size="xs"
                                      min={0}
                                      max={10}
                                      value={step.retry?.times ?? 0}
                                      onChange={(val) =>
                                        updateStep(idx, {
                                          retry: {
                                            times: val ?? 0,
                                            delay_ms: step.retry?.delay_ms ?? 1000,
                                          },
                                        })
                                      }
                                      className="mt-0.5"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                      Maximum Wait Time (ms):
                                    </label>
                                    <NumberInput
                                      size="xs"
                                      placeholder="e.g. 5000"
                                      suffix="ms"
                                      value={step.timeout_ms}
                                      onChange={(val) =>
                                        updateStep(idx, {
                                          timeout_ms: val,
                                        })
                                      }
                                      className="mt-0.5"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </Panel>
                    ))}
                  </div>
                </div>
              ) : (
                /* JSON Source Editor Mode */
                <div className="h-full flex flex-col space-y-2">
                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span>Direct Scenario JSON editing</span>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        try {
                          setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2))
                          setJsonError(null)
                        } catch (e) {
                          setJsonError((e as Error).message)
                        }
                      }}
                    >
                      Format JSON
                    </Button>
                  </div>
                  {jsonError && (
                    <div className="p-2 bg-error-bg border border-error-border rounded-xs text-error text-xs font-mono">
                      {jsonError}
                    </div>
                  )}
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="flex-1 w-full bg-sidebar border border-border rounded-xs p-3 font-mono text-xs text-fg focus:outline-none focus:border-border-focus resize-none leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </>
        ) : activeItem?.type === "flow" && draftFlow ? (
          /* Mobile Flow Editor */
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-titlebar flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-success" />
                <div>
                  <div className="font-bold text-fg-bright text-xs">{draftFlow.file}</div>
                  <div className="text-[10px] text-fg-muted font-sans">
                    {formatTargetLabel(draftFlow.target)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="primary"
                  onClick={handleSaveFlow}
                  disabled={isSaving}
                  isLoading={isSaving}
                  icon={saveSuccess ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                >
                  {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save Flow"}
                </Button>
              </div>
            </div>

            {draftFlow.errors.length > 0 && (
              <div className="bg-error-bg border-b border-error-border p-2.5 px-4 text-xs text-error">
                <div className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Flow Validation Errors:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono">
                  {draftFlow.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex-1 p-4 flex flex-col">
              <textarea
                value={flowText}
                onChange={(e) => setFlowText(e.target.value)}
                className="flex-1 w-full bg-sidebar border border-border rounded-xs p-3 font-mono text-xs text-fg focus:outline-none focus:border-border-focus resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-fg-muted">
            <Layers className="w-10 h-10 mb-2 opacity-30 stroke-1" />
            <p className="text-xs font-semibold uppercase tracking-wider text-fg">
              Select or create a scenario to edit
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
