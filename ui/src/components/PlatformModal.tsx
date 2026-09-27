import {
  Check,
  Globe,
  Layers,
  RotateCcw,
  Search,
  Server,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react"
import { useEffect, useState } from "react"
import {
  deleteEnvPlatform,
  detectWorkspaceProjects,
  saveEnvPlatform,
  savePlatform,
} from "../api.ts"
import type {
  ConfigMeta,
  DetectedService,
  EnvPlatformRecord,
  PlatformWithEnvOverrides,
  WizardComponent,
  WizardComponentType,
} from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { FormField, Input } from "./FormControls.tsx"
import { Modal } from "./Modal.tsx"
import { NumberInput } from "./NumberInput.tsx"
import { useToast } from "./Toast.tsx"

export interface PlatformModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  config?: ConfigMeta
  overridePlatform?: PlatformWithEnvOverrides | null
  targetEnv?: string
  allEnvPlatforms?: EnvPlatformRecord[]
}

function extractComponentsFromConfig(config?: ConfigMeta): WizardComponent[] {
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
  overridePlatform,
  targetEnv,
  allEnvPlatforms,
}: PlatformModalProps) {
  const isOverride = Boolean(overridePlatform && targetEnv)
  const capitalizedEnv = targetEnv
    ? targetEnv.charAt(0).toUpperCase() + targetEnv.slice(1)
    : ""
  const pivot = allEnvPlatforms?.find(
    (ep) => ep.envName === targetEnv && ep.platformId === overridePlatform?.id,
  )
  const hasExistingOverrides = Boolean(
    overridePlatform?.hasOverrides ||
      (pivot &&
        (pivot.url !== undefined ||
          pivot.startCmd !== undefined ||
          pivot.health !== undefined ||
          pivot.cwd !== undefined ||
          pivot.headless !== undefined ||
          pivot.slowMo !== undefined ||
          pivot.appId !== undefined ||
          pivot.configJson !== undefined)),
  )

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
  const [webExclusive, setWebExclusive] = useState(false)

  // Mobile platform state
  const [mobileName, setMobileName] = useState("app")
  const [mobileAppId, setMobileAppId] = useState("com.example.app")
  const [mobileFlows, setMobileFlows] = useState(".e2e/flows")
  const [mobileInstallCmd, setMobileInstallCmd] = useState("./gradlew installDebug")
  const [mobileCwd, setMobileCwd] = useState("")
  const [mobileReversePorts, setMobileReversePorts] = useState("8080")
  const [mobileGrantPermissions, setMobileGrantPermissions] = useState("")

  // API platform state
  const [apiName, setApiName] = useState("api")
  const [apiUrl, setApiUrl] = useState("http://localhost:3000")
  const [apiHealth, setApiHealth] = useState("/health")
  const [apiStartCmd, setApiStartCmd] = useState("pnpm run dev")
  const [apiCwd, setApiCwd] = useState("")
  const [apiExclusive, setApiExclusive] = useState(false)

  const { error: toastError, success: toastSuccess } = useToast()

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (!isOpen) return

    if (overridePlatform && targetEnv) {
      setPlatform(overridePlatform.type)
      const currentPivot = allEnvPlatforms?.find(
        (ep) => ep.envName === targetEnv && ep.platformId === overridePlatform.id,
      )
      const cfg = (currentPivot?.configJson || overridePlatform.configJson) as
        | Record<string, unknown>
        | undefined

      if (overridePlatform.type === "web") {
        setWebName(overridePlatform.name)
        setWebUrl(currentPivot?.url ?? overridePlatform.url ?? "http://localhost:5173")
        setWebStartCmd(currentPivot?.startCmd ?? overridePlatform.startCmd ?? "")
        setWebCwd(currentPivot?.cwd ?? overridePlatform.cwd ?? "")
        setWebModules(
          (cfg?.modules as string) ?? overridePlatform.modules ?? ".e2e/modules/web",
        )
        setWebSlowMo(currentPivot?.slowMo ?? overridePlatform.slowMo ?? 50)
        setWebHeadless(currentPivot?.headless ?? overridePlatform.headless ?? false)
        setWebExclusive(
          (cfg?.exclusive as boolean) ?? overridePlatform.exclusive ?? false,
        )
      } else if (overridePlatform.type === "android") {
        setMobileName(overridePlatform.name)
        setMobileAppId(currentPivot?.appId ?? overridePlatform.appId ?? "com.example.app")
        setMobileFlows((cfg?.flows as string) ?? overridePlatform.flows ?? ".e2e/flows")
        setMobileInstallCmd(
          (cfg?.installCmd as string) ??
            overridePlatform.installCmd ??
            "./gradlew installDebug",
        )
        setMobileCwd(currentPivot?.cwd ?? overridePlatform.cwd ?? "")
        const ports =
          (cfg?.reversePorts as number[]) ?? overridePlatform.reversePorts ?? []
        setMobileReversePorts(ports.length > 0 ? ports.join(", ") : "8080")
        const perms =
          (cfg?.grantPermissions as string[]) ??
          overridePlatform.grantPermissions ??
          []
        setMobileGrantPermissions(perms.join(", "))
      } else if (overridePlatform.type === "api") {
        setApiName(overridePlatform.name)
        setApiUrl(currentPivot?.url ?? overridePlatform.url ?? "http://localhost:3000")
        setApiHealth(currentPivot?.health ?? overridePlatform.health ?? "/health")
        setApiStartCmd(currentPivot?.startCmd ?? overridePlatform.startCmd ?? "")
        setApiCwd(currentPivot?.cwd ?? overridePlatform.cwd ?? "")
        setApiExclusive(
          (cfg?.exclusive as boolean) ?? overridePlatform.exclusive ?? false,
        )
      }
    } else {
      setPlatform("web")
      setWebName("web")
      setWebUrl("http://localhost:5173")
      setWebStartCmd("pnpm run dev")
      setWebCwd("")
      setWebModules(".e2e/modules/web")
      setWebSlowMo(50)
      setWebHeadless(false)
      setWebExclusive(false)

      setMobileName("app")
      setMobileAppId("com.example.app")
      setMobileFlows(".e2e/flows")
      setMobileInstallCmd("./gradlew installDebug")
      setMobileCwd("")
      setMobileReversePorts("8080")
      setMobileGrantPermissions("")

      setApiName("api")
      setApiUrl("http://localhost:3000")
      setApiHealth("/health")
      setApiStartCmd("pnpm run dev")
      setApiCwd("")
      setApiExclusive(false)

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
    }
  }, [isOpen, overridePlatform, targetEnv, allEnvPlatforms])

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

  const handleResetOverrides = async () => {
    if (!overridePlatform || !targetEnv) return
    setIsApplying(true)
    try {
      await deleteEnvPlatform(targetEnv, overridePlatform.id)
      toastSuccess(
        `Reset overrides for "${overridePlatform.name}" in ${capitalizedEnv}`,
        "Defaults Restored",
      )
      onSaved()
      onClose()
    } catch (err) {
      toastError((err as Error).message, "Failed to Reset Overrides")
    } finally {
      setIsApplying(false)
    }
  }

  const handleSubmit = async () => {
    if (isOverride && overridePlatform && targetEnv) {
      const currentPivot = allEnvPlatforms?.find(
        (ep) => ep.envName === targetEnv && ep.platformId === overridePlatform.id,
      )
      const isPlatEnabled = currentPivot
        ? currentPivot.enabled
        : overridePlatform.enabled !== false

      let payload: EnvPlatformRecord

      if (platform === "web") {
        if (!webUrl.trim()) {
          toastError("Please enter an application URL", "Validation Error")
          return
        }
        payload = {
          envName: targetEnv,
          platformId: overridePlatform.id,
          enabled: isPlatEnabled,
          url: webUrl.trim(),
          startCmd: webStartCmd.trim(),
          cwd: webCwd.trim(),
          headless: webHeadless,
          slowMo: webSlowMo || undefined,
          configJson: {
            modules: webModules.trim() || undefined,
            exclusive: webExclusive,
          },
        }
      } else if (platform === "android") {
        if (!mobileAppId.trim()) {
          toastError("Please enter an Application ID", "Validation Error")
          return
        }
        const ports = mobileReversePorts
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n) && n > 0)

        const permissions = mobileGrantPermissions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)

        payload = {
          envName: targetEnv,
          platformId: overridePlatform.id,
          enabled: isPlatEnabled,
          cwd: mobileCwd.trim(),
          appId: mobileAppId.trim(),
          configJson: {
            flows: mobileFlows.trim() || undefined,
            installCmd: mobileInstallCmd.trim() || undefined,
            reversePorts: ports.length > 0 ? ports : undefined,
            grantPermissions: permissions.length > 0 ? permissions : undefined,
          },
        }
      } else {
        if (!apiUrl.trim()) {
          toastError("Please enter a service endpoint URL", "Validation Error")
          return
        }
        payload = {
          envName: targetEnv,
          platformId: overridePlatform.id,
          enabled: isPlatEnabled,
          url: apiUrl.trim(),
          health: apiHealth.trim(),
          startCmd: apiStartCmd.trim(),
          cwd: apiCwd.trim(),
          configJson: {
            exclusive: apiExclusive,
          },
        }
      }

      setIsApplying(true)
      try {
        await saveEnvPlatform(payload)
        toastSuccess(
          `Saved overrides for "${overridePlatform.name}" in ${capitalizedEnv}`,
          "Overrides Saved",
        )
        onSaved()
        onClose()
      } catch (err) {
        toastError((err as Error).message, "Failed to Save Overrides")
      } finally {
        setIsApplying(false)
      }
      return
    }

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
        exclusive: webExclusive,
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

      const permissions = mobileGrantPermissions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

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
        grantPermissions: permissions.length > 0 ? permissions : undefined,
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
        exclusive: apiExclusive,
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
          {isOverride ? (
            <>
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              <span>
                Platform Overrides: {overridePlatform?.name} ({capitalizedEnv})
              </span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4 text-primary" />
              <span>Add Platform</span>
            </>
          )}
        </div>
      }
      description={
        isOverride
          ? `Configure environment-specific settings for "${capitalizedEnv}". Values take precedence over default platform settings.`
          : "Configure a new platform (Web, Android, or REST API) for this project."
      }
      footer={
        <div className="flex items-center justify-between w-full">
          {isOverride ? (
            hasExistingOverrides ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={handleResetOverrides}
                disabled={isApplying}
                icon={<RotateCcw className="w-3.5 h-3.5 text-warning" />}
              >
                Reset Defaults
              </Button>
            ) : (
              <div />
            )
          ) : (
            <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scaffoldFiles}
                onChange={(e) => setScaffoldFiles(e.target.checked)}
                className="rounded-xs border-border bg-input text-primary focus:ring-0"
              />
              <span>Scaffold starter test files and smoke scenario</span>
            </label>
          )}

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
              {isOverride ? "Save Overrides" : "Add Platform"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Workspace Detected Banner */}
        {detected.length > 0 && !isOverride && (
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
              disabled={isOverride}
              onClick={() => !isOverride && setPlatform("web")}
              className={`p-3 rounded-xs border text-left transition-all flex flex-col justify-between ${
                isOverride ? "cursor-default" : "cursor-pointer"
              } ${
                platform === "web"
                  ? "border-primary bg-primary/10 shadow-xs"
                  : isOverride
                    ? "border-border bg-sidebar/50 opacity-40"
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
              disabled={isOverride}
              onClick={() => !isOverride && setPlatform("android")}
              className={`p-3 rounded-xs border text-left transition-all flex flex-col justify-between ${
                isOverride ? "cursor-default" : "cursor-pointer"
              } ${
                platform === "android"
                  ? "border-primary bg-primary/10 shadow-xs"
                  : isOverride
                    ? "border-border bg-sidebar/50 opacity-40"
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
              disabled={isOverride}
              onClick={() => !isOverride && setPlatform("api")}
              className={`p-3 rounded-xs border text-left transition-all flex flex-col justify-between ${
                isOverride ? "cursor-default" : "cursor-pointer"
              } ${
                platform === "api"
                  ? "border-primary bg-primary/10 shadow-xs"
                  : isOverride
                    ? "border-border bg-sidebar/50 opacity-40"
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
                hint={isOverride ? "Platform identifier (read-only)" : "Identifier in scenario steps e.g. web"}
                required
              >
                <Input
                  value={webName}
                  onChange={(e) => setWebName(e.target.value)}
                  placeholder="e.g. web"
                  mono
                  disabled={isOverride}
                />
              </FormField>

              <FormField
                label="Application URL"
                hint={isOverride ? `Address where web app runs in ${capitalizedEnv}` : "Address where web app runs"}
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
                hint={isOverride ? `Command to launch in ${capitalizedEnv} (leave empty if already running)` : "Optional command to launch app automatically"}
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

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-fg-bright cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={webHeadless}
                  onChange={(e) => setWebHeadless(e.target.checked)}
                  className="rounded-xs border-border bg-input text-primary focus:ring-0"
                />
                <span>Run browser in headless mode (no visual browser window)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-fg-bright cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={webExclusive}
                  onChange={(e) => setWebExclusive(e.target.checked)}
                  className="rounded-xs border-border bg-input text-primary focus:ring-0"
                />
                <span>Exclusive service (never reuse an already running instance; always start freshly)</span>
              </label>
            </div>
          </div>
        )}

        {/* Android Configuration Form (At most 2 columns on desktop, 1 on mobile) */}
        {platform === "android" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Target Name"
                hint={isOverride ? "Platform identifier (read-only)" : "Identifier in scenario steps e.g. app"}
                required
              >
                <Input
                  value={mobileName}
                  onChange={(e) => setMobileName(e.target.value)}
                  placeholder="e.g. app"
                  mono
                  disabled={isOverride}
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
                  placeholder="e.g. 8080, 8787"
                  mono
                />
              </FormField>
            </div>

            <FormField
              label="Grant Runtime Permissions"
              hint="Android permissions to auto-grant on launch (comma separated)"
            >
              <Input
                value={mobileGrantPermissions}
                onChange={(e) => setMobileGrantPermissions(e.target.value)}
                placeholder="e.g. android.permission.POST_NOTIFICATIONS, android.permission.CAMERA"
                mono
              />
            </FormField>
          </div>
        )}

        {/* REST API Configuration Form (At most 2 columns on desktop, 1 on mobile) */}
        {platform === "api" && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Target Name"
                hint={isOverride ? "Platform identifier (read-only)" : "Identifier in scenario steps e.g. api"}
                required
              >
                <Input
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="e.g. api"
                  mono
                  disabled={isOverride}
                />
              </FormField>

              <FormField
                label="Service Endpoint URL"
                hint={isOverride ? `Root URL where the API runs in ${capitalizedEnv}` : "Root URL where the API service runs"}
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
                hint={isOverride ? `Command to launch in ${capitalizedEnv} (leave empty if backend already running)` : "Optional command to launch backend service"}
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

            <label className="flex items-center gap-2 text-xs text-fg-bright cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={apiExclusive}
                onChange={(e) => setApiExclusive(e.target.checked)}
                className="rounded-xs border-border bg-input text-primary focus:ring-0"
              />
              <span>Exclusive service (never reuse an already running instance; always start freshly)</span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}
