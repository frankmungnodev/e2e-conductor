import { useEffect, useState } from "react"
import { deleteEnvironment, deletePlatform, fetchEnvPlatforms, saveEnvPlatform, setActiveEnvironment } from "../../api.ts"
import { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import { EnvironmentModal } from "../../components/EnvironmentModal.tsx"
import { useUrlTab } from "../../components/Tabs.tsx"
import { useToast } from "../../components/Toast.tsx"
import { capitalize } from "../../format.ts"
import type { ConfigMeta, EnvironmentMeta, EnvPlatformRecord, PlatformWithEnvOverrides } from "../../types.ts"
import { ConfigHeader } from "./ConfigHeader.tsx"
import { DatabaseTab } from "./DatabaseTab.tsx"
import { EnvironmentsTab } from "./EnvironmentsTab.tsx"
import { FixtureEditModal } from "./FixtureEditModal.tsx"
import { FixtureRunModal } from "./FixtureRunModal.tsx"
import { FixturesTab } from "./FixturesTab.tsx"
import { PlatformsTab } from "./PlatformsTab.tsx"
import { PlatformModal } from "./platform-modal/PlatformModal.tsx"
import { buildDisplayPlatforms } from "./platformDisplay.ts"
import { useEnvironmentProfile } from "./useEnvironmentProfile.ts"
import { useFixtures } from "./useFixtures.tsx"

type ConfigViewProps = {
  config: ConfigMeta | null
  onConfigReload: () => void
}

export type ConfigSection = "environments" | "platforms" | "fixtures" | "database"
const VALID_SECTIONS = ["environments", "platforms", "fixtures", "database"] as const

export function ConfigView({ config, onConfigReload }: ConfigViewProps) {
  const [activeSection, setActiveSection] = useUrlTab<ConfigSection>("sub", "environments", VALID_SECTIONS)

  // Dedicated Modals State
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false)
  const [overrideModalPlat, setOverrideModalPlat] = useState<PlatformWithEnvOverrides | null>(null)
  const [isAddEnvOpen, setIsAddEnvOpen] = useState(false)

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

  const profile = useEnvironmentProfile(config, selectedEnvName, selectedEnvData, onConfigReload)
  const fixtures = useFixtures(config, onConfigReload, confirm)

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
      const envTitle = capitalize(selectedEnvName)
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
      const capitalized = capitalize(envName)
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

  const displayPlatforms = buildDisplayPlatforms(config, allEnvPlatforms, selectedEnvName)
  const platformsCount = displayPlatforms.length

  return (
    <div className="flex-1 flex flex-col h-full bg-editor overflow-hidden select-text">
      {/* Top Header Bar with Segmented Pill Tabs */}
      <ConfigHeader
        config={config}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        envCount={envKeys.length}
        platformsCount={platformsCount}
        fixturesCount={fixtures.fixturesList.length}
        onConfigReload={onConfigReload}
      />

      {/* Main Tabbed Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* SUB-TAB 1: ENVIRONMENTS (Master-Detail Split View) */}
        {activeSection === "environments" && (
          <EnvironmentsTab
            config={config}
            environments={environments}
            envKeys={envKeys}
            selectedEnvName={selectedEnvName}
            selectedEnvData={selectedEnvData}
            activeEnvName={activeEnvName}
            setUrlEnv={setUrlEnv}
            onAddProfile={() => setIsAddEnvOpen(true)}
            isSwitchingEnv={isSwitchingEnv}
            handleSwitchEnvironment={handleSwitchEnvironment}
            handleDeleteEnvironment={handleDeleteEnvironment}
            profile={profile}
            onConfigReload={onConfigReload}
          />
        )}

        {/* SUB-TAB 2: PLATFORMS */}
        {activeSection === "platforms" && (
          <PlatformsTab
            displayPlatforms={displayPlatforms}
            envKeys={envKeys}
            selectedEnvName={selectedEnvName}
            activeEnvName={activeEnvName}
            allEnvPlatforms={allEnvPlatforms}
            setUrlEnv={setUrlEnv}
            onAddPlatform={() => setIsPlatformModalOpen(true)}
            onEditOverrides={setOverrideModalPlat}
            handleTogglePlatform={handleTogglePlatform}
            handleDeletePlatform={handleDeletePlatform}
          />
        )}

        {/* SUB-TAB 3: FIXTURES */}
        {activeSection === "fixtures" && (
          <FixturesTab
            fixturesList={fixtures.fixturesList}
            handleOpenAddFixture={fixtures.handleOpenAddFixture}
            handleOpenEditFixture={fixtures.handleOpenEditFixture}
            handleTestRunFixture={fixtures.handleTestRunFixture}
            handleDeleteFixture={fixtures.handleDeleteFixture}
          />
        )}

        {/* SUB-TAB 4: DATABASE & STORAGE */}
        {activeSection === "database" && (
          <DatabaseTab
            config={config}
            activeEnvName={activeEnvName}
            envCount={envKeys.length}
            platformsCount={platformsCount}
          />
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
      {fixtures.fixtureModal.isOpen && (
        <FixtureEditModal
          fixtureModal={fixtures.fixtureModal}
          setFixtureModal={fixtures.setFixtureModal}
          isSavingFixture={fixtures.isSavingFixture}
          handleSaveFixture={fixtures.handleSaveFixture}
        />
      )}

      {/* Fixture Run Test Output Modal */}
      {fixtures.fixtureRunState.isOpen && (
        <FixtureRunModal fixtureRunState={fixtures.fixtureRunState} setFixtureRunState={fixtures.setFixtureRunState} />
      )}

      <ConfirmDialog />
    </div>
  )
}
