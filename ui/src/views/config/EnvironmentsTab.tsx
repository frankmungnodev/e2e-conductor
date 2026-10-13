import { Globe, Play, Plus, Save, Trash2 } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { EnvVariablesEditor } from "../../components/EnvVariablesEditor.tsx"
import { FormField, Input } from "../../components/FormControls.tsx"
import { capitalize } from "../../format.ts"
import type { ConfigMeta, EnvironmentMeta } from "../../types.ts"
import { AllowDraftsToggle } from "./AllowDraftsToggle.tsx"
import type { EnvironmentProfile } from "./useEnvironmentProfile.ts"

export interface EnvironmentsTabProps {
  config: ConfigMeta | null
  environments: Record<string, EnvironmentMeta>
  envKeys: string[]
  selectedEnvName: string
  selectedEnvData: EnvironmentMeta
  activeEnvName: string
  setUrlEnv: (envName: string) => void
  onAddProfile: () => void
  isSwitchingEnv: boolean
  handleSwitchEnvironment: (envName: string) => void
  handleDeleteEnvironment: (envName: string) => void
  profile: EnvironmentProfile
  onConfigReload: () => void
}

/** Environment profiles list plus the selected profile's editor. */
export function EnvironmentsTab({
  config,
  environments,
  envKeys,
  selectedEnvName,
  selectedEnvData,
  activeEnvName,
  setUrlEnv,
  onAddProfile,
  isSwitchingEnv,
  handleSwitchEnvironment,
  handleDeleteEnvironment,
  profile,
  onConfigReload,
}: EnvironmentsTabProps) {
  const {
    envDescription,
    setEnvDescription,
    envScenarios,
    setEnvScenarios,
    envFlows,
    setEnvFlows,
    envResults,
    setEnvResults,
    envRows,
    setEnvRows,
    isSavingEnv,
    handleSaveEnvProfile,
  } = profile
  return (
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
            onClick={onAddProfile}
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
            const capitalized = capitalize(envName)

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
                {capitalize(selectedEnvName)} Profile
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
                  Directories and environment variables for the {capitalize(selectedEnvName)} profile.
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

          <AllowDraftsToggle envName={selectedEnvName} environment={selectedEnvData} onConfigReload={onConfigReload} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Scenarios Folder"
              hint="Folder where test scenarios reside"
            >
              <Input
                value={envScenarios}
                onChange={(e) => setEnvScenarios(e.target.value)}
                placeholder="e.g. e2e-suite/scenarios"
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
  )
}
