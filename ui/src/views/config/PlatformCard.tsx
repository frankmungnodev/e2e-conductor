import { Globe, Server, SlidersHorizontal, Smartphone, Trash2 } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { capitalize } from "../../format.ts"
import type { EnvPlatformRecord, PlatformWithEnvOverrides } from "../../types.ts"

export interface PlatformCardProps {
  plat: PlatformWithEnvOverrides
  envKeys: string[]
  selectedEnvName: string
  allEnvPlatforms: EnvPlatformRecord[]
  setUrlEnv: (envName: string) => void
  onEditOverrides: (plat: PlatformWithEnvOverrides) => void
  handleTogglePlatform: (platformId: string, currentEnabled: boolean, platformName: string) => void
  handleDeletePlatform: (name: string) => void
}

/** One platform's effective settings in the selected environment, with its per-environment actions. */
export function PlatformCard({
  plat,
  envKeys,
  selectedEnvName,
  allEnvPlatforms,
  setUrlEnv,
  onEditOverrides,
  handleTogglePlatform,
  handleDeletePlatform,
}: PlatformCardProps) {
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
    capitalize(selectedEnvName)

  return (
    <div
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
            const capitalized = capitalize(eName)
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
            onClick={() => onEditOverrides(plat)}
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
}
