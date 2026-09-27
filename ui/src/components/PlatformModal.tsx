import { Check, Globe, Layers, Search, Server, Smartphone } from "lucide-react"
import { useEffect, useState } from "react"
import { detectWorkspaceProjects, savePlatform } from "../api.ts"
import type {
  ConfigMeta,
  DetectedService,
  WizardComponent,
  WizardComponentType,
} from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { FormField, Input, NumberInput } from "./FormControls.tsx"
import { Modal } from "./Modal.tsx"
import { useToast } from "./Toast.tsx"

export interface PlatformModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  config?: ConfigMeta
}

export function extractComponentsFromConfig(config?: ConfigMeta): WizardComponent[] {
  if (!config?.targets) return []
  const components: WizardComponent[] = []
  let order = 1

  for (const [name, target] of Object.entries(config.targets)) {
    if (target.driver === "web") {
      components.push({
        id: `web-${name}`,
        type: "web",
        name,
        order: order++,
        service: target.service,
        url: config.services?.[target.service]?.url,
        startCmd: config.services?.[target.service]?.startCmd,
        cwd: config.services?.[target.service]?.startCwd,
        modules: target.modules,
        slowMo: target.slowMo,
        headless: target.headless,
      })
    } else if (target.driver === "mobile") {
      components.push({
        id: `mobile-${name}`,
        type: "android",
        name,
        order: order++,
        appId: target.appId,
        flows: target.flows,
        installCmd: target.install?.cmd,
        cwd: target.install?.cwd,
        reversePorts: target.reversePorts,
      })
    } else if (target.driver === "http") {
      components.push({
        id: `api-${name}`,
        type: "api",
        name,
        order: order++,
        url: config.services?.[target.service]?.url || "http://localhost:3000",
        health: config.services?.[target.service]?.health,
        startCmd: config.services?.[target.service]?.startCmd,
        cwd: config.services?.[target.service]?.startCwd,
      })
    }
  }
  return components
}

export function PlatformModal({
  isOpen,
  onClose,
  onSaved,
  config,
}: PlatformModalProps) {
  const [platform, setPlatform] = useState<WizardComponentType>("web")
  const [detected, setDetected] = useState<DetectedService[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [scaffoldFiles, setScaffoldFiles] = useState(true)

  // Web platform state
  const [webName, setWebName] = useState("web")
  const [webUrl, setWebUrl] = useState("http://localhost:5173")
  const [webStartCmd, setWebStartCmd] = useState("pnpm run dev")
  const [webCwd, setWebCwd] = useState("")
  const [webModules, setWebModules] = useState(".e2e/modules/web")
  const [webSlowMo, setWebSlowMo] = useState(50)
  const [webHeadless, setWebHeadless] = useState(false)

  // Mobile platform state
  const [mobileName, setMobileName] = useState("app")
  const [mobileAppId, setMobileAppId] = useState("com.example.app")
  const [mobileFlows, setMobileFlows] = useState(".e2e/flows")
  const [mobileInstallCmd, setMobileInstallCmd] = useState("./gradlew installDebug")
  const [mobileCwd, setMobileCwd] = useState("")
  const [mobileReversePorts, setMobileReversePorts] = useState("8080")

  // API platform state
  const [apiName, setApiName] = useState("api")
  const [apiUrl, setApiUrl] = useState("http://localhost:3000")
  const [apiHealth, setApiHealth] = useState("/health")
  const [apiStartCmd, setApiStartCmd] = useState("pnpm run dev")
  const [apiCwd, setApiCwd] = useState("")

  const { error: toastError, success: toastSuccess } = useToast()

  // Load workspace detections when opened
  useEffect(() => {
    if (!isOpen) return
    detectWorkspaceProjects()
      .then((res) => {
        const found = res.detected ?? []
        setDetected(found)
        if (found.length > 0) {
          applyDetection(found[0])
        }
      })
      .catch(() => {
        // ignore scan errors
      })
  }, [isOpen])

  const applyDetection = (det: DetectedService) => {
    setPlatform(det.suggestedType)
    if (det.suggestedType === "web") {
      setWebName(det.name || "web")
      setWebUrl(det.port ? `http://localhost:${det.port}` : "http://localhost:5173")
      if (det.startCmd) setWebStartCmd(det.startCmd)
      if (det.path && det.path !== ".") setWebCwd(det.path)
    } else if (det.suggestedType === "android") {
      setMobileName(det.name || "app")
      if (det.appId) setMobileAppId(det.appId)
      if (det.startCmd) setMobileInstallCmd(det.startCmd)
      if (det.path && det.path !== ".") setMobileCwd(det.path)
    } else if (det.suggestedType === "api") {
      setApiName(det.name || "api")
      setApiUrl(det.port ? `http://localhost:${det.port}` : "http://localhost:3000")
      if (det.startCmd) setApiStartCmd(det.startCmd)
      if (det.path && det.path !== ".") setApiCwd(det.path)
    }
  }

  const handleSubmit = async () => {
    let component: WizardComponent

    if (platform === "web") {
      if (!webName.trim()) {
        toastError("Please enter a target name for the web platform", "Validation Error")
        return
      }
      if (!webUrl.trim()) {
        toastError("Please enter a web application URL", "Validation Error")
        return
      }
      component = {
        id: `web-${Date.now()}`,
        type: "web",
        name: webName.trim(),
        order: 1,
        url: webUrl.trim(),
        startCmd: webStartCmd.trim() || undefined,
        cwd: webCwd.trim() || undefined,
        modules: webModules.trim() || ".e2e/modules/web",
        slowMo: webSlowMo || undefined,
        headless: webHeadless,
      }
    } else if (platform === "android") {
      if (!mobileName.trim()) {
        toastError("Please enter a target name for the mobile platform", "Validation Error")
        return
      }
      if (!mobileAppId.trim()) {
        toastError("Please enter an Application ID", "Validation Error")
        return
      }
      const ports = mobileReversePorts
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n) && n > 0)

      component = {
        id: `mobile-${Date.now()}`,
        type: "android",
        name: mobileName.trim(),
        order: 1,
        appId: mobileAppId.trim(),
        flows: mobileFlows.trim() || ".e2e/flows",
        installCmd: mobileInstallCmd.trim() || undefined,
        cwd: mobileCwd.trim() || undefined,
        reversePorts: ports.length > 0 ? ports : undefined,
      }
    } else {
      if (!apiName.trim()) {
        toastError("Please enter a target name for the API platform", "Validation Error")
        return
      }
      if (!apiUrl.trim()) {
        toastError("Please enter a service endpoint URL", "Validation Error")
        return
      }
      component = {
        id: `api-${Date.now()}`,
        type: "api",
        name: apiName.trim(),
        order: 1,
        url: apiUrl.trim(),
        health: apiHealth.trim() || undefined,
        startCmd: apiStartCmd.trim() || undefined,
        cwd: apiCwd.trim() || undefined,
      }
    }

    const existingComponents = extractComponentsFromConfig(config)
    if (
      existingComponents.some(
        (c) => c.name.toLowerCase() === component.name.toLowerCase(),
      )
    ) {
      toastError(
        `A platform named "${component.name}" already exists. Please choose a different name.`,
        "Validation Error",
      )
      return
    }

    setIsApplying(true)
    try {
      await savePlatform(component, scaffoldFiles)
      toastSuccess(
        `Platform "${component.name}" added`,
        "Platform Added",
      )
      onSaved()
      onClose()
    } catch (err) {
      toastError((err as Error).message, "Failed to Add Platform")
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissable={true}
      maxWidth="xl"
      title={
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span>Add Platform</span>
        </div>
      }
      description="Configure a new platform (Web, Android, or REST API) for this project."
      footer={
        <div className="flex items-center justify-between w-full">
          <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={scaffoldFiles}
              onChange={(e) => setScaffoldFiles(e.target.checked)}
              className="rounded-xs border-border bg-input text-primary focus:ring-0"
            />
            <span>Scaffold starter test files and smoke scenario</span>
          </label>

          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={onClose} disabled={isApplying}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={handleSubmit}
              isLoading={isApplying}
              icon={<Check className="w-3.5 h-3.5" />}
            >
              Add Platform
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Workspace Detected Banner */}
        {detected.length > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-xs p-3">
            <div className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              <span>Workspace Detection Hints</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {detected.map((det) => (
                <button
                  type="button"
                  key={`${det.suggestedType}-${det.name}`}
                  onClick={() => applyDetection(det)}
                  className="text-left text-xs bg-sidebar hover:bg-hover border border-border px-2.5 py-1.5 rounded-xs transition-colors cursor-pointer flex items-center gap-2 group"
                >
                  <span className="font-semibold text-fg-bright group-hover:text-primary">
                    {det.name}
                  </span>
                  <Badge variant="neutral" size="xs">
                    {det.suggestedType === "web" ? "Web" : det.suggestedType === "android" ? "Android" : "Api"}
                  </Badge>
                  {det.port && (
                    <span className="text-xs text-fg-muted font-mono">:{det.port}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Platform Selection */}
        <div>
          <label className="block text-xs font-semibold text-fg-bright mb-1.5">
            Select Platform Type
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setPlatform("web")}
              className={`p-3 rounded-xs border text-left transition-all cursor-pointer flex flex-col justify-between ${
                platform === "web"
                  ? "border-primary bg-primary/10 shadow-xs"
                  : "border-border bg-sidebar hover:border-border-light hover:bg-hover"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className={`w-6 h-6 rounded-xs flex items-center justify-center ${
                    platform === "web" ? "bg-primary text-white" : "bg-editor text-fg-muted"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs text-fg-bright">Web</span>
              </div>
              <p className="text-xs text-fg-muted leading-tight">
                Playwright browser automation (Chrome, Firefox, Safari)
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPlatform("android")}
              className={`p-3 rounded-xs border text-left transition-all cursor-pointer flex flex-col justify-between ${
                platform === "android"
                  ? "border-primary bg-primary/10 shadow-xs"
                  : "border-border bg-sidebar hover:border-border-light hover:bg-hover"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className={`w-6 h-6 rounded-xs flex items-center justify-center ${
                    platform === "android" ? "bg-success text-white" : "bg-editor text-fg-muted"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs text-fg-bright">Android</span>
              </div>
              <p className="text-xs text-fg-muted leading-tight">
                Mobile app automation via ADB commands & UI flows
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPlatform("api")}
              className={`p-3 rounded-xs border text-left transition-all cursor-pointer flex flex-col justify-between ${
                platform === "api"
                  ? "border-primary bg-primary/10 shadow-xs"
                  : "border-border bg-sidebar hover:border-border-light hover:bg-hover"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className={`w-6 h-6 rounded-xs flex items-center justify-center ${
                    platform === "api" ? "bg-warning text-black" : "bg-editor text-fg-muted"
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs text-fg-bright">REST API</span>
              </div>
              <p className="text-xs text-fg-muted leading-tight">
                Backend microservices, health probes & HTTP assertions
              </p>
            </button>
          </div>
        </div>

        {/* Web Configuration Form (At most 2 columns on desktop, 1 on mobile) */}
        {platform === "web" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Target Name"
                hint="Identifier in scenario steps e.g. web"
                required
              >
                <Input
                  value={webName}
                  onChange={(e) => setWebName(e.target.value)}
                  placeholder="e.g. web"
                  mono
                />
              </FormField>

              <FormField
                label="Application URL"
                hint="Address where web app runs"
                required
              >
                <Input
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="e.g. http://localhost:5173"
                  mono
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Dev Start Command"
                hint="Optional command to launch app automatically"
              >
                <Input
                  value={webStartCmd}
                  onChange={(e) => setWebStartCmd(e.target.value)}
                  placeholder="e.g. pnpm run dev"
                  mono
                />
              </FormField>

              <FormField
                label="Working Directory (CWD)"
                hint="Relative path where start command is executed"
              >
                <Input
                  value={webCwd}
                  onChange={(e) => setWebCwd(e.target.value)}
                  placeholder="e.g. apps/frontend"
                  mono
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Modules Directory"
                hint="Location for Playwright action modules"
              >
                <Input
                  value={webModules}
                  onChange={(e) => setWebModules(e.target.value)}
                  placeholder="e.g. .e2e/modules/web"
                  mono
                />
              </FormField>

              <FormField
                label="Slow-Mo Delay (ms)"
                hint="Action slowdown for visual debugging"
              >
                <NumberInput
                  value={webSlowMo}
                  onChange={(val) => setWebSlowMo(val ?? 0)}
                  min={0}
                  step={25}
                  suffix="ms"
                />
              </FormField>
            </div>

            <label className="flex items-center gap-2 text-xs text-fg-bright cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webHeadless}
                onChange={(e) => setWebHeadless(e.target.checked)}
                className="rounded-xs border-border bg-input text-primary focus:ring-0"
              />
              <span>Run browser in headless mode (no visual browser window)</span>
            </label>
          </div>
        )}

        {/* Android Configuration Form (At most 2 columns on desktop, 1 on mobile) */}
        {platform === "android" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Target Name"
                hint="Identifier in scenario steps e.g. app"
                required
              >
                <Input
                  value={mobileName}
                  onChange={(e) => setMobileName(e.target.value)}
                  placeholder="e.g. app"
                  mono
                />
              </FormField>

              <FormField
                label="Application ID (Package)"
                hint="Android package name to test"
                required
              >
                <Input
                  value={mobileAppId}
                  onChange={(e) => setMobileAppId(e.target.value)}
                  placeholder="e.g. com.example.app"
                  mono
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Flows Directory"
                hint="Folder for YAML mobile action flows"
              >
                <Input
                  value={mobileFlows}
                  onChange={(e) => setMobileFlows(e.target.value)}
                  placeholder="e.g. .e2e/flows"
                  mono
                />
              </FormField>

              <FormField
                label="Install Command"
                hint="Command to build/install debug APK"
              >
                <Input
                  value={mobileInstallCmd}
                  onChange={(e) => setMobileInstallCmd(e.target.value)}
                  placeholder="e.g. ./gradlew installDebug"
                  mono
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Working Directory (CWD)"
                hint="Relative path for install command execution"
              >
                <Input
                  value={mobileCwd}
                  onChange={(e) => setMobileCwd(e.target.value)}
                  placeholder="e.g. apps/mobile"
                  mono
                />
              </FormField>

              <FormField
                label="Reverse Port Forwarding"
                hint="Forward local host ports to device (comma separated)"
              >
                <Input
                  value={mobileReversePorts}
                  onChange={(e) => setMobileReversePorts(e.target.value)}
                  placeholder="e.g. 8080, 3000"
                  mono
                />
              </FormField>
            </div>
          </div>
        )}

        {/* REST API Configuration Form (At most 2 columns on desktop, 1 on mobile) */}
        {platform === "api" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Target Name"
                hint="Identifier in scenario steps e.g. api"
                required
              >
                <Input
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="e.g. api"
                  mono
                />
              </FormField>

              <FormField
                label="Service Endpoint URL"
                hint="Root URL where the API service runs"
                required
              >
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="e.g. http://localhost:3000"
                  mono
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Health Check Path"
                hint="Endpoint used to verify service readiness"
              >
                <Input
                  value={apiHealth}
                  onChange={(e) => setApiHealth(e.target.value)}
                  placeholder="e.g. /health"
                  mono
                />
              </FormField>

              <FormField
                label="Start Command"
                hint="Optional command to launch backend service"
              >
                <Input
                  value={apiStartCmd}
                  onChange={(e) => setApiStartCmd(e.target.value)}
                  placeholder="e.g. pnpm run dev"
                  mono
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Working Directory (CWD)"
                hint="Relative path where API start command is run"
              >
                <Input
                  value={apiCwd}
                  onChange={(e) => setApiCwd(e.target.value)}
                  placeholder="e.g. apps/api"
                  mono
                />
              </FormField>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
