import {
  Check,
  Database,
  Edit,
  Globe,
  HardDrive,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  SlidersHorizontal,
  Smartphone,
  Terminal,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import {
  deleteEnvironment,
  deleteFixture,
  deletePlatform,
  fetchEnvPlatforms,
  runFixtureTest,
  saveEnvironment,
  saveEnvPlatform,
  saveFixture,
  setActiveEnvironment,
} from "../api.ts"
import type {
  ConfigMeta,
  EnvironmentMeta,
  EnvPlatformRecord,
  PlatformRecord,
  PlatformWithEnvOverrides,
} from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { useConfirmDialog } from "./ConfirmModal.tsx"
import { EnvironmentModal } from "./EnvironmentModal.tsx"
import {
  EnvVariablesEditor,
  type EnvVarRow,
  envRowsToRecord,
  recordToEnvRows,
} from "./EnvVariablesEditor.tsx"
import { FormField, Input } from "./FormControls.tsx"
import { Modal } from "./Modal.tsx"
import { PlatformModal } from "./PlatformModal.tsx"
import { TabButton, useUrlTab } from "./Tabs.tsx"
import { useToast } from "./Toast.tsx"

type ConfigViewProps = {
  config: ConfigMeta | null
  onConfigReload: () => void
}

type ConfigSection = "environments" | "platforms" | "fixtures" | "database"
const VALID_SECTIONS = ["environments", "platforms", "fixtures", "database"] as const

type FixtureModalState = {
  isOpen: boolean
  isEditing: boolean
  name: string
  cmd: string
  cwd: string
}

type FixtureRunState = {
  isOpen: boolean
  name: string
  cmd: string
  isRunning: boolean
  exitCode?: number
  output?: string
  durationMs?: number
}

export function ConfigView({ config, onConfigReload }: ConfigViewProps) {
  const [activeSection, setActiveSection] = useUrlTab<ConfigSection>("sub", "environments", VALID_SECTIONS)

  // Dedicated Modals State
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false)
  const [overrideModalPlat, setOverrideModalPlat] = useState<PlatformWithEnvOverrides | null>(null)
  const [isAddEnvOpen, setIsAddEnvOpen] = useState(false)

  // Fixture modals state
  const [fixtureModal, setFixtureModal] = useState<FixtureModalState>({
    isOpen: false,
    isEditing: false,
    name: "",
    cmd: "",
    cwd: "",
  })
  const [isSavingFixture, setIsSavingFixture] = useState(false)

  const [fixtureRunState, setFixtureRunState] = useState<FixtureRunState>({
    isOpen: false,
    name: "",
    cmd: "",
    isRunning: false,
  })

  const [isSwitchingEnv, setIsSwitchingEnv] = useState(false)
  const { error: toastError, success: toastSuccess } = useToast()
  const { confirm, ConfirmDialog } = useConfirmDialog()

  // Environments resolution
  const environments: Record<string, EnvironmentMeta> =
    config?.environments && Object.keys(config.environments).length > 0
      ? config.environments
      : {
          dev: {
            description: "Local development baseline",
            env: { APP_ENV: "dev" },
          },
        }

  const envKeys = Object.keys(environments)
  const activeEnvName =
    config?.activeEnvironment || config?.defaultEnvironment || envKeys[0] || "dev"

  const [urlEnv, setUrlEnv] = useUrlTab<string>("env", activeEnvName)
  const selectedEnvName = environments[urlEnv] ? urlEnv : activeEnvName
  const selectedEnvData = environments[selectedEnvName] || {
    description: "Default environment",
  }

  // Env-Platform pivot state
  const [allEnvPlatforms, setAllEnvPlatforms] = useState<EnvPlatformRecord[]>([])

  // In-page Environment Profile Form state
  const [envDescription, setEnvDescription] = useState("")
  const [envScenarios, setEnvScenarios] = useState("")
  const [envFlows, setEnvFlows] = useState("")
  const [envResults, setEnvResults] = useState("")
  const [envRows, setEnvRows] = useState<EnvVarRow[]>([])
  const [isSavingEnv, setIsSavingEnv] = useState(false)

  // Sync profile form when selected environment changes
  useEffect(() => {
    setEnvDescription(selectedEnvData.description || "")
    setEnvScenarios(selectedEnvData.scenarios || config?.scenariosPath || ".e2e/scenarios")
    setEnvFlows(selectedEnvData.flows || ".e2e/flows")
    setEnvResults(selectedEnvData.results || config?.resultsPath || ".e2e/results")
    setEnvRows(
      recordToEnvRows(
        selectedEnvData.env || { APP_ENV: selectedEnvName },
      ),
    )
  }, [selectedEnvName, selectedEnvData, config?.scenariosPath, config?.resultsPath])

  const handleSaveEnvProfile = async () => {
    const parsedVars = envRowsToRecord(envRows)

    setIsSavingEnv(true)
    try {
      await saveEnvironment(selectedEnvName, {
        description: envDescription.trim() || undefined,
        scenarios: envScenarios.trim() || undefined,
        flows: envFlows.trim() || undefined,
        results: envResults.trim() || undefined,
        env: parsedVars,
      })
      toastSuccess(`Updated profile "${selectedEnvName}"`, "Environment Saved")
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Profile")
    } finally {
      setIsSavingEnv(false)
    }
  }

  const loadEnvPlatforms = async (envName?: string) => {
    try {
      const data = await fetchEnvPlatforms(envName)
      if (data.envPlatforms) {
        setAllEnvPlatforms(data.envPlatforms)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadEnvPlatforms()
  }, [])

  useEffect(() => {
    if (config?.envPlatforms && config.envPlatforms.length > 0) {
      setAllEnvPlatforms(config.envPlatforms)
    }
  }, [config?.envPlatforms])


  const handleTogglePlatform = async (platformId: string, currentEnabled: boolean, platformName: string) => {
    try {
      await saveEnvPlatform({
        envName: selectedEnvName,
        platformId,
        enabled: !currentEnabled,
      })
      const statusTitle = !currentEnabled ? "Enabled" : "Disabled"
      const envTitle = selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)
      toastSuccess(
        `Platform "${platformName}" ${statusTitle} in ${envTitle}`,
        "Platform Status Updated",
      )
      await loadEnvPlatforms(selectedEnvName)
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Update Platform Status")
    }
  }

  const handleSwitchEnvironment = async (envName: string) => {
    if (envName === activeEnvName) return
    setIsSwitchingEnv(true)
    try {
      await setActiveEnvironment(envName)
      setUrlEnv(envName)
      const capitalized = envName.charAt(0).toUpperCase() + envName.slice(1)
      toastSuccess(`Switched active target to ${capitalized}`, "Environment Switched")
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Switch Environment")
    } finally {
      setIsSwitchingEnv(false)
    }
  }

  const handleDeleteEnvironment = (name: string) => {
    if (Object.keys(environments).length <= 1) {
      toastError("Cannot delete the only environment", "Action Restricted")
      return
    }
    confirm({
      title: "Remove Environment",
      message: (
        <span>
          Are you sure you want to remove environment{" "}
          <strong className="text-fg-bright font-mono">"{name}"</strong>? This will remove all associated overrides.
        </span>
      ),
      confirmText: "Remove Environment",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteEnvironment(name)
          toastSuccess(`Environment "${name}" removed`, "Environment Removed")
          const remaining = Object.keys(environments).filter((n) => n !== name)
          if (selectedEnvName === name && remaining.length > 0) {
            setUrlEnv(remaining[0])
          }
          if (activeEnvName === name && remaining.length > 0) {
            await setActiveEnvironment(remaining[0])
          }
          onConfigReload()
        } catch (err) {
          toastError((err as Error).message, "Failed to Delete Environment")
        }
      },
    })
  }

  const handleDeletePlatform = (targetName: string) => {
    confirm({
      title: "Remove Platform",
      message: (
        <span>
          Are you sure you want to remove platform{" "}
          <strong className="text-fg-bright font-mono">"{targetName}"</strong>?
        </span>
      ),
      confirmText: "Remove Platform",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deletePlatform(targetName)
          toastSuccess(`Platform "${targetName}" removed`, "Platform Removed")
          onConfigReload()
        } catch (err) {
          toastError((err as Error).message, "Failed to Remove Platform")
        }
      },
    })
  }

  const handleOpenAddFixture = () => {
    setFixtureModal({
      isOpen: true,
      isEditing: false,
      name: "",
      cmd: "",
      cwd: "",
    })
  }

  const handleOpenEditFixture = (name: string) => {
    const meta = config?.fixturesMap?.[name]
    setFixtureModal({
      isOpen: true,
      isEditing: true,
      name,
      cmd: meta?.cmd || "",
      cwd: meta?.cwd || "",
    })
  }

  const handleSaveFixture = async () => {
    if (!fixtureModal.name.trim()) {
      toastError("Fixture name is required", "Validation Error")
      return
    }
    if (!fixtureModal.cmd.trim()) {
      toastError("Shell command is required", "Validation Error")
      return
    }

    setIsSavingFixture(true)
    try {
      await saveFixture(fixtureModal.name.trim(), {
        cmd: fixtureModal.cmd.trim(),
        cwd: fixtureModal.cwd.trim() || undefined,
      })
      toastSuccess(`Fixture "${fixtureModal.name.trim()}" saved`, "Fixture Saved")
      setFixtureModal((prev) => ({ ...prev, isOpen: false }))
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Fixture")
    } finally {
      setIsSavingFixture(false)
    }
  }

  const handleDeleteFixture = (name: string) => {
    confirm({
      title: "Remove Fixture",
      message: (
        <span>
          Are you sure you want to remove fixture{" "}
          <strong className="text-fg-bright font-mono">"{name}"</strong>?
        </span>
      ),
      confirmText: "Remove Fixture",
      variant: "danger",
      onConfirm: async () => {
        try {
          await deleteFixture(name)
          toastSuccess(`Fixture "${name}" removed`, "Fixture Removed")
          onConfigReload()
        } catch (err) {
          toastError((err as Error).message, "Failed to Delete Fixture")
        }
      },
    })
  }

  const handleTestRunFixture = async (name: string) => {
    const cmd = config?.fixturesMap?.[name]?.cmd || ""
    setFixtureRunState({
      isOpen: true,
      name,
      cmd,
      isRunning: true,
      output: undefined,
      exitCode: undefined,
    })

    try {
      const res = await runFixtureTest({ name })
      setFixtureRunState((prev) => ({
        ...prev,
        isRunning: false,
        exitCode: res.exitCode,
        output: res.output,
        durationMs: res.durationMs,
      }))
      if (res.exitCode === 0) {
        toastSuccess(`Fixture "${name}" executed successfully (${res.durationMs}ms)`, "Command Succeeded")
      } else {
        toastError(`Command exited with code ${res.exitCode}`, "Fixture Failed")
      }
    } catch (err) {
      setFixtureRunState((prev) => ({
        ...prev,
        isRunning: false,
        exitCode: 1,
        output: (err as Error).message,
      }))
      toastError((err as Error).message, "Execution Error")
    }
  }

  // Get list of all fixtures
  const fixturesList = Object.keys(config?.fixturesMap ?? {}).length > 0
    ? Object.entries(config?.fixturesMap ?? {}).map(([name, fix]) => ({
        name,
        cmd: fix.cmd,
        cwd: fix.cwd,
      }))
    : (config?.fixtures ?? []).map((name) => ({
        name,
        cmd: "echo (shell command not specified)",
        cwd: undefined,
      }))

  const basePlatforms: PlatformRecord[] =
    config?.platforms && config.platforms.length > 0
      ? config.platforms
      : Object.entries(config?.targets ?? {}).map(([name, target], idx) => {
          const platId = `plat-${name}`
          const srv = config?.services?.[target.service]
          return {
            id: platId,
            name,
            type: target.driver === "mobile" ? "android" : target.driver === "web" ? "web" : "api",
            orderNum: idx + 1,
            url: srv?.url,
            serviceName: target.service,
            health: srv?.health,
            startCmd: srv?.startCmd,
            cwd: srv?.startCwd,
            modules: target.modules,
            slowMo: target.slowMo,
            headless: target.headless,
            exclusive: srv?.exclusive,
            appId: target.appId,
            flows: target.flows,
            installCmd: target.install?.cmd,
            grantPermissions: target.grantPermissions,
            reversePorts: target.reversePorts,
          }
        })

  const displayPlatforms: PlatformWithEnvOverrides[] = basePlatforms.map((p) => {
    const pivot = allEnvPlatforms.find(
      (ep) => ep.envName === selectedEnvName && ep.platformId === p.id,
    )
    const overriddenFields: string[] = []
    let effectiveUrl = p.url
    if (pivot && pivot.url !== undefined && pivot.url !== null) {
      effectiveUrl = pivot.url
      if (pivot.url !== p.url) overriddenFields.push("url")
    }

    let effectiveHealth = p.health
    if (pivot && pivot.health !== undefined && pivot.health !== null) {
      effectiveHealth = pivot.health
      if (pivot.health !== p.health) overriddenFields.push("health")
    }

    let effectiveStartCmd = p.startCmd
    if (pivot && pivot.startCmd !== undefined) {
      effectiveStartCmd = pivot.startCmd || undefined
      if (pivot.startCmd !== p.startCmd) overriddenFields.push("startCmd")
    }

    let effectiveCwd = p.cwd
    if (pivot && pivot.cwd !== undefined && pivot.cwd !== null) {
      effectiveCwd = pivot.cwd
      if (pivot.cwd !== p.cwd) overriddenFields.push("cwd")
    }

    let effectiveHeadless = p.headless
    if (pivot && pivot.headless !== undefined && pivot.headless !== null) {
      effectiveHeadless = pivot.headless
      if (pivot.headless !== p.headless) overriddenFields.push("headless")
    }

    let effectiveSlowMo = p.slowMo
    if (pivot && pivot.slowMo !== undefined && pivot.slowMo !== null) {
      effectiveSlowMo = pivot.slowMo
      if (pivot.slowMo !== p.slowMo) overriddenFields.push("slowMo")
    }

    let effectiveAppId = p.appId
    if (pivot && pivot.appId !== undefined && pivot.appId !== null) {
      effectiveAppId = pivot.appId
      if (pivot.appId !== p.appId) overriddenFields.push("appId")
    }

    return {
      ...p,
      url: effectiveUrl,
      health: effectiveHealth,
      startCmd: effectiveStartCmd,
      cwd: effectiveCwd,
      headless: effectiveHeadless,
      slowMo: effectiveSlowMo,
      appId: effectiveAppId,
      envName: selectedEnvName,
      enabled: pivot ? pivot.enabled : true,
      isLinked: Boolean(pivot),
      hasOverrides: overriddenFields.length > 0,
      overriddenFields,
    } as PlatformWithEnvOverrides
  })

  const platformsCount = displayPlatforms.length

  return (
    <div className="flex-1 flex flex-col h-full bg-editor overflow-hidden select-text">
      {/* Top Header Bar with Segmented Pill Tabs */}
      <div className="px-5 py-2.5 border-b border-border bg-titlebar flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-fg-bright">Configuration</span>
            <span className="text-xs font-mono text-fg-muted bg-sidebar px-1.5 py-0.5 rounded-xs border border-border">
              {config?.dbPath || ".e2e/e2e.db"}
            </span>
            <Badge variant={config?.dbExists ? "success" : "neutral"} size="xs">
              {config?.dbExists ? "Connected" : "Not Initialized"}
            </Badge>
          </div>
        </div>

        {/* Sub-resource Segmented Pill Navigation */}
        <div className="flex items-center gap-1 bg-activity p-1 rounded-sm border border-border">
          <TabButton
            variant="pills"
            active={activeSection === "environments"}
            onClick={() => setActiveSection("environments")}
            icon={<Globe className="w-3.5 h-3.5" />}
            badge={<Badge variant={activeSection === "environments" ? "primary" : "neutral"} size="xs">{envKeys.length}</Badge>}
          >
            Environments
          </TabButton>
          <TabButton
            variant="pills"
            active={activeSection === "platforms"}
            onClick={() => setActiveSection("platforms")}
            icon={<Layers className="w-3.5 h-3.5" />}
            badge={<Badge variant={activeSection === "platforms" ? "primary" : "neutral"} size="xs">{platformsCount}</Badge>}
          >
            Platforms
          </TabButton>
          <TabButton
            variant="pills"
            active={activeSection === "fixtures"}
            onClick={() => setActiveSection("fixtures")}
            icon={<Terminal className={`w-3.5 h-3.5 ${activeSection === "fixtures" ? "text-white" : "text-warning"}`} />}
            badge={<Badge variant={activeSection === "fixtures" ? "primary" : "neutral"} size="xs">{fixturesList.length}</Badge>}
          >
            Fixtures
          </TabButton>
          <TabButton
            variant="pills"
            active={activeSection === "database"}
            onClick={() => setActiveSection("database")}
            icon={<Database className={`w-3.5 h-3.5 ${activeSection === "database" ? "text-white" : "text-primary"}`} />}
          >
            Database & Storage
          </TabButton>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onConfigReload()}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Reload
          </Button>
        </div>
      </div>

      {/* Main Tabbed Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* SUB-TAB 1: ENVIRONMENTS (Master-Detail Split View) */}
        {activeSection === "environments" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Environments Directory List */}
            <div className="w-72 border-r border-border bg-sidebar/50 flex flex-col shrink-0">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold text-fg-bright">Profiles</span>
                  <Badge variant="neutral" size="xs">{envKeys.length}</Badge>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setIsAddEnvOpen(true)}
                  icon={<Plus className="w-3 h-3" />}
                >
                  Add Profile
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {envKeys.map((envName) => {
                  const isSelected = envName === selectedEnvName
                  const isActive = envName === activeEnvName
                  const isDefault = envName === config?.defaultEnvironment
                  const data = environments[envName]
                  const capitalized = envName.charAt(0).toUpperCase() + envName.slice(1)

                  return (
                    <button
                      type="button"
                      key={envName}
                      onClick={() => setUrlEnv(envName)}
                      className={`w-full text-left p-3 rounded-xs border transition-all cursor-pointer flex flex-col gap-1.5 ${
                        isSelected
                          ? "bg-primary/10 border-primary text-fg-bright shadow-xs"
                          : "bg-sidebar border-border hover:bg-hover hover:border-border-light text-fg"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{capitalized}</span>
                        <div className="flex items-center gap-1">
                          {isActive && (
                            <Badge variant="success" size="xs">
                              Active Target
                            </Badge>
                          )}
                          {isDefault && !isActive && (
                            <Badge variant="neutral" size="xs">
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                      {data?.description && (
                        <p className="text-xs text-fg-muted truncate">{data.description}</p>
                      )}
                      {data?.url && (
                        <div className="text-xs font-mono text-fg-muted truncate">
                          {data.url}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right Column: Selected Environment Details & Inspector */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Detail Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-fg-bright">
                      {selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)} Profile
                    </h2>
                    {selectedEnvName === activeEnvName ? (
                      <Badge variant="success" size="xs">
                        Active Target
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-fg-muted mt-1">
                    {selectedEnvData.description || "Testing profile configuration"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedEnvName !== activeEnvName && (
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => handleSwitchEnvironment(selectedEnvName)}
                      isLoading={isSwitchingEnv}
                      icon={<Play className="w-3 h-3 text-white" />}
                    >
                      Set as Active Target
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={handleSaveEnvProfile}
                    isLoading={isSavingEnv}
                    icon={<Save className="w-3.5 h-3.5" />}
                  >
                    Save Profile
                  </Button>
                  {envKeys.length > 1 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleDeleteEnvironment(selectedEnvName)}
                      className="text-error hover:text-error hover:bg-error-bg"
                      icon={<Trash2 className="w-3 h-3" />}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {/* In-Page Environment Profile Editor (strictly max 2 columns) */}
              <div className="bg-sidebar border border-border rounded-xs p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <div>
                      <h3 className="text-xs font-bold text-fg-bright">
                        Profile Configuration
                      </h3>
                      <p className="text-xs text-fg-muted">
                        Directories and environment variables for the {selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)} profile.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-fg-muted">
                    Saved in SQLite database
                  </span>
                </div>

                <FormField
                  label="Description"
                  hint="Human-readable summary of this environment profile"
                >
                  <Input
                    value={envDescription}
                    onChange={(e) => setEnvDescription(e.target.value)}
                    placeholder="e.g. Local development baseline"
                  />
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Scenarios Folder"
                    hint="Folder where test scenarios reside"
                  >
                    <Input
                      value={envScenarios}
                      onChange={(e) => setEnvScenarios(e.target.value)}
                      placeholder="e.g. e2e/scenarios"
                      mono
                    />
                  </FormField>

                  <FormField
                    label="Flows Folder"
                    hint="Folder where reusable action flows reside"
                  >
                    <Input
                      value={envFlows}
                      onChange={(e) => setEnvFlows(e.target.value)}
                      placeholder="e.g. .e2e/flows"
                      mono
                    />
                  </FormField>
                </div>

                <FormField
                  label="Results Folder"
                  hint="Destination folder for test artifacts and run outputs"
                >
                  <Input
                    value={envResults}
                    onChange={(e) => setEnvResults(e.target.value)}
                    placeholder="e.g. e2e/results"
                    mono
                  />
                </FormField>

                <EnvVariablesEditor
                  rows={envRows}
                  onChange={setEnvRows}
                  disabled={isSavingEnv}
                />

                <div className="flex items-center justify-end pt-2 border-t border-border">
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={handleSaveEnvProfile}
                    isLoading={isSavingEnv}
                    icon={<Save className="w-3.5 h-3.5" />}
                  >
                    Save Profile Changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: PLATFORMS */}
        {activeSection === "platforms" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-fg-bright flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-primary" /> Configured Platforms
                  </h2>
                  <Badge variant="neutral" size="xs">{platformsCount} Configured</Badge>
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  Target automation platforms for Playwright (Web), ADB (Mobile), and REST API HTTP calls.
                </p>
              </div>

              <Button
                size="xs"
                variant="primary"
                onClick={() => setIsPlatformModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Platform
              </Button>
            </div>

            {/* Environment Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-sidebar p-3 rounded-xs border border-border shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-bright">
                  <Globe className="w-4 h-4 text-primary" />
                  <span>Target Environment:</span>
                </div>
                <div className="inline-flex items-center p-0.5 rounded-sm bg-activity border border-border">
                  {envKeys.map((envName) => {
                    const isSelected = envName === selectedEnvName
                    const isActive = envName === activeEnvName
                    const capitalized = envName.charAt(0).toUpperCase() + envName.slice(1)
                    return (
                      <TabButton
                        key={envName}
                        variant="pills"
                        active={isSelected}
                        onClick={() => setUrlEnv(envName)}
                        badge={
                          isActive ? (
                            <Badge variant="success" size="xs">
                              Active
                            </Badge>
                          ) : undefined
                        }
                      >
                        {capitalized}
                      </TabButton>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <span>Selected Environment:</span>
                <span className="font-mono text-fg-bright font-bold">
                  {selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)}
                </span>
                {selectedEnvName === activeEnvName ? (
                  <Badge variant="success" size="xs">
                    Active Target
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="xs">
                    Profile
                  </Badge>
                )}
              </div>
            </div>

            {platformsCount === 0 ? (
              <div className="bg-sidebar border border-dashed border-border rounded-xs p-10 text-center space-y-3 max-w-lg mx-auto mt-8">
                <div className="w-12 h-12 rounded-full bg-editor border border-border flex items-center justify-center mx-auto text-fg-muted">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-fg-bright">No Platforms Configured Yet</h3>
                  <p className="text-xs text-fg-muted mt-1 leading-normal">
                    Add a platform (Web, Android, or REST API) to run scenario flows against your environments.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => setIsPlatformModalOpen(true)}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Platform
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayPlatforms.map((plat) => {
                  const driverStr = String(plat.type ?? "api")
                  const driverTitle =
                    driverStr === "web" ? "Web" : driverStr === "android" ? "Android" : "Api"
                  const variant =
                    plat.type === "api"
                      ? "driver-http"
                      : plat.type === "web"
                        ? "driver-web"
                        : "driver-mobile"

                  const isPlatEnabled = plat.enabled
                  const selectedEnvCapitalized =
                    selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)

                  return (
                    <div
                      key={plat.id}
                      className={`bg-sidebar border rounded-xs p-4 flex flex-col justify-between space-y-3 transition-colors shadow-xs ${
                        isPlatEnabled
                          ? "border-border hover:border-border-light"
                          : "border-border/60 opacity-75"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                          <div className="flex items-center gap-2">
                            {plat.type === "web" && <Globe className="w-4 h-4 text-primary" />}
                            {plat.type === "android" && (
                              <Smartphone className="w-4 h-4 text-success" />
                            )}
                            {plat.type === "api" && <Server className="w-4 h-4 text-info" />}
                            <span className="font-bold text-sm text-fg-bright">{plat.name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {plat.hasOverrides && (
                              <Badge variant="primary" size="xs">
                                Overridden
                              </Badge>
                            )}
                            {plat.exclusive && (
                              <Badge variant="neutral" size="xs">
                                Exclusive
                              </Badge>
                            )}
                            <Badge variant={isPlatEnabled ? "success" : "neutral"} size="xs">
                              {isPlatEnabled ? "Active" : "Disabled"}
                            </Badge>
                            <Badge variant={variant} size="xs">
                              {driverTitle}
                            </Badge>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 text-xs text-fg-muted">
                          {plat.type === "web" && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <span>Dev Server:</span>
                                  {plat.overriddenFields?.includes("url") && (
                                    <span className="text-xs text-primary font-semibold">(overridden)</span>
                                  )}
                                </span>
                                <span className="font-mono text-primary truncate max-w-[170px]">
                                  {plat.url || "Custom Target"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span>Step Modules:</span>
                                <span className="font-mono text-fg truncate max-w-[170px]">
                                  {plat.modules || ".e2e/modules/web"}
                                </span>
                              </div>
                              {typeof plat.slowMo === "number" && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1">
                                    <span>Slow-Mo:</span>
                                    {plat.overriddenFields?.includes("slowMo") && (
                                      <span className="text-xs text-primary font-semibold">(overridden)</span>
                                    )}
                                  </span>
                                  <span className="font-mono text-fg">{plat.slowMo}ms</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <span>Headless:</span>
                                  {plat.overriddenFields?.includes("headless") && (
                                    <span className="text-xs text-primary font-semibold">(overridden)</span>
                                  )}
                                </span>
                                <span className="font-mono text-fg">{plat.headless ? "Yes" : "No"}</span>
                              </div>
                              {plat.startCmd && (
                                <div className="text-xs font-mono text-fg-muted bg-editor/60 p-2 rounded-xs border border-border mt-1">
                                  <span className="text-fg-bright">$</span> {plat.startCmd}
                                  {plat.overriddenFields?.includes("startCmd") && (
                                    <span className="ml-2 text-xs text-primary">(overridden)</span>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {plat.type === "android" && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <span>Application ID:</span>
                                  {plat.overriddenFields?.includes("appId") && (
                                    <span className="text-xs text-primary font-semibold">(overridden)</span>
                                  )}
                                </span>
                                <span className="font-mono text-success truncate max-w-[170px]">
                                  {plat.appId}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span>Flows Folder:</span>
                                <span className="font-mono text-fg truncate max-w-[170px]">
                                  {plat.flows || ".e2e/flows"}
                                </span>
                              </div>
                              {plat.reversePorts && plat.reversePorts.length > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span>Reverse Ports:</span>
                                  <span className="font-mono text-fg">
                                    {plat.reversePorts.join(", ")}
                                  </span>
                                </div>
                              )}
                              {plat.grantPermissions && plat.grantPermissions.length > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span>Permissions:</span>
                                  <span className="font-mono text-fg truncate max-w-[160px]" title={plat.grantPermissions.join(", ")}>
                                    {plat.grantPermissions.join(", ")}
                                  </span>
                                </div>
                              )}
                              {plat.installCmd && (
                                <div className="text-xs font-mono text-fg-muted bg-editor/60 p-2 rounded-xs border border-border mt-1">
                                  <span className="text-fg-bright">$</span> {plat.installCmd}
                                </div>
                              )}
                            </>
                          )}

                          {plat.type === "api" && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <span>Endpoint URL:</span>
                                  {plat.overriddenFields?.includes("url") && (
                                    <span className="text-xs text-primary font-semibold">(overridden)</span>
                                  )}
                                </span>
                                <span className="font-mono text-info truncate max-w-[170px]">
                                  {plat.url}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1">
                                  <span>Health Check:</span>
                                  {plat.overriddenFields?.includes("health") && (
                                    <span className="text-xs text-primary font-semibold">(overridden)</span>
                                  )}
                                </span>
                                <span className="font-mono text-fg truncate max-w-[170px]">
                                  {plat.health || "/"}
                                </span>
                              </div>
                              {plat.startCmd && (
                                <div className="text-xs font-mono text-fg-muted bg-editor/60 p-2 rounded-xs border border-border mt-1">
                                  <span className="text-fg-bright">$</span> {plat.startCmd}
                                  {plat.overriddenFields?.includes("startCmd") && (
                                    <span className="ml-2 text-xs text-primary">(overridden)</span>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Environments Matrix for this platform */}
                      <div className="pt-2 border-t border-border space-y-1.5">
                        <span className="text-xs font-semibold text-fg-muted block">
                          Availability Across Environments
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {envKeys.map((eName) => {
                            const pivot = allEnvPlatforms.find(
                              (ep) => ep.envName === eName && ep.platformId === plat.id,
                            )
                            const isEnvPlatEnabled = pivot ? pivot.enabled : true
                            const capitalized = eName.charAt(0).toUpperCase() + eName.slice(1)
                            return (
                              <button
                                type="button"
                                key={eName}
                                onClick={() => setUrlEnv(eName)}
                                className="cursor-pointer transition-transform hover:scale-105"
                                title={`Switch to ${capitalized} environment`}
                              >
                                <Badge
                                  variant={isEnvPlatEnabled ? "success" : "neutral"}
                                  size="xs"
                                >
                                  {capitalized}: {isEnvPlatEnabled ? "Active" : "Disabled"}
                                </Badge>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="xs"
                            variant={plat.hasOverrides ? "primary" : "secondary"}
                            onClick={() => setOverrideModalPlat(plat)}
                            icon={<SlidersHorizontal className="w-3 h-3" />}
                          >
                            Overrides ({selectedEnvCapitalized})
                          </Button>
                          <Button
                            size="xs"
                            variant={isPlatEnabled ? "ghost" : "secondary"}
                            onClick={() => handleTogglePlatform(plat.id, isPlatEnabled, plat.name)}
                          >
                            {isPlatEnabled
                              ? `Disable in ${selectedEnvCapitalized}`
                              : `Enable in ${selectedEnvCapitalized}`}
                          </Button>
                        </div>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleDeletePlatform(plat.name)}
                          className="text-error hover:text-error hover:bg-error-bg"
                          icon={<Trash2 className="w-3 h-3" />}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 3: FIXTURES */}
        {activeSection === "fixtures" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-fg-bright flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-warning" /> Setup Fixtures
                  </h2>
                  <Badge variant="neutral" size="xs">{fixturesList.length} Fixtures</Badge>
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  Shell commands executed before scenario runs to prepare system state (e.g. seed database, start Docker).
                </p>
              </div>

              <Button
                size="xs"
                variant="primary"
                onClick={handleOpenAddFixture}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Fixture
              </Button>
            </div>

            {fixturesList.length === 0 ? (
              <div className="bg-sidebar border border-border border-dashed rounded-xs p-10 text-center space-y-3 max-w-lg mx-auto mt-8">
                <Terminal className="w-10 h-10 text-fg-muted mx-auto" />
                <div className="text-xs text-fg-muted leading-normal">
                  No fixtures configured. Add a shell command fixture (e.g.{" "}
                  <code className="text-fg font-mono">pnpm run db:seed</code>,{" "}
                  <code className="text-fg font-mono">python seed.py</code>) to prepare state before tests.
                </div>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={handleOpenAddFixture}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Create First Fixture
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {fixturesList.map((fix) => (
                  <div
                    key={fix.name}
                    className="bg-sidebar border border-border rounded-xs p-3.5 flex items-center justify-between gap-4 hover:border-border-light transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xs bg-editor flex items-center justify-center shrink-0 border border-border">
                        <Terminal className="w-4 h-4 text-warning" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-fg-bright">{fix.name}</span>
                          {fix.cwd && (
                            <span className="text-xs font-mono text-fg-muted bg-editor px-1.5 py-0.5 rounded-xs border border-border">
                              cwd: {fix.cwd}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-fg-muted truncate mt-0.5 max-w-xl">
                          $ {fix.cmd}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => handleTestRunFixture(fix.name)}
                        icon={<Play className="w-3 h-3 text-success" />}
                      >
                        Run Test
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleOpenEditFixture(fix.name)}
                        icon={<Edit className="w-3 h-3" />}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleDeleteFixture(fix.name)}
                        className="text-error hover:text-error hover:bg-error-bg"
                        icon={<Trash2 className="w-3 h-3" />}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: DATABASE & STORAGE */}
        {activeSection === "database" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-fg-bright flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-primary" /> SQLite Database & Storage
                  </h2>
                  <Badge variant={config?.dbExists ? "success" : "neutral"} size="xs">
                    {config?.dbExists ? "Connected" : "Not Initialized"}
                  </Badge>
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  Persistent SQLite database storage for environments, platforms, and orchestrator settings.
                </p>
              </div>
            </div>

            {/* Metrics Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-sidebar border border-border rounded-xs p-4">
                <span className="text-xs font-semibold text-fg-muted block mb-1">
                  Active Profile
                </span>
                <span className="text-base font-bold text-primary">
                  {activeEnvName.charAt(0).toUpperCase() + activeEnvName.slice(1)}
                </span>
                <p className="text-xs text-fg-muted mt-1">Current target for CLI & scenario runs</p>
              </div>

              <div className="bg-sidebar border border-border rounded-xs p-4">
                <span className="text-xs font-semibold text-fg-muted block mb-1">
                  Stored Environments
                </span>
                <span className="text-base font-bold text-fg-bright">{envKeys.length}</span>
                <p className="text-xs text-fg-muted mt-1">Total profiles configured in SQLite</p>
              </div>

              <div className="bg-sidebar border border-border rounded-xs p-4">
                <span className="text-xs font-semibold text-fg-muted block mb-1">
                  Stored Platforms
                </span>
                <span className="text-base font-bold text-fg-bright">{platformsCount}</span>
                <p className="text-xs text-fg-muted mt-1">Execution targets configured in SQLite</p>
              </div>
            </div>

            {/* Storage Details Card */}
            <div className="bg-sidebar border border-border rounded-xs p-5 space-y-4">
              <div className="flex items-center gap-2 font-bold text-xs text-fg-bright">
                <HardDrive className="w-4 h-4 text-primary" />
                <span>Storage Diagnostics & Locations</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-fg-muted block text-xs font-semibold mb-1">Database File:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-fg bg-editor p-2 rounded-xs border border-border flex-1 truncate">
                      {config?.dbPath || ".e2e/e2e.db"}
                    </span>
                    <Badge variant={config?.dbExists ? "success" : "neutral"} size="xs">
                      {config?.dbExists ? "Ready" : "Pending"}
                    </Badge>
                  </div>
                </div>

                <div>
                  <span className="text-fg-muted block text-xs font-semibold mb-1">Project Root Directory:</span>
                  <div className="font-mono text-fg-muted bg-editor p-2 rounded-xs border border-border truncate">
                    {config?.configDir ? ". (Workspace Root)" : "Workspace Root"}
                  </div>
                </div>

                <div className="pt-2 border-t border-border text-xs text-fg-muted leading-relaxed">
                  Configuration data is stored and loaded directly from SQLite. Test runs, preflight checks, and GUI dashboard mutations update this SQLite file with immediate effect without rewriting project source code.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Environment Modal */}
      {isAddEnvOpen && (
        <EnvironmentModal
          isOpen={isAddEnvOpen}
          dismissable={true}
          isInitialSetup={false}
          onClose={() => setIsAddEnvOpen(false)}
          onSaved={onConfigReload}
        />
      )}

      {/* Platform Modal (Add or Override) */}
      {(isPlatformModalOpen || Boolean(overrideModalPlat)) && (
        <PlatformModal
          isOpen={isPlatformModalOpen || Boolean(overrideModalPlat)}
          config={config ?? undefined}
          overridePlatform={overrideModalPlat}
          targetEnv={selectedEnvName}
          allEnvPlatforms={allEnvPlatforms}
          onClose={() => {
            setIsPlatformModalOpen(false)
            setOverrideModalPlat(null)
          }}
          onSaved={() => {
            loadEnvPlatforms(selectedEnvName)
            onConfigReload()
          }}
        />
      )}

      {/* Fixture Add / Edit Modal */}
      {fixtureModal.isOpen && (
        <Modal
          isOpen={fixtureModal.isOpen}
          onClose={() => setFixtureModal((prev) => ({ ...prev, isOpen: false }))}
          title={fixtureModal.isEditing ? "Edit Fixture" : "Add Setup Fixture"}
          description="Agnostic shell command to execute before running scenarios."
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setFixtureModal((prev) => ({ ...prev, isOpen: false }))}
                disabled={isSavingFixture}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={handleSaveFixture}
                isLoading={isSavingFixture}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Save Fixture
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <FormField label="Fixture Name" hint="Identifier in scenario setup list e.g. db:seed" required>
              <Input
                value={fixtureModal.name}
                onChange={(e) => setFixtureModal((prev) => ({ ...prev, name: e.target.value }))}
                disabled={fixtureModal.isEditing}
                placeholder="e.g. db:seed"
                mono
              />
            </FormField>

            <FormField label="Shell Command" hint="Command to execute in project terminal" required>
              <Input
                value={fixtureModal.cmd}
                onChange={(e) => setFixtureModal((prev) => ({ ...prev, cmd: e.target.value }))}
                placeholder="e.g. pnpm run db:seed"
                mono
              />
            </FormField>

            <FormField label="Working Directory (CWD)" hint="Optional relative path where command will run">
              <Input
                value={fixtureModal.cwd}
                onChange={(e) => setFixtureModal((prev) => ({ ...prev, cwd: e.target.value }))}
                placeholder="e.g. apps/backend (defaults to project root)"
                mono
              />
            </FormField>
          </div>
        </Modal>
      )}

      {/* Fixture Run Test Output Modal */}
      {fixtureRunState.isOpen && (
        <Modal
          isOpen={fixtureRunState.isOpen}
          onClose={() => setFixtureRunState((prev) => ({ ...prev, isOpen: false }))}
          title={
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-warning" />
              <span>Fixture Test: {fixtureRunState.name}</span>
            </div>
          }
          description={`$ ${fixtureRunState.cmd}`}
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {fixtureRunState.isRunning ? (
                  <Badge variant="warning" size="xs">Running</Badge>
                ) : fixtureRunState.exitCode === 0 ? (
                  <Badge variant="success" size="xs">Passed</Badge>
                ) : (
                  <Badge variant="danger" size="xs">Failed</Badge>
                )}
                {typeof fixtureRunState.durationMs === "number" && (
                  <span className="text-xs font-mono text-fg-muted">{fixtureRunState.durationMs}ms</span>
                )}
              </div>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => setFixtureRunState((prev) => ({ ...prev, isOpen: false }))}
              >
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            <div className="bg-editor p-3 rounded-xs border border-border font-mono text-xs overflow-x-auto max-h-80 whitespace-pre-wrap text-fg">
              {fixtureRunState.isRunning ? (
                <div className="flex items-center gap-2 text-fg-muted">
                  <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  <span>Executing shell command...</span>
                </div>
              ) : (
                fixtureRunState.output || "(no output returned)"
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog />
    </div>
  )
}
