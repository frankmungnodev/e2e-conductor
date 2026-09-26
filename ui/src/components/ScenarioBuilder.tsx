import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  Copy,
  FileCode,
  FilePlus2,
  Layers,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Badge, type BadgeVariant } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { Panel } from "./Panel.tsx"
import { Select } from "./Select.tsx"
import { useToast } from "./Toast.tsx"
import type { ConfigMeta, FlowItem, ScenarioItem, ScenarioStep } from "../types.ts"

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
  const [editorMode, setEditorMode] = useState<"visual" | "json">("visual")

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

  const { error: toastError, success: toastSuccess } = useToast()

  // Target options from config plus driver defaults
  const configuredTargets = Object.keys(config?.targets ?? {})
  const availableTargets = Array.from(
    new Set([...configuredTargets, "shell", "api", "web", "mobile"]),
  )

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
          name: "Health check step",
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
            name: "Health check step",
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
              Flow
            </Button>
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-3">
          {/* Scenarios Section */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted flex items-center justify-between">
              <span>Scenarios</span>
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
                <span>Mobile Flows</span>
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
                        <div className="text-[10px] text-fg-muted font-mono truncate">
                          target: {fl.target}
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
                      className="text-xs font-bold bg-transparent text-fg-bright hover:bg-input px-1.5 py-0.5 rounded-xs border border-transparent hover:border-border focus:border-border-focus focus:bg-input focus:outline-none"
                    />
                    <span className="text-[10px] font-mono text-fg-muted bg-sidebar px-1.5 py-0.2 rounded-xs border border-border">
                      {draftScenario.id}.json
                    </span>
                  </div>
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
                    className="text-[11px] text-fg-muted bg-transparent hover:bg-input px-1.5 py-0.5 rounded-xs border border-transparent hover:border-border focus:border-border-focus focus:bg-input focus:outline-none w-96 mt-0.5"
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {/* View Switcher */}
                <div className="flex items-center bg-sidebar p-0.5 rounded-xs border border-border">
                  <Button
                    size="xs"
                    variant={editorMode === "visual" ? "primary" : "ghost"}
                    onClick={handleSwitchToVisual}
                    icon={<Layers className="w-3 h-3" />}
                  >
                    Visual Builder
                  </Button>
                  <Button
                    size="xs"
                    variant={editorMode === "json" ? "primary" : "ghost"}
                    onClick={() => setEditorMode("json")}
                    icon={<Code2 className="w-3 h-3" />}
                  >
                    JSON Code
                  </Button>
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
                  {/* Step Cards List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                        Execution Steps ({draftScenario.steps.length})
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
                          + HTTP
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("web")}
                          className="text-[#4ec9b0]"
                        >
                          + Web
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("mobile")}
                          className="text-[#89d185]"
                        >
                          + Mobile
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => addStep("shell")}
                          className="text-[#dcdcaa]"
                        >
                          + Shell
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
                              mono
                              value={step.target}
                              onChange={(val) => updateStep(idx, { target: val })}
                              options={availableTargets.map((t) => ({
                                value: t,
                                label: `target: ${t}`,
                              }))}
                              className="w-40"
                            />
                            <Badge size="xs" variant={getTargetBadgeVariant(step.target)}>
                              {getTargetDriver(step.target)}
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
                                  Action Details ({stepDriver.toUpperCase()})
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
                                        placeholder="Endpoint URL e.g. /v1/users"
                                        value={step.url ?? ""}
                                        onChange={(e) => updateStep(idx, { url: e.target.value })}
                                        className="flex-1 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    {["POST", "PUT", "PATCH"].includes(step.method ?? "") && (
                                      <div>
                                        <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                          Request Body (JSON):
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
                                  </div>
                                )}

                                {/* Shell Form */}
                                {stepDriver === "shell" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Command Line:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="sh command line e.g. echo 'hello'"
                                        value={step.command ?? ""}
                                        onChange={(e) =>
                                          updateStep(idx, { command: e.target.value })
                                        }
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Working Directory (optional):
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Relative to config dir e.g. ./scripts"
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
                                        Flow YAML:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Flow file name e.g. login.yaml"
                                        value={step.flow ?? ""}
                                        onChange={(e) => updateStep(idx, { flow: e.target.value })}
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        App Launch Mode:
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
                                          { value: "none", label: "Don't launch" },
                                          {
                                            value: "fresh",
                                            label: "Fresh (clear app data & launch)",
                                          },
                                          {
                                            value: "restart",
                                            label: "Restart (force-stop & launch)",
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
                                        Module Function:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Exported function in web target modules"
                                        value={step.run ?? ""}
                                        onChange={(e) => updateStep(idx, { run: e.target.value })}
                                        className="w-full mt-0.5 px-2.5 py-1 text-xs rounded-xs bg-input border border-border text-fg font-mono focus:border-border-focus focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Assertions & Extractions */}
                              <div className="space-y-2.5">
                                <div className="font-semibold text-fg-muted text-[10px] uppercase tracking-wider">
                                  Assertions & Context
                                </div>

                                {/* Assert Status / Exit Code */}
                                <div className="grid grid-cols-2 gap-2">
                                  {stepDriver === "http" ? (
                                    <div>
                                      <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                        Expect HTTP Status:
                                      </label>
                                      <NumberInput
                                        size="xs"
                                        placeholder="e.g. 200"
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
                                        Expect Exit Code:
                                      </label>
                                      <NumberInput
                                        size="xs"
                                        placeholder="0"
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
                                        {stepDriver}
                                      </div>
                                    </div>
                                  )}

                                  <div>
                                    <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                      Output Contains:
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="Sub-text match"
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

                                {/* Retries & Timeout */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">
                                      Retry Times:
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
                                      Timeout:
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
                  <div className="text-[10px] text-fg-muted font-mono">
                    Mobile Target: {draftFlow.target}
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
