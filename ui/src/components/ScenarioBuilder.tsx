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
import type { ConfigMeta, FlowItem, ScenarioItem, ScenarioStep } from "../types.ts"

type ScenarioBuilderProps = {
  scenarios: ScenarioItem[]
  flows: FlowItem[]
  config?: ConfigMeta
  onSaveScenario: (id: string, content: any) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>
  onDeleteScenario: (id: string) => Promise<void>
  onSaveFlow: (target: string, file: string, content: string) => Promise<{ ok: boolean; isValid: boolean; errors: string[] } | undefined>
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
  const [activeItem, setActiveItem] = useState<{ type: "scenario" | "flow"; id: string } | null>(null)
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

  // Target options from config
  const availableTargets = Object.keys(config?.targets ?? {}).concat(["shell"])

  const getTargetDriver = (target: string): "http" | "web" | "mobile" | "shell" => {
    if (target === "shell") return "shell"
    const targetObj = config?.targets?.[target]
    if (targetObj) return targetObj.driver
    if (target.includes("web") || target.includes("browser")) return "web"
    if (target.includes("mobile") || target.includes("app")) return "mobile"
    return "http"
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
    setSaveSuccess(false)
  }

  const selectFlow = (file: string) => {
    const fl = flows.find((f) => f.file === file)
    if (!fl) return
    setActiveItem({ type: "flow", id: file })
    setDraftFlow(fl)
    setFlowText(fl.content)
    setSaveSuccess(false)
  }

  const createNewScenario = () => {
    const newId = `scenario-${Date.now().toString(36)}`
    const defaultTarget = availableTargets[0] ?? "shell"
    const driver = getTargetDriver(defaultTarget)
    const initialStep: ScenarioStep = {
      name: "Sample Step",
      target: defaultTarget,
    }
    if (driver === "shell") {
      initialStep.command = "echo 'running e2e step'"
      initialStep.assert = { exit_code: 0 }
    } else if (driver === "http") {
      initialStep.method = "GET"
      initialStep.url = "/"
      initialStep.assert = { status: 200 }
    } else if (driver === "mobile") {
      initialStep.flow = flows[0]?.file ?? "login.yaml"
      initialStep.launch = "fresh"
    } else if (driver === "web") {
      initialStep.run = "login"
      initialStep.params = {}
    }

    const newScenario: ScenarioItem = {
      id: newId,
      file: `${newId}.json`,
      name: "New Scenario",
      description: "Description of the scenario",
      steps: [initialStep],
      setup: [],
      vars: {},
      raw: {
        $schema: "../../schema/v1/scenario.schema.json",
        name: "New Scenario",
        description: "Description of the scenario",
        steps: [initialStep],
      },
      isValid: true,
      errors: [],
      targets: [defaultTarget],
    }

    setActiveItem({ type: "scenario", id: newId })
    setDraftScenario(newScenario)
    setJsonText(JSON.stringify(newScenario.raw, null, 2))
    setEditorMode("visual")
  }

  const createNewFlow = () => {
    const mobileTargets = Object.entries(config?.targets ?? {})
      .filter(([_, t]) => t.driver === "mobile")
      .map(([name]) => name)
    const target = mobileTargets[0] ?? "app"
    const file = `flow-${Date.now().toString(36)}.yaml`
    const newFlow: FlowItem = {
      target,
      file,
      path: "",
      content: `# Mobile flow steps\n- tap: "Log in"\n- input: "user@example.com"\n- press: enter\n`,
      isValid: true,
      errors: [],
    }
    setActiveItem({ type: "flow", id: file })
    setDraftFlow(newFlow)
    setFlowText(newFlow.content)
  }

  // Update step field in visual mode
  const updateStep = (index: number, updates: Partial<ScenarioStep>) => {
    if (!draftScenario) return
    const newSteps = [...draftScenario.steps]
    const currentStep = newSteps[index]

    if (updates.target && updates.target !== currentStep.target) {
      const oldDriver = getTargetDriver(currentStep.target)
      const newDriver = getTargetDriver(updates.target)
      if (oldDriver !== newDriver) {
        const cleanStep: ScenarioStep = {
          name: currentStep.name,
          target: updates.target,
        }
        if (currentStep.assert?.output_contains) {
          cleanStep.assert = { output_contains: currentStep.assert.output_contains }
        }
        if (newDriver === "shell") {
          cleanStep.command = currentStep.command ?? "echo 'running e2e step'"
          cleanStep.assert = { ...cleanStep.assert, exit_code: 0 }
        } else if (newDriver === "http") {
          cleanStep.method = currentStep.method ?? "GET"
          cleanStep.url = currentStep.url ?? "/"
          cleanStep.assert = { ...cleanStep.assert, status: 200 }
        } else if (newDriver === "mobile") {
          cleanStep.flow = flows[0]?.file ?? "login.yaml"
          cleanStep.launch = "fresh"
        } else if (newDriver === "web") {
          cleanStep.run = "login"
        }
        newSteps[index] = cleanStep
      } else {
        newSteps[index] = { ...currentStep, ...updates }
      }
    } else {
      newSteps[index] = { ...currentStep, ...updates }
    }

    const updated = {
      ...draftScenario,
      steps: newSteps,
      raw: {
        ...draftScenario.raw,
        steps: newSteps,
      },
    }
    setDraftScenario(updated)
    setJsonText(JSON.stringify(updated.raw, null, 2))
  }

  const addStep = (targetType: "http" | "web" | "mobile" | "shell") => {
    if (!draftScenario) return
    const matchingTarget =
      targetType === "shell"
        ? "shell"
        : Object.entries(config?.targets ?? {}).find(([_, t]) => t.driver === targetType)?.[0]

    if (!matchingTarget && targetType !== "shell") {
      alert(`No target configured with driver "${targetType}" in config.targets.`)
      return
    }
    const defaultTarget = matchingTarget ?? "shell"

    const newStep: ScenarioStep = {
      name: `Step ${draftScenario.steps.length + 1}`,
      target: defaultTarget,
    }

    if (targetType === "http") {
      newStep.method = "GET"
      newStep.url = "/api/v1/health"
      newStep.assert = { status: 200 }
    } else if (targetType === "web") {
      newStep.run = "login"
      newStep.params = { username: "admin" }
    } else if (targetType === "mobile") {
      newStep.flow = flows[0]?.file ?? "login.yaml"
      newStep.launch = "fresh"
    } else if (targetType === "shell") {
      newStep.command = "echo 'running e2e step'"
      newStep.assert = { exit_code: 0 }
    }

    const newSteps = [...draftScenario.steps, newStep]
    const updated = {
      ...draftScenario,
      steps: newSteps,
      raw: {
        ...draftScenario.raw,
        steps: newSteps,
      },
    }
    setDraftScenario(updated)
    setJsonText(JSON.stringify(updated.raw, null, 2))
  }

  const moveStep = (index: number, direction: "up" | "down") => {
    if (!draftScenario) return
    const targetIdx = direction === "up" ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= draftScenario.steps.length) return

    const newSteps = [...draftScenario.steps]
    const [moved] = newSteps.splice(index, 1)
    newSteps.splice(targetIdx, 0, moved)

    const updated = {
      ...draftScenario,
      steps: newSteps,
      raw: { ...draftScenario.raw, steps: newSteps },
    }
    setDraftScenario(updated)
    setJsonText(JSON.stringify(updated.raw, null, 2))
  }

  const duplicateStep = (index: number) => {
    if (!draftScenario) return
    const step = JSON.parse(JSON.stringify(draftScenario.steps[index]))
    step.name = `${step.name} (Copy)`
    const newSteps = [...draftScenario.steps]
    newSteps.splice(index + 1, 0, step)
    const updated = {
      ...draftScenario,
      steps: newSteps,
      raw: { ...draftScenario.raw, steps: newSteps },
    }
    setDraftScenario(updated)
    setJsonText(JSON.stringify(updated.raw, null, 2))
  }

  const deleteStep = (index: number) => {
    if (!draftScenario) return
    const newSteps = draftScenario.steps.filter((_, idx) => idx !== index)
    const updated = {
      ...draftScenario,
      steps: newSteps,
      raw: { ...draftScenario.raw, steps: newSteps },
    }
    setDraftScenario(updated)
    setJsonText(JSON.stringify(updated.raw, null, 2))
  }

  // Switch to Visual mode
  const handleSwitchToVisual = () => {
    try {
      const parsed = JSON.parse(jsonText)
      if (draftScenario) {
        setDraftScenario({
          ...draftScenario,
          name: parsed.name ?? draftScenario.name,
          description: parsed.description,
          steps: parsed.steps ?? [],
          setup: parsed.setup ?? [],
          vars: parsed.vars ?? {},
          raw: parsed,
        })
      }
      setJsonError(null)
      setEditorMode("visual")
    } catch (e) {
      setJsonError((e as Error).message)
    }
  }

  const handleSaveScenario = async () => {
    if (!draftScenario) return
    setIsSaving(true)
    try {
      let content = draftScenario.raw
      if (editorMode === "json") {
        content = JSON.parse(jsonText)
      }
      const res = await onSaveScenario(draftScenario.id, content)
      if (res) {
        setDraftScenario((prev) =>
          prev ? { ...prev, isValid: res.isValid, errors: res.errors } : null,
        )
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteScenario = async () => {
    if (!draftScenario) return
    if (!confirm(`Are you sure you want to delete scenario "${draftScenario.id}"?`)) return
    await onDeleteScenario(draftScenario.id)
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
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  const filteredScenarios = scenarios.filter(
    (s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredFlows = flows.filter(
    (f) => f.file.toLowerCase().includes(searchQuery.toLowerCase()) || f.target.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden">
      {/* Left Sidebar: Explorer */}
      <div className="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col">
        {/* Search & Actions */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search scenarios & flows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={createNewScenario}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-medium transition"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              New Scenario
            </button>
            <button
              onClick={createNewFlow}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition"
              title="New Mobile Flow"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              Flow
            </button>
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Scenarios Section */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Scenarios</span>
              <span className="font-mono text-[10px] text-slate-500">{filteredScenarios.length}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {filteredScenarios.map((sc) => {
                const isSelected = activeItem?.type === "scenario" && activeItem.id === sc.id
                return (
                  <button
                    key={sc.id}
                    onClick={() => selectScenario(sc.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition flex items-start justify-between ${
                      isSelected
                        ? "bg-sky-500/20 text-sky-200 border border-sky-500/30 font-medium"
                        : "text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate font-medium">{sc.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{sc.id}.json</div>
                    </div>
                    <div>
                      {!sc.isValid ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">
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
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Mobile Flows</span>
                <span className="font-mono text-[10px] text-slate-500">{filteredFlows.length}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {filteredFlows.map((fl) => {
                  const isSelected = activeItem?.type === "flow" && activeItem.id === fl.file
                  return (
                    <button
                      key={fl.file}
                      onClick={() => selectFlow(fl.file)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition flex items-start justify-between ${
                        isSelected
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-medium"
                          : "text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="truncate font-medium">{fl.file}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">target: {fl.target}</div>
                      </div>
                      <div>
                        {!fl.isValid && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
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
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {activeItem?.type === "scenario" && draftScenario ? (
          <>
            {/* Scenario Header Bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCode className="w-5 h-5 text-sky-400" />
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
                      className="text-base font-bold bg-transparent text-slate-100 hover:bg-slate-800/60 px-1 py-0.5 rounded border border-transparent hover:border-slate-700 focus:border-sky-500 focus:outline-none"
                    />
                    <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
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
                    className="text-xs text-slate-400 bg-transparent hover:bg-slate-800/40 px-1 py-0.5 rounded border border-transparent hover:border-slate-800 focus:border-sky-500 focus:outline-none w-96 mt-0.5"
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {/* View Switcher */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={handleSwitchToVisual}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                      editorMode === "visual"
                        ? "bg-slate-800 text-sky-400 font-semibold shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Visual Builder
                  </button>
                  <button
                    onClick={() => setEditorMode("json")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                      editorMode === "json"
                        ? "bg-slate-800 text-sky-400 font-semibold shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    JSON Code
                  </button>
                </div>

                <button
                  onClick={handleSaveScenario}
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                    saveSuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold"
                  }`}
                >
                  {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save"}
                </button>

                <button
                  onClick={handleDeleteScenario}
                  title="Delete Scenario"
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Validation Errors banner if any */}
            {draftScenario.errors.length > 0 && (
              <div className="bg-rose-950/40 border-b border-rose-900/50 p-3 px-6 text-xs text-rose-300">
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
            <div className="flex-1 overflow-y-auto p-6">
              {editorMode === "visual" ? (
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* Step Cards List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Execution Steps ({draftScenario.steps.length})
                      </h3>
                      {/* Add step quick buttons */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">Add Step:</span>
                        <button
                          onClick={() => addStep("http")}
                          className="px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[11px] font-medium"
                        >
                          + HTTP
                        </button>
                        <button
                          onClick={() => addStep("web")}
                          className="px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[11px] font-medium"
                        >
                          + Web
                        </button>
                        <button
                          onClick={() => addStep("mobile")}
                          className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium"
                        >
                          + Mobile
                        </button>
                        <button
                          onClick={() => addStep("shell")}
                          className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[11px] font-medium"
                        >
                          + Shell
                        </button>
                      </div>
                    </div>

                    {draftScenario.steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition"
                      >
                        {/* Step Card Top Controls */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-mono font-bold">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={step.name}
                              onChange={(e) => updateStep(idx, { name: e.target.value })}
                              placeholder="Step Name"
                              className="font-medium text-xs text-slate-200 bg-transparent hover:bg-slate-800/50 px-2 py-1 rounded border border-transparent focus:border-sky-500 focus:outline-none w-64"
                            />
                            {/* Target selector */}
                            <select
                              value={step.target}
                              onChange={(e) => updateStep(idx, { target: e.target.value })}
                              className="px-2 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-300 font-mono"
                            >
                              {availableTargets.map((t) => (
                                <option key={t} value={t}>
                                  target: {t}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => moveStep(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveStep(idx, "down")}
                              disabled={idx === draftScenario.steps.length - 1}
                              className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => duplicateStep(idx)}
                              className="p-1 rounded text-slate-400 hover:text-slate-200"
                              title="Duplicate Step"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteStep(idx)}
                              className="p-1 rounded text-slate-400 hover:text-rose-400"
                              title="Delete Step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Step Details Body */}
                        {(() => {
                          const stepDriver = getTargetDriver(step.target)
                          return (
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              {/* Left Column: Driver Actions */}
                              <div className="space-y-3">
                                <div className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">
                                  Action Details ({stepDriver.toUpperCase()})
                                </div>

                                {/* HTTP Form */}
                                {stepDriver === "http" && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={step.method ?? "GET"}
                                        onChange={(e) => updateStep(idx, { method: e.target.value })}
                                        className="px-2 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-sky-400 font-bold"
                                      >
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="PUT">PUT</option>
                                        <option value="PATCH">PATCH</option>
                                        <option value="DELETE">DELETE</option>
                                      </select>
                                      <input
                                        type="text"
                                        placeholder="Endpoint URL e.g. /v1/users"
                                        value={step.url ?? ""}
                                        onChange={(e) => updateStep(idx, { url: e.target.value })}
                                        className="flex-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                    {["POST", "PUT", "PATCH"].includes(step.method ?? "") && (
                                      <div>
                                        <label className="text-[10px] text-slate-400 font-medium">Request Body (JSON):</label>
                                        <textarea
                                          rows={2}
                                          value={step.body ? JSON.stringify(step.body, null, 2) : ""}
                                          onChange={(e) => {
                                            try {
                                              updateStep(idx, { body: JSON.parse(e.target.value) })
                                            } catch {
                                              // Keep raw string or handle invalid
                                            }
                                          }}
                                          placeholder='{"name": "Alice"}'
                                          className="w-full mt-1 p-2 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Shell Form */}
                                {stepDriver === "shell" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Command Line:</label>
                                      <input
                                        type="text"
                                        placeholder="sh command line e.g. echo 'hello'"
                                        value={step.command ?? ""}
                                        onChange={(e) => updateStep(idx, { command: e.target.value })}
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Working Directory (optional):</label>
                                      <input
                                        type="text"
                                        placeholder="Relative to config dir e.g. ./scripts"
                                        value={step.cwd ?? ""}
                                        onChange={(e) => updateStep(idx, { cwd: e.target.value || undefined })}
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Mobile Form */}
                                {stepDriver === "mobile" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Flow YAML:</label>
                                      <input
                                        type="text"
                                        placeholder="Flow file name e.g. login.yaml"
                                        value={step.flow ?? ""}
                                        onChange={(e) => updateStep(idx, { flow: e.target.value })}
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">App Launch Mode:</label>
                                      <select
                                        value={step.launch ?? "none"}
                                        onChange={(e) =>
                                          updateStep(idx, {
                                            launch: e.target.value === "none" ? undefined : (e.target.value as any),
                                          })
                                        }
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-300"
                                      >
                                        <option value="none">Don't launch</option>
                                        <option value="fresh">Fresh (clear app data & launch)</option>
                                        <option value="restart">Restart (force-stop & launch)</option>
                                      </select>
                                    </div>
                                  </div>
                                )}

                                {/* Web Form */}
                                {stepDriver === "web" && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Module Function:</label>
                                      <input
                                        type="text"
                                        placeholder="Exported function in web target modules"
                                        value={step.run ?? ""}
                                        onChange={(e) => updateStep(idx, { run: e.target.value })}
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Assertions & Extractions */}
                              <div className="space-y-3">
                                <div className="font-semibold text-slate-400 text-[11px] uppercase tracking-wider">
                                  Assertions & Context
                                </div>

                                {/* Assert Status / Exit Code */}
                                <div className="grid grid-cols-2 gap-2">
                                  {stepDriver === "http" ? (
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Expect HTTP Status:</label>
                                      <input
                                        type="number"
                                        placeholder="e.g. 200"
                                        value={step.assert?.status ?? ""}
                                        onChange={(e) =>
                                          updateStep(idx, {
                                            assert: {
                                              ...step.assert,
                                              status: e.target.value !== "" ? parseInt(e.target.value, 10) : undefined,
                                            },
                                          })
                                        }
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                  ) : stepDriver === "shell" ? (
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Expect Exit Code:</label>
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={step.assert?.exit_code ?? ""}
                                        onChange={(e) =>
                                          updateStep(idx, {
                                            assert: {
                                              ...step.assert,
                                              exit_code: e.target.value !== "" ? parseInt(e.target.value, 10) : undefined,
                                            },
                                          })
                                        }
                                        className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                      />
                                    </div>
                                  ) : (
                                    <div>
                                      <label className="text-[10px] text-slate-400 font-medium">Driver:</label>
                                      <div className="mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                                        {stepDriver}
                                      </div>
                                    </div>
                                  )}

                                  <div>
                                    <label className="text-[10px] text-slate-400 font-medium">Output Contains:</label>
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
                                      className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                                    />
                                  </div>
                                </div>

                                {/* Retries & Timeout */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 font-medium">Retry Times:</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={10}
                                      value={step.retry?.times ?? 0}
                                      onChange={(e) =>
                                        updateStep(idx, {
                                          retry: {
                                            times: parseInt(e.target.value, 10) || 0,
                                            delay_ms: step.retry?.delay_ms ?? 1000,
                                          },
                                        })
                                      }
                                      className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 font-medium">Timeout (ms):</label>
                                    <input
                                      type="number"
                                      placeholder="e.g. 5000"
                                      value={step.timeout_ms ?? ""}
                                      onChange={(e) =>
                                        updateStep(idx, {
                                          timeout_ms: e.target.value ? parseInt(e.target.value, 10) : undefined,
                                        })
                                      }
                                      className="w-full mt-1 px-2.5 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-slate-200"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* JSON Source Editor Mode */
                <div className="h-full flex flex-col space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Direct Scenario JSON editing</span>
                    <button
                      onClick={() => {
                        try {
                          setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2))
                          setJsonError(null)
                        } catch (e) {
                          setJsonError((e as Error).message)
                        }
                      }}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-[11px]"
                    >
                      Format JSON
                    </button>
                  </div>
                  {jsonError && (
                    <div className="p-2 bg-rose-950/60 border border-rose-800/80 rounded text-rose-300 text-xs font-mono">
                      {jsonError}
                    </div>
                  )}
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </>
        ) : activeItem?.type === "flow" && draftFlow ? (
          /* Mobile Flow Editor */
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="font-bold text-slate-100 text-base">{draftFlow.file}</div>
                  <div className="text-xs text-slate-500 font-mono">Mobile Target: {draftFlow.target}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveFlow}
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                    saveSuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                  }`}
                >
                  {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save Flow"}
                </button>
              </div>
            </div>

            {draftFlow.errors.length > 0 && (
              <div className="bg-rose-950/40 border-b border-rose-900/50 p-3 px-6 text-xs text-rose-300">
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

            <div className="flex-1 p-6 flex flex-col">
              <textarea
                value={flowText}
                onChange={(e) => setFlowText(e.target.value)}
                className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                spellCheck={false}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Layers className="w-12 h-12 mb-3 opacity-30 stroke-1" />
            <p className="text-sm font-medium text-slate-400">Select or create a scenario to edit</p>
          </div>
        )}
      </div>
    </div>
  )
}
