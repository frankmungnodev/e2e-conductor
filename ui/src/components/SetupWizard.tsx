import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  Globe,
  Layers,
  Plus,
  Server,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { applyWizardConfig, detectWorkspaceProjects } from "../api.ts"
import type { DetectedService, WizardComponent, WizardComponentType } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { FormField, Input, NumberInput, } from "./FormControls.tsx"
import { Modal } from "./Modal.tsx"
import { TabButton } from "./Tabs.tsx"
import { useToast } from "./Toast.tsx"

interface SetupWizardProps {
  isOpen: boolean
  onClose: () => void
  onApplied: () => void
}

const DEFAULT_COMPONENTS: WizardComponent[] = [
  {
    id: "api-1",
    type: "api",
    name: "api",
    order: 1,
    url: "http://localhost:3000",
    health: "/health",
    startCmd: "pnpm run dev",
    cwd: "./backend",
  },
  {
    id: "web-2",
    type: "web",
    name: "web",
    order: 2,
    service: "web_server",
    url: "http://localhost:5173",
    startCmd: "pnpm run dev",
    cwd: "./frontend",
    modules: "e2e/modules/web",
    slowMo: 50,
    headless: false,
  },
]

export function SetupWizard({ isOpen, onClose, onApplied }: SetupWizardProps) {
  const [components, setComponents] = useState<WizardComponent[]>(DEFAULT_COMPONENTS)
  const [selectedId, setSelectedId] = useState<string>("api-1")
  const [detected, setDetected] = useState<DetectedService[]>([])
  const [_isLoadingDetected, setIsLoadingDetected] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [scaffoldFiles, setScaffoldFiles] = useState(true)
  const [activeTab, setActiveTab] = useState<"builder" | "preview">("builder")

  const { error: toastError, success: toastSuccess } = useToast()

  // Load workspace detections when opened
  useEffect(() => {
    if (!isOpen) return
    setIsLoadingDetected(true)
    detectWorkspaceProjects()
      .then((res) => {
        setDetected(res.detected ?? [])
      })
      .catch(() => {
        // ignore scan errors
      })
      .finally(() => {
        setIsLoadingDetected(false)
      })
  }, [isOpen])

  // Keep components sorted by order
  const sortedComponents = useMemo(() => {
    return [...components].sort((a, b) => a.order - b.order)
  }, [components])

  const selectedComponent = components.find((c) => c.id === selectedId) ?? sortedComponents[0]

  // Dynamic config code generator for live preview
  const previewCode = useMemo(() => {
    const servicesEntries: string[] = []
    const targetsEntries: string[] = []

    for (const comp of sortedComponents) {
      if (comp.type === "api") {
        const url = comp.url || "http://localhost:3000"
        const healthProp = comp.health ? `\n      health: "${comp.health}",` : ""
        let startProp = ""
        if (comp.startCmd) {
          const cwdPart = comp.cwd ? `cwd: "${comp.cwd}", ` : ""
          startProp = `\n      start: { ${cwdPart}cmd: "${comp.startCmd}" },`
        }

        servicesEntries.push(`    ${comp.name}: {
      url: "${url}",${healthProp}${startProp}
    },`)

        targetsEntries.push(`    ${comp.name}: {
      driver: "http",
      service: "${comp.name}",
    },`)
      } else if (comp.type === "web") {
        const serviceName = comp.service || `${comp.name}_server`
        const url = comp.url || "http://localhost:5173"
        let startProp = ""
        if (comp.startCmd) {
          const cwdPart = comp.cwd ? `cwd: "${comp.cwd}", ` : ""
          startProp = `\n      start: { ${cwdPart}cmd: "${comp.startCmd}" },`
        }

        if (comp.startCmd || comp.url) {
          servicesEntries.push(`    ${serviceName}: {
      url: "${url}",${startProp}
    },`)
        }

        const modulesDir = comp.modules || `e2e/modules/${comp.name}`
        const slowMoProp = comp.slowMo ? `\n      slowMo: ${comp.slowMo},` : ""
        const headlessProp = comp.headless !== undefined ? `\n      headless: ${comp.headless},` : ""

        targetsEntries.push(`    ${comp.name}: {
      driver: "web",
      service: "${serviceName}",
      modules: "${modulesDir}",${slowMoProp}${headlessProp}
    },`)
      } else if (comp.type === "android") {
        const flowsDir = comp.flows || `e2e/flows/${comp.name}`
        const appId = comp.appId || "com.example.app"
        let installProp = ""
        if (comp.installCmd) {
          const cwdPart = comp.cwd ? `cwd: "${comp.cwd}", ` : ""
          installProp = `\n      install: { ${cwdPart}cmd: "${comp.installCmd}" },`
        }
        let reversePortsProp = ""
        if (comp.reversePorts && comp.reversePorts.length > 0) {
          reversePortsProp = `\n      reversePorts: [${comp.reversePorts.join(", ")}],`
        }
        let permissionsProp = ""
        if (comp.grantPermissions && comp.grantPermissions.length > 0) {
          permissionsProp = `\n      grantPermissions: ${JSON.stringify(comp.grantPermissions)},`
        }

        targetsEntries.push(`    ${comp.name}: {
      driver: "mobile",
      platform: "android",
      appId: "${appId}",
      flows: "${flowsDir}",${reversePortsProp}${installProp}${permissionsProp}
    },`)
      }
    }

    const servicesBlock =
      servicesEntries.length > 0
        ? `  services: {\n${servicesEntries.join("\n")}\n  },\n`
        : "  services: {},\n"

    const targetsBlock =
      targetsEntries.length > 0
        ? `  targets: {\n${targetsEntries.join("\n")}\n  },\n`
        : "  targets: {},\n"

    return `import { defineConfig } from "e2e-orchestrator"

/**
 * Generated E2E Configuration
 * Arranged in startup and execution run order
 */
export default defineConfig({
${servicesBlock}${targetsBlock}  scenarios: "e2e/scenarios",
  results: "e2e/results",
})
`
  }, [sortedComponents])

  const handleAddComponent = (type: WizardComponentType) => {
    const nextOrder = (sortedComponents[sortedComponents.length - 1]?.order ?? 0) + 1
    const id = `comp-${Date.now()}`

    let newComp: WizardComponent
    if (type === "api") {
      newComp = {
        id,
        type: "api",
        name: `api_${nextOrder}`,
        order: nextOrder,
        url: "http://localhost:3000",
        health: "/health",
        startCmd: "pnpm run dev",
        cwd: "./backend",
      }
    } else if (type === "web") {
      newComp = {
        id,
        type: "web",
        name: `web_${nextOrder}`,
        order: nextOrder,
        service: `web_server_${nextOrder}`,
        url: "http://localhost:5173",
        startCmd: "pnpm run dev",
        cwd: "./frontend",
        modules: `e2e/modules/web_${nextOrder}`,
        slowMo: 50,
        headless: false,
      }
    } else {
      newComp = {
        id,
        type: "android",
        name: `mobile_${nextOrder}`,
        order: nextOrder,
        appId: "com.example.app",
        flows: `e2e/flows/mobile_${nextOrder}`,
        installCmd: "./gradlew installDebug",
        cwd: "./android",
        reversePorts: [3000],
      }
    }

    setComponents((prev) => [...prev, newComp])
    setSelectedId(id)
  }

  const handleApplyDetected = (det: DetectedService) => {
    const nextOrder = (sortedComponents[sortedComponents.length - 1]?.order ?? 0) + 1
    const id = `comp-${Date.now()}`

    let newComp: WizardComponent
    if (det.suggestedType === "api") {
      newComp = {
        id,
        type: "api",
        name: det.name,
        order: nextOrder,
        url: det.port ? `http://localhost:${det.port}` : "http://localhost:3000",
        health: "/health",
        startCmd: det.startCmd || "pnpm run dev",
        cwd: det.path,
      }
    } else if (det.suggestedType === "web") {
      newComp = {
        id,
        type: "web",
        name: det.name,
        order: nextOrder,
        service: `${det.name}_server`,
        url: det.port ? `http://localhost:${det.port}` : "http://localhost:5173",
        startCmd: det.startCmd || "pnpm run dev",
        cwd: det.path,
        modules: `e2e/modules/${det.name}`,
        slowMo: 50,
        headless: false,
      }
    } else {
      newComp = {
        id,
        type: "android",
        name: det.name,
        order: nextOrder,
        appId: det.appId || "com.example.app",
        flows: `e2e/flows/${det.name}`,
        installCmd: det.startCmd || "./gradlew installDebug",
        cwd: det.path,
      }
    }

    setComponents((prev) => [...prev, newComp])
    setSelectedId(id)
    toastSuccess(`Added detected ${det.suggestedType.toUpperCase()} component "${det.name}"`, "Component Added")
  }

  const handleDeleteComponent = (id: string) => {
    if (components.length <= 1) {
      toastError("You must have at least one component configured", "Cannot Delete")
      return
    }
    const remaining = components.filter((c) => c.id !== id)
    setComponents(remaining)
    if (selectedId === id) {
      setSelectedId(remaining[0]?.id ?? "")
    }
  }

  const handleMoveOrder = (id: string, direction: "up" | "down") => {
    const index = sortedComponents.findIndex((c) => c.id === id)
    if (index < 0) return
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sortedComponents.length) return

    const currentItem = sortedComponents[index]
    const targetItem = sortedComponents[targetIndex]

    const updated = components.map((comp) => {
      if (comp.id === currentItem.id) return { ...comp, order: targetItem.order }
      if (comp.id === targetItem.id) return { ...comp, order: currentItem.order }
      return comp
    })

    setComponents(updated)
  }

  const handleUpdateSelected = (patch: Partial<WizardComponent>) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === selectedComponent.id ? { ...c, ...patch } : c)),
    )
  }

  const handleApply = async () => {
    setIsApplying(true)
    try {
      const res = await applyWizardConfig({
        components: sortedComponents,
        code: previewCode,
        scaffoldFiles,
      })
      toastSuccess(
        `Applied configuration. Created: ${res.created.length} files.`,
        "Configuration Ready",
      )
      onApplied()
      onClose()
    } catch (err) {
      toastError((err as Error).message, "Failed to Apply Configuration")
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="full"
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>E2E Orchestrator Configuration Wizard</span>
        </div>
      }
      description="Configure backend services, web SPAs, and Android apps arranged by startup and execution run order."
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg-bright cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scaffoldFiles}
                onChange={(e) => setScaffoldFiles(e.target.checked)}
                className="w-3.5 h-3.5 rounded-xs accent-primary"
              />
              <span>Scaffold starter steps, flows, and smoke scenario</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="secondary" onClick={onClose} disabled={isApplying}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={handleApply}
              isLoading={isApplying}
              icon={<Check className="w-3.5 h-3.5" />}
            >
              Apply & Save Configuration
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-[520px]">
        {/* Navigation Tabs */}
        <div className="px-4 py-2 border-b border-border bg-sidebar/50 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <TabButton
              active={activeTab === "builder"}
              onClick={() => setActiveTab("builder")}
              icon={<Layers className="w-3.5 h-3.5" />}
              variant="pills"
            >
              Component Builder ({components.length})
            </TabButton>
            <TabButton
              active={activeTab === "preview"}
              onClick={() => setActiveTab("preview")}
              icon={<Code2 className="w-3.5 h-3.5" />}
              variant="pills"
            >
              Generated Code Preview
            </TabButton>
          </div>

          <div className="text-[11px] text-fg-muted font-mono">
            Startup Order: {sortedComponents.map((c) => c.name).join(" ➔ ")}
          </div>
        </div>

        {activeTab === "preview" ? (
          <div className="flex-1 bg-editor p-4 overflow-y-auto font-mono text-xs text-fg-bright leading-relaxed">
            <div className="text-[11px] text-fg-muted mb-2 font-sans flex items-center justify-between border-b border-border pb-2">
              <span>TypeScript Configuration (Generated in Run Order)</span>
              <span className="text-[10px] text-primary">e2e.config.ts</span>
            </div>
            <pre className="whitespace-pre-wrap">{previewCode}</pre>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Component List & Run Order */}
            <div className="w-80 border-r border-border bg-sidebar/30 p-3 flex flex-col justify-between overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Execution & Startup Order</span>
                  <Badge variant="neutral" size="xs">
                    {components.length} Items
                  </Badge>
                </div>

                {/* Component List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {sortedComponents.map((comp, index) => {
                    const isSelected = comp.id === selectedComponent?.id
                    const badgeVariant =
                      comp.type === "api"
                        ? "driver-http"
                        : comp.type === "web"
                          ? "driver-web"
                          : "driver-mobile"
                    const badgeTitle =
                      comp.type === "api"
                        ? "Rest Api"
                        : comp.type === "web"
                          ? "Web Spa"
                          : "Android Mobile"

                    return (
                      <div
                        key={comp.id}
                        onClick={() => setSelectedId(comp.id)}
                        className={`p-2 rounded-xs border transition-colors cursor-pointer text-xs ${
                          isSelected
                            ? "bg-input border-primary/60 text-fg-bright"
                            : "bg-editor/50 border-border hover:bg-input/50 text-fg"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[10px] text-fg-muted font-bold">
                              #{index + 1}
                            </span>
                            <span className="font-semibold truncate">{comp.name}</span>
                          </div>
                          <Badge variant={badgeVariant} size="xs">
                            {badgeTitle}
                          </Badge>
                        </div>

                        <div className="text-[10px] font-mono text-fg-muted mt-1 truncate">
                          {comp.type === "android"
                            ? comp.appId
                            : comp.url || (comp.cwd ? `Dir: ${comp.cwd}` : "No URL")}
                        </div>

                        {/* Order Controls */}
                        <div className="mt-2 pt-1 border-t border-border/40 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMoveOrder(comp.id, "up")
                              }}
                              disabled={index === 0}
                              className="p-1 hover:bg-sidebar rounded-xs text-fg-muted hover:text-fg disabled:opacity-30 disabled:pointer-events-none"
                              title="Move Up in Boot Sequence"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMoveOrder(comp.id, "down")
                              }}
                              disabled={index === sortedComponents.length - 1}
                              className="p-1 hover:bg-sidebar rounded-xs text-fg-muted hover:text-fg disabled:opacity-30 disabled:pointer-events-none"
                              title="Move Down in Boot Sequence"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteComponent(comp.id)
                            }}
                            className="p-1 hover:bg-error-bg rounded-xs text-fg-muted hover:text-error transition-colors"
                            title="Remove Component"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Add Component Actions */}
              <div className="pt-2 border-t border-border space-y-1">
                <div className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Component
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => handleAddComponent("api")}
                    className="p-1.5 text-[10px] bg-editor hover:bg-input border border-border rounded-xs text-fg flex flex-col items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Server className="w-3 h-3 text-info" />
                    <span>REST API</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddComponent("web")}
                    className="p-1.5 text-[10px] bg-editor hover:bg-input border border-border rounded-xs text-fg flex flex-col items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Globe className="w-3 h-3 text-primary" />
                    <span>Web SPA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddComponent("android")}
                    className="p-1.5 text-[10px] bg-editor hover:bg-input border border-border rounded-xs text-fg flex flex-col items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Smartphone className="w-3 h-3 text-success" />
                    <span>Android</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Component Detail Form & Workspace Hints */}
            <div className="flex-1 flex flex-col overflow-hidden bg-editor">
              {/* Workspace Suggestions Banner (if any detected) */}
              {detected.length > 0 && (
                <div className="px-4 py-2 bg-sidebar border-b border-border flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-fg-muted">
                    <Sparkles className="w-3.5 h-3.5 text-warning" />
                    <span>Detected {detected.length} workspace projects:</span>
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {detected.map((det) => (
                      <button
                        key={det.name}
                        type="button"
                        onClick={() => handleApplyDetected(det)}
                        className="px-2 py-0.5 bg-input hover:bg-border text-[11px] rounded-xs font-mono text-fg-bright border border-border cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5 text-primary" />
                        <span>{det.name}</span>
                        <span className="text-[9px] text-fg-muted uppercase">({det.suggestedType})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Fields for Selected Component */}
              {selectedComponent ? (
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-fg-bright">
                        Configuring Component #{sortedComponents.findIndex((c) => c.id === selectedComponent.id) + 1}:
                      </span>
                      <span className="font-mono text-xs text-primary font-semibold">
                        {selectedComponent.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-fg-muted">Run Order Priority:</span>
                      <input
                        type="number"
                        min="1"
                        value={selectedComponent.order}
                        onChange={(e) => handleUpdateSelected({ order: Number(e.target.value) || 1 })}
                        className="w-16 px-1.5 py-0.5 bg-input border border-border rounded-xs text-xs font-mono text-fg text-center"
                      />
                    </div>
                  </div>

                  {/* General Identification */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Target & Service Identifier" required>
                      <Input
                        value={selectedComponent.name}
                        onChange={(e) => handleUpdateSelected({ name: e.target.value })}
                        placeholder="e.g. api, web, admin, app"
                      />
                    </FormField>

                    <FormField label="Project Directory (cwd)" hint="Relative to repo root">
                      <Input
                        value={selectedComponent.cwd ?? ""}
                        onChange={(e) => handleUpdateSelected({ cwd: e.target.value || undefined })}
                        placeholder="e.g. ./backend, ./frontend, ./android"
                      />
                    </FormField>
                  </div>

                  {/* REST API Specific Fields */}
                  {selectedComponent.type === "api" && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                        REST API Service Parameters
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Base URL" required>
                          <Input
                            value={selectedComponent.url ?? ""}
                            onChange={(e) => handleUpdateSelected({ url: e.target.value })}
                            placeholder="http://localhost:3000"
                          />
                        </FormField>

                        <FormField label="Health Endpoint" hint="Polled for readiness">
                          <Input
                            value={selectedComponent.health ?? ""}
                            onChange={(e) => handleUpdateSelected({ health: e.target.value || undefined })}
                            placeholder="/health or /api/health"
                          />
                        </FormField>
                      </div>

                      <FormField label="Start Command" hint="Command to boot the service in background">
                        <Input
                          value={selectedComponent.startCmd ?? ""}
                          onChange={(e) => handleUpdateSelected({ startCmd: e.target.value || undefined })}
                          placeholder="e.g. pnpm run dev, cargo run, go run ."
                        />
                      </FormField>
                    </div>
                  )}

                  {/* Web SPA Specific Fields */}
                  {selectedComponent.type === "web" && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                        Playwright Web Target Parameters
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Dev Server URL" required>
                          <Input
                            value={selectedComponent.url ?? ""}
                            onChange={(e) => handleUpdateSelected({ url: e.target.value })}
                            placeholder="http://localhost:5173"
                          />
                        </FormField>

                        <FormField label="Dev Server Start Command" hint="Optional">
                          <Input
                            value={selectedComponent.startCmd ?? ""}
                            onChange={(e) => handleUpdateSelected({ startCmd: e.target.value || undefined })}
                            placeholder="e.g. pnpm run dev"
                          />
                        </FormField>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Web Step Modules Folder" required>
                          <Input
                            value={selectedComponent.modules ?? ""}
                            onChange={(e) => handleUpdateSelected({ modules: e.target.value })}
                            placeholder="e2e/modules/web"
                          />
                        </FormField>

                        <FormField label="Action Slow-Motion (ms)">
                          <NumberInput
                            value={selectedComponent.slowMo ?? 0}
                            onChange={(v) => handleUpdateSelected({ slowMo: v || undefined })}
                            min={0}
                            max={2000}
                            step={10}
                          />
                        </FormField>
                      </div>
                    </div>
                  )}

                  {/* Android Mobile Specific Fields */}
                  {selectedComponent.type === "android" && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                        Android Mobile Target Parameters
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Application ID / Package" required>
                          <Input
                            value={selectedComponent.appId ?? ""}
                            onChange={(e) => handleUpdateSelected({ appId: e.target.value })}
                            placeholder="com.example.app"
                          />
                        </FormField>

                        <FormField label="Flows Directory" required>
                          <Input
                            value={selectedComponent.flows ?? ""}
                            onChange={(e) => handleUpdateSelected({ flows: e.target.value })}
                            placeholder="e2e/flows/android"
                          />
                        </FormField>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Install & Build Command">
                          <Input
                            value={selectedComponent.installCmd ?? ""}
                            onChange={(e) => handleUpdateSelected({ installCmd: e.target.value || undefined })}
                            placeholder="./gradlew installDebug"
                          />
                        </FormField>

                        <FormField label="Reverse Ports (comma-separated)" hint="tcp reverse to device">
                          <Input
                            value={(selectedComponent.reversePorts ?? []).join(", ")}
                            onChange={(e) => {
                              const ports = e.target.value
                                .split(",")
                                .map((s) => Number(s.trim()))
                                .filter((n) => !Number.isNaN(n) && n > 0)
                              handleUpdateSelected({ reversePorts: ports.length > 0 ? ports : undefined })
                            }}
                            placeholder="e.g. 3000, 8080"
                          />
                        </FormField>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-fg-muted text-xs">
                  Select or add a component from the list on the left
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
