import { Globe, Layers, Plus } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { TabButton } from "../../components/Tabs.tsx"
import { capitalize } from "../../format.ts"
import type { EnvPlatformRecord, PlatformWithEnvOverrides } from "../../types.ts"
import { PlatformCard } from "./PlatformCard.tsx"

export interface PlatformsTabProps {
  displayPlatforms: PlatformWithEnvOverrides[]
  envKeys: string[]
  selectedEnvName: string
  activeEnvName: string
  allEnvPlatforms: EnvPlatformRecord[]
  setUrlEnv: (envName: string) => void
  onAddPlatform: () => void
  onEditOverrides: (plat: PlatformWithEnvOverrides) => void
  handleTogglePlatform: (platformId: string, currentEnabled: boolean, platformName: string) => void
  handleDeletePlatform: (name: string) => void
}

/** Platforms configured for the project, shown with the selected environment's overrides applied. */
export function PlatformsTab({
  displayPlatforms,
  envKeys,
  selectedEnvName,
  activeEnvName,
  allEnvPlatforms,
  setUrlEnv,
  onAddPlatform,
  onEditOverrides,
  handleTogglePlatform,
  handleDeletePlatform,
}: PlatformsTabProps) {
  const platformsCount = displayPlatforms.length

  return (
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
          onClick={onAddPlatform}
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
              const capitalized = capitalize(envName)
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
            {capitalize(selectedEnvName)}
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
            onClick={onAddPlatform}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Platform
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayPlatforms.map((plat) => (
            <PlatformCard
              key={plat.id}
              plat={plat}
              envKeys={envKeys}
              selectedEnvName={selectedEnvName}
              allEnvPlatforms={allEnvPlatforms}
              setUrlEnv={setUrlEnv}
              onEditOverrides={onEditOverrides}
              handleTogglePlatform={handleTogglePlatform}
              handleDeletePlatform={handleDeletePlatform}
            />
          ))}
        </div>
      )}
    </div>
  )
}
