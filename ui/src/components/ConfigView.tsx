import {
  Check,
  ChevronDown,
  ChevronUp,
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
  Settings2,
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
import type { ConfigMeta, EnvironmentMeta, EnvPlatformRecord, PlatformWithEnvOverrides } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { EnvironmentModal } from "./EnvironmentModal.tsx"
import { FormField, Input, NumberInput, TextArea } from "./FormControls.tsx"
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
  const [envPlatforms, setEnvPlatforms] = useState<PlatformWithEnvOverrides[]>([])
  const [allEnvPlatforms, setAllEnvPlatforms] = useState<EnvPlatformRecord[]>([])

  // In-page Environment Profile Form state
  const [envDescription, setEnvDescription] = useState("")
  const [envScenarios, setEnvScenarios] = useState("")
  const [envFlows, setEnvFlows] = useState("")
  const [envResults, setEnvResults] = useState("")
  const [envVarsJson, setEnvVarsJson] = useState("")
  const [isSavingEnv, setIsSavingEnv] = useState(false)

  // Inline Platform Card Overrides Form state
  const [expandedPlatformId, setExpandedPlatformId] = useState<string | null>(null)
  const [overrideUrl, setOverrideUrl] = useState("")
  const [overrideHealth, setOverrideHealth] = useState("")
  const [overrideStartCmd, setOverrideStartCmd] = useState("")
  const [overrideCwd, setOverrideCwd] = useState("")
  const [overrideHeadless, setOverrideHeadless] = useState(false)
  const [overrideSlowMo, setOverrideSlowMo] = useState<number | undefined>(undefined)
  const [overrideAppId, setOverrideAppId] = useState("")
  const [isSavingOverride, setIsSavingOverride] = useState(false)

  // Sync profile form when selected environment changes
  useEffect(() => {
    setEnvDescription(selectedEnvData.description || "")
    setEnvScenarios(selectedEnvData.scenarios || config?.scenariosPath || ".e2e/scenarios")
    setEnvFlows(selectedEnvData.flows || ".e2e/flows")
    setEnvResults(selectedEnvData.results || config?.resultsPath || ".e2e/results")
    setEnvVarsJson(
      selectedEnvData.env
        ? JSON.stringify(selectedEnvData.env, null, 2)
        : `{\n  "APP_ENV": "${selectedEnvName}"\n}`,
    )
    setExpandedPlatformId(null)
  }, [selectedEnvName, selectedEnvData, config?.scenariosPath, config?.resultsPath])

  const handleSaveEnvProfile = async () => {
    let parsedVars: Record<string, string> | undefined
    if (envVarsJson.trim()) {
      try {
        parsedVars = JSON.parse(envVarsJson.trim())
      } catch {
        toastError("Environment variables must be valid JSON object", "JSON Parse Error")
        return
      }
    }

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

  const handleToggleExpandPlatform = (p: PlatformWithEnvOverrides) => {
    if (expandedPlatformId === p.id) {
      setExpandedPlatformId(null)
    } else {
      setExpandedPlatformId(p.id)
      setOverrideUrl(p.url || "")
      setOverrideHealth(p.health || "")
      setOverrideStartCmd(p.startCmd || "")
      setOverrideCwd(p.cwd || "")
      setOverrideHeadless(p.headless || false)
      setOverrideSlowMo(p.slowMo)
      setOverrideAppId(p.appId || "")
    }
  }

  const handleSaveInlineOverride = async (p: PlatformWithEnvOverrides) => {
    setIsSavingOverride(true)
    try {
      await saveEnvPlatform({
        envName: selectedEnvName,
        platformId: p.id,
        enabled: p.enabled,
        url: overrideUrl.trim() || undefined,
        health: overrideHealth.trim() || undefined,
        startCmd: overrideStartCmd.trim() || undefined,
        cwd: overrideCwd.trim() || undefined,
        headless: p.type === "web" ? overrideHeadless : undefined,
        slowMo: p.type === "web" ? overrideSlowMo : undefined,
        appId: p.type === "android" ? overrideAppId.trim() || undefined : undefined,
      })
      toastSuccess(
        `Saved overrides for "${p.name}" in ${selectedEnvName}`,
        "Overrides Saved",
      )
      await loadEnvPlatforms(selectedEnvName)
      onConfigReload()
      setExpandedPlatformId(null)
    } catch (err) {
      toastError((err as Error).message, "Failed to Save Overrides")
    } finally {
      setIsSavingOverride(false)
    }
  }

  const loadEnvPlatforms = async (envName: string) => {
    try {
      const data = await fetchEnvPlatforms(envName)
      if (data.platformsWithEnv) {
        setEnvPlatforms(data.platformsWithEnv)
      }
      if (data.envPlatforms) {
        setAllEnvPlatforms(data.envPlatforms)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (selectedEnvName) {
      loadEnvPlatforms(selectedEnvName)
    }
  }, [selectedEnvName])

  const handleTogglePlatform = async (p: PlatformWithEnvOverrides) => {
    try {
      await saveEnvPlatform({
        envName: selectedEnvName,
        platformId: p.id,
        enabled: !p.enabled,
        url: p.url,
        health: p.health,
        startCmd: p.startCmd,
        cwd: p.cwd,
        headless: p.headless,
        slowMo: p.slowMo,
        appId: p.appId,
      })
      const statusTitle = !p.enabled ? "Enabled" : "Disabled"
      toastSuccess(
        `Platform "${p.name}" ${statusTitle} in ${selectedEnvName}`,
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

  const handleDeleteEnvironment = async (name: string) => {
    if (Object.keys(environments).length <= 1) {
      toastError("Cannot delete the only environment", "Action Restricted")
      return
    }
    if (!confirm(`Are you sure you want to remove environment "${name}"?`)) return

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
  }

  const handleDeletePlatform = async (targetName: string) => {
    if (!confirm(`Are you sure you want to remove platform "${targetName}"?`)) return

    try {
      await deletePlatform(targetName)
      toastSuccess(`Platform "${targetName}" removed`, "Platform Removed")
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Remove Platform")
    }
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

  const handleDeleteFixture = async (name: string) => {
    if (!confirm(`Are you sure you want to remove fixture "${name}"?`)) return
    try {
      await deleteFixture(name)
      toastSuccess(`Fixture "${name}" removed`, "Fixture Removed")
      onConfigReload()
    } catch (err) {
      toastError((err as Error).message, "Failed to Delete Fixture")
    }
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

  const platformsCount = Object.keys(config?.targets ?? {}).length

  return (
    <div className="flex-1 flex flex-col h-full bg-editor overflow-hidden select-text">
      {/* Top Header Bar with Segmented Pill Tabs */}
      <div className="px-5 py-2.5 border-b border-border bg-titlebar flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-fg-bright">Configuration</span>
            <span className="text-[10px] font-mono text-fg-muted bg-sidebar px-1.5 py-0.5 rounded-xs border border-border">
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
            icon={<Terminal className="w-3.5 h-3.5 text-warning" />}
            badge={<Badge variant={activeSection === "fixtures" ? "primary" : "neutral"} size="xs">{fixturesList.length}</Badge>}
          >
            Fixtures
          </TabButton>
          <TabButton
            variant="pills"
            active={activeSection === "database"}
            onClick={() => setActiveSection("database")}
            icon={<Database className="w-3.5 h-3.5 text-primary" />}
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
                  <span className="text-xs font-bold text-fg-bright uppercase tracking-wider">Profiles</span>
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
                        <p className="text-[11px] text-fg-muted truncate">{data.description}</p>
                      )}
                      {data?.url && (
                        <div className="text-[10px] font-mono text-fg-muted truncate">
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
                      <h3 className="text-xs font-bold text-fg-bright uppercase tracking-wider">
                        Profile Configuration
                      </h3>
                      <p className="text-[11px] text-fg-muted">
                        Directories and environment variables for the {selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)} profile.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-fg-muted">
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

                <FormField
                  label="Environment Variables (JSON)"
                  hint="Key-value pairs accessible in scenarios via ${env.KEY}"
                >
                  <TextArea
                    rows={4}
                    value={envVarsJson}
                    onChange={(e) => setEnvVarsJson(e.target.value)}
                    placeholder={`{\n  "APP_ENV": "${selectedEnvName}"\n}`}
                    mono
                  />
                </FormField>

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

              {/* Linked Platforms in this Environment */}
              <div className="bg-sidebar border border-border rounded-xs p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <div>
                      <h3 className="text-xs font-bold text-fg-bright uppercase tracking-wider">
                        Platforms in this Environment
                      </h3>
                      <p className="text-[11px] text-fg-muted">
                        Platform status and environment-specific overrides for {selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)}.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary" size="xs">
                      {envPlatforms.filter((p) => p.enabled).length} of {envPlatforms.length} Active
                    </Badge>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setIsPlatformModalOpen(true)}
                      icon={<Plus className="w-3 h-3" />}
                    >
                      New Platform
                    </Button>
                  </div>
                </div>

                {envPlatforms.length === 0 ? (
                  <div className="bg-editor/50 border border-dashed border-border rounded-xs p-6 text-center text-xs text-fg-muted space-y-2">
                    <Layers className="w-6 h-6 mx-auto text-fg-muted" />
                    <p>No platforms configured in this project yet.</p>
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => setIsPlatformModalOpen(true)}
                      icon={<Plus className="w-3 h-3" />}
                    >
                      Add Platform
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {envPlatforms.map((p) => {
                      const isExpanded = expandedPlatformId === p.id

                      return (
                        <div
                          key={p.id}
                          className={`p-3.5 rounded-xs border transition-all flex flex-col justify-between gap-3 ${
                            p.enabled
                              ? "bg-sidebar border-border hover:border-border-light shadow-xs"
                              : "bg-editor/30 border-border/60 opacity-70"
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-6 h-6 rounded-xs flex items-center justify-center ${
                                    p.type === "web"
                                      ? "bg-primary text-white"
                                      : p.type === "android"
                                        ? "bg-success text-white"
                                        : "bg-warning text-black"
                                  }`}
                                >
                                  {p.type === "web" && <Globe className="w-3.5 h-3.5" />}
                                  {p.type === "android" && <Smartphone className="w-3.5 h-3.5" />}
                                  {p.type === "api" && <Server className="w-3.5 h-3.5" />}
                                </div>
                                <div>
                                  <span className="font-bold text-xs text-fg-bright">{p.name}</span>
                                  <span className="text-[10px] text-fg-muted ml-1.5 uppercase font-mono">
                                    ({p.type})
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {p.hasOverrides && (
                                  <Badge variant="warning" size="xs">
                                    Customized
                                  </Badge>
                                )}
                                <Badge variant={p.enabled ? "success" : "neutral"} size="xs">
                                  {p.enabled ? "Enabled" : "Disabled"}
                                </Badge>
                              </div>
                            </div>

                            {/* Current Configuration Summary */}
                            <div className="space-y-1 text-xs">
                              {p.url && (
                                <div className="flex items-center justify-between font-mono text-[11px] bg-editor/60 p-1.5 rounded-xs border border-border">
                                  <span className="text-fg-muted text-[10px]">URL:</span>
                                  <span className="text-primary truncate max-w-[220px]">{p.url}</span>
                                </div>
                              )}
                              {p.startCmd && (
                                <div className="flex items-center justify-between font-mono text-[11px] text-fg-muted">
                                  <span>Start:</span>
                                  <span className="truncate max-w-[200px] text-fg">{p.startCmd}</span>
                                </div>
                              )}
                              {p.type === "web" && (
                                <div className="flex items-center gap-2 text-[10px] text-fg-muted pt-0.5">
                                  <span>Headless: {p.headless ? "Yes" : "No"}</span>
                                  {p.slowMo !== undefined && <span>Slow-Mo: {p.slowMo}ms</span>}
                                </div>
                              )}
                              {p.type === "android" && p.appId && (
                                <div className="flex items-center justify-between font-mono text-[11px] text-fg-muted">
                                  <span>App ID:</span>
                                  <span className="truncate max-w-[200px] text-fg">{p.appId}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Inline Card Overrides Form Expansion */}
                          {isExpanded && (
                            <div className="pt-3 border-t border-border space-y-3 bg-editor/40 -mx-3.5 -mb-1 p-3.5 rounded-b-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-fg-bright flex items-center gap-1.5">
                                  <Settings2 className="w-3.5 h-3.5 text-primary" />
                                  Overrides for {selectedEnvName.charAt(0).toUpperCase() + selectedEnvName.slice(1)}
                                </span>
                                {p.hasOverrides && (
                                  <Badge variant="warning" size="xs">
                                    Active
                                  </Badge>
                                )}
                              </div>

                              {p.type === "web" && (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FormField label="Target Base URL" hint="Leave empty for default">
                                      <Input
                                        value={overrideUrl}
                                        onChange={(e) => setOverrideUrl(e.target.value)}
                                        placeholder={p.url || "http://localhost:5173"}
                                        mono
                                      />
                                    </FormField>
                                    <FormField label="Health Check Path" hint="e.g. /health">
                                      <Input
                                        value={overrideHealth}
                                        onChange={(e) => setOverrideHealth(e.target.value)}
                                        placeholder="/health"
                                        mono
                                      />
                                    </FormField>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FormField label="Start Command" hint="Optional launch cmd">
                                      <Input
                                        value={overrideStartCmd}
                                        onChange={(e) => setOverrideStartCmd(e.target.value)}
                                        placeholder="e.g. pnpm run dev"
                                        mono
                                      />
                                    </FormField>
                                    <FormField label="Working Directory (CWD)" hint="Folder for startCmd">
                                      <Input
                                        value={overrideCwd}
                                        onChange={(e) => setOverrideCwd(e.target.value)}
                                        placeholder="e.g. apps/frontend"
                                        mono
                                      />
                                    </FormField>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                                    <label className="flex items-center gap-2 text-xs text-fg-bright cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={overrideHeadless}
                                        onChange={(e) => setOverrideHeadless(e.target.checked)}
                                        className="rounded-xs border-border bg-input text-primary focus:ring-0"
                                      />
                                      <span>Run Headless</span>
                                    </label>
                                    <FormField label="Slow-Mo Delay (ms)">
                                      <NumberInput
                                        value={overrideSlowMo}
                                        onChange={(val) => setOverrideSlowMo(val)}
                                        min={0}
                                        step={25}
                                        suffix="ms"
                                      />
                                    </FormField>
                                  </div>
                                </div>
                              )}

                              {p.type === "api" && (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FormField label="API Base URL" hint="Leave empty for default">
                                      <Input
                                        value={overrideUrl}
                                        onChange={(e) => setOverrideUrl(e.target.value)}
                                        placeholder={p.url || "http://localhost:3000"}
                                        mono
                                      />
                                    </FormField>
                                    <FormField label="Health Check Path" hint="e.g. /health">
                                      <Input
                                        value={overrideHealth}
                                        onChange={(e) => setOverrideHealth(e.target.value)}
                                        placeholder="/health"
                                        mono
                                      />
                                    </FormField>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FormField label="Start Command" hint="Optional launch cmd">
                                      <Input
                                        value={overrideStartCmd}
                                        onChange={(e) => setOverrideStartCmd(e.target.value)}
                                        placeholder="e.g. pnpm run dev"
                                        mono
                                      />
                                    </FormField>
                                    <FormField label="Working Directory (CWD)" hint="Folder for startCmd">
                                      <Input
                                        value={overrideCwd}
                                        onChange={(e) => setOverrideCwd(e.target.value)}
                                        placeholder="e.g. apps/api"
                                        mono
                                      />
                                    </FormField>
                                  </div>
                                </div>
                              )}

                              {p.type === "android" && (
                                <div className="space-y-3">
                                  <FormField label="Application ID / Package" hint="Android package identifier">
                                    <Input
                                      value={overrideAppId}
                                      onChange={(e) => setOverrideAppId(e.target.value)}
                                      placeholder="e.g. com.example.app"
                                      mono
                                    />
                                  </FormField>
                                </div>
                              )}

                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => setExpandedPlatformId(null)}
                                  disabled={isSavingOverride}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="xs"
                                  variant="primary"
                                  onClick={() => handleSaveInlineOverride(p)}
                                  isLoading={isSavingOverride}
                                  icon={<Check className="w-3 h-3" />}
                                >
                                  Save Overrides
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <Button
                              size="xs"
                              variant={p.enabled ? "ghost" : "secondary"}
                              onClick={() => handleTogglePlatform(p)}
                            >
                              {p.enabled ? "Disable in this Env" : "Enable in this Env"}
                            </Button>
                            <Button
                              size="xs"
                              variant={isExpanded ? "primary" : "secondary"}
                              onClick={() => handleToggleExpandPlatform(p)}
                              icon={
                                isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )
                              }
                            >
                              {isExpanded ? "Close Overrides" : "Configure Overrides"}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: PLATFORMS */}
        {activeSection === "platforms" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-fg-bright uppercase tracking-wider flex items-center gap-1.5">
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
                {Object.entries(config?.targets ?? {}).map(([name, target]) => {
                  const driverStr = String(target.driver ?? "http")
                  const driverTitle = driverStr.charAt(0).toUpperCase() + driverStr.slice(1)
                  const variant =
                    target.driver === "http"
                      ? "driver-http"
                      : target.driver === "web"
                        ? "driver-web"
                        : target.driver === "mobile"
                          ? "driver-mobile"
                          : "driver-shell"

                  const service = config?.services?.[target.service]

                  return (
                    <div
                      key={name}
                      className="bg-sidebar border border-border rounded-xs p-4 flex flex-col justify-between space-y-3 hover:border-border-light transition-colors shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                          <div className="flex items-center gap-2">
                            {target.driver === "web" && <Globe className="w-4 h-4 text-primary" />}
                            {target.driver === "mobile" && <Smartphone className="w-4 h-4 text-success" />}
                            {target.driver === "http" && <Server className="w-4 h-4 text-info" />}
                            <span className="font-bold text-sm text-fg-bright">{name}</span>
                          </div>
                          <Badge variant={variant} size="xs">
                            {driverTitle}
                          </Badge>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 text-xs text-fg-muted">
                          {target.driver === "web" && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span>Dev Server:</span>
                                <span className="font-mono text-primary truncate max-w-[170px]">
                                  {service?.url || "Custom Target"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span>Step Modules:</span>
                                <span className="font-mono text-fg truncate max-w-[170px]">
                                  {target.modules}
                                </span>
                              </div>
                              {typeof target.slowMo === "number" && (
                                <div className="flex items-center justify-between text-xs">
                                  <span>Slow-Mo:</span>
                                  <span className="font-mono text-fg">{target.slowMo}ms</span>
                                </div>
                              )}
                              {service?.startCmd && (
                                <div className="text-[11px] font-mono text-fg-muted bg-editor/60 p-2 rounded-xs border border-border mt-1">
                                  $ {service.startCmd}
                                </div>
                              )}
                            </>
                          )}

                          {target.driver === "mobile" && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span>Application ID:</span>
                                <span className="font-mono text-success truncate max-w-[170px]">
                                  {target.appId}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span>Flows Folder:</span>
                                <span className="font-mono text-fg truncate max-w-[170px]">
                                  {target.flows}
                                </span>
                              </div>
                              {target.reversePorts && (
                                <div className="flex items-center justify-between text-xs">
                                  <span>Reverse Ports:</span>
                                  <span className="font-mono text-fg">
                                    {target.reversePorts.join(", ")}
                                  </span>
                                </div>
                              )}
                              {target.install?.cmd && (
                                <div className="text-[11px] font-mono text-fg-muted bg-editor/60 p-2 rounded-xs border border-border mt-1">
                                  $ {target.install.cmd}
                                </div>
                              )}
                            </>
                          )}

                          {target.driver === "http" && (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span>Endpoint URL:</span>
                                <span className="font-mono text-info truncate max-w-[170px]">
                                  {service?.url}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span>Health Check:</span>
                                <span className="font-mono text-fg truncate max-w-[170px]">
                                  {service?.health || "/"}
                                </span>
                              </div>
                              {service?.startCmd && (
                                <div className="text-[11px] font-mono text-fg-muted bg-editor/60 p-2 rounded-xs border border-border mt-1">
                                  $ {service.startCmd}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Environments Matrix for this platform */}
                      <div className="pt-2 border-t border-border space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted block">
                          Availability Across Environments
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {envKeys.map((eName) => {
                            const platId = config?.platforms?.find((p) => p.name === name)?.id || `plat-${name}`
                            const pivot = allEnvPlatforms.find(
                              (ep) => ep.envName === eName && ep.platformId === platId,
                            )
                            const isPlatEnabled = pivot ? pivot.enabled : true
                            const capitalized = eName.charAt(0).toUpperCase() + eName.slice(1)
                            return (
                              <button
                                type="button"
                                key={eName}
                                onClick={() => {
                                  setActiveSection("environments")
                                  setUrlEnv(eName)
                                }}
                                className="cursor-pointer transition-transform hover:scale-105"
                                title={`Click to view and configure ${name} in ${capitalized}`}
                              >
                                <Badge
                                  variant={isPlatEnabled ? "success" : "neutral"}
                                  size="xs"
                                >
                                  {capitalized}: {isPlatEnabled ? "Active" : "Disabled"}
                                </Badge>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-end">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleDeletePlatform(name)}
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
                  <h2 className="text-sm font-bold text-fg-bright uppercase tracking-wider flex items-center gap-1.5">
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
                            <span className="text-[10px] font-mono text-fg-muted bg-editor px-1.5 py-0.5 rounded-xs border border-border">
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
                  <h2 className="text-sm font-bold text-fg-bright uppercase tracking-wider flex items-center gap-1.5">
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
                <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider block mb-1">
                  Active Profile
                </span>
                <span className="text-base font-bold text-primary">
                  {activeEnvName.charAt(0).toUpperCase() + activeEnvName.slice(1)}
                </span>
                <p className="text-[11px] text-fg-muted mt-1">Current target for CLI & scenario runs</p>
              </div>

              <div className="bg-sidebar border border-border rounded-xs p-4">
                <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider block mb-1">
                  Stored Environments
                </span>
                <span className="text-base font-bold text-fg-bright">{envKeys.length}</span>
                <p className="text-[11px] text-fg-muted mt-1">Total profiles configured in SQLite</p>
              </div>

              <div className="bg-sidebar border border-border rounded-xs p-4">
                <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider block mb-1">
                  Stored Platforms
                </span>
                <span className="text-base font-bold text-fg-bright">{platformsCount}</span>
                <p className="text-[11px] text-fg-muted mt-1">Execution targets configured in SQLite</p>
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
                    {config?.configDir}
                  </div>
                </div>

                <div className="pt-2 border-t border-border text-[11px] text-fg-muted leading-relaxed">
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

      {/* Add Platform Modal */}
      {isPlatformModalOpen && (
        <PlatformModal
          isOpen={isPlatformModalOpen}
          config={config ?? undefined}
          onClose={() => setIsPlatformModalOpen(false)}
          onSaved={onConfigReload}
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
                  <span className="text-[11px] font-mono text-fg-muted">{fixtureRunState.durationMs}ms</span>
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
    </div>
  )
}
