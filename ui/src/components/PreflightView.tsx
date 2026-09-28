import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FolderTree,
  Globe,
  Play,
  RefreshCw,
  Server,
  Smartphone,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import type { ConfigMeta, PreflightData } from "../types.ts"
import { Badge } from "./Badge.tsx"
import { Button } from "./Button.tsx"
import { Panel, PanelBody, PanelHeader } from "./Panel.tsx"
import { useToast } from "./Toast.tsx"

type PreflightViewProps = {
  preflightData: PreflightData | null
  config: ConfigMeta | null
  isLoading: boolean
  onRefresh: () => void
  onStartService: (name: string) => Promise<void>
}

export function PreflightView({
  preflightData,
  config,
  isLoading,
  onRefresh,
  onStartService,
}: PreflightViewProps) {
  const [startingServices, setStartingServices] = useState<Record<string, boolean>>({})
  const { error: toastError, success: toastSuccess } = useToast()

  const handleStartService = async (name: string) => {
    setStartingServices((prev) => ({ ...prev, [name]: true }))
    try {
      await onStartService(name)
      toastSuccess(`Service "${name}" started successfully`, "Service Started")
      setTimeout(onRefresh, 1500)
    } catch (e) {
      toastError((e as Error).message, `Failed to start ${name}`)
    } finally {
      setStartingServices((prev) => ({ ...prev, [name]: false }))
    }
  }

  const hasServices = (preflightData?.services.length ?? 0) > 0
  const allServicesUp = hasServices && (preflightData?.services.every((s) => s.up) ?? false)
  const anyServiceDown = preflightData?.services.some((s) => !s.up) ?? false

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-6xl mx-auto space-y-4 bg-editor text-fg select-none">
      {/* Top Banner */}
      <Panel variant="sidebar" className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-fg-bright flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-primary" />
              System Health & Readiness Check
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Live status check to confirm background servers, mobile devices, and browser tools are ready to run tests.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {allServicesUp && (
              <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
                All Services Ready
              </Badge>
            )}
            {anyServiceDown && (
              <Badge variant="warning" icon={<AlertTriangle className="w-3 h-3 text-warning" />}>
                Services Require Attention
              </Badge>
            )}

            <Button
              size="xs"
              variant="secondary"
              onClick={onRefresh}
              disabled={isLoading}
              icon={<RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin text-primary" : ""}`} />}
            >
              {isLoading ? "Checking..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Services Grid */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-fg-muted flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-primary" />
          Connected Web Services & APIs
        </h3>

        {!preflightData?.services.length ? (
          <Panel variant="sidebar" className="p-4 text-xs text-fg-muted">
            No background web services configured.
          </Panel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {preflightData.services.map((svc) => {
              const isStarting = startingServices[svc.name]
              return (
                <Panel key={svc.name} variant="sidebar" className="flex flex-col justify-between">
                  <PanelBody className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg-bright">{svc.name}</span>
                        {svc.exclusive && (
                          <Badge size="xs" variant="warning">
                            Exclusive
                          </Badge>
                        )}
                      </div>

                      {svc.up ? (
                        <Badge size="xs" variant="success" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
                          Online ({svc.latencyMs}ms)
                        </Badge>
                      ) : (
                        <Badge size="xs" variant="danger" icon={<XCircle className="w-3 h-3 text-error" />}>
                          Offline / Unavailable
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1 text-xs text-fg-muted font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-fg-muted">URL:</span>
                        <a
                          href={svc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-info hover:underline truncate"
                        >
                          {svc.url}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-fg-muted">Health Endpoint:</span>
                        <span className="text-fg">{svc.health}</span>
                      </div>
                      {svc.startCmd && (
                        <div className="flex items-center gap-2">
                          <span className="text-fg-muted">Start Server Command:</span>
                          <span className="text-fg truncate bg-input px-1.5 py-0.5 rounded-xs border border-border">
                            {svc.startCmd}
                          </span>
                        </div>
                      )}
                    </div>

                    {svc.gitWarning && (
                      <div className="p-2 rounded-xs bg-warning-bg border border-warning-border text-warning text-xs flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Warning: {svc.gitWarning} in progress in service repository.</span>
                      </div>
                    )}
                  </PanelBody>

                  {!svc.up && svc.hasStart && (
                    <div className="px-3 py-2 border-t border-border bg-titlebar/50 flex justify-end">
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => handleStartService(svc.name)}
                        disabled={isStarting}
                        isLoading={isStarting}
                        icon={<Play className="w-3 h-3" />}
                      >
                        Start Server
                      </Button>
                    </div>
                  )}
                </Panel>
              )
            })}
          </div>
        )}
      </div>

      {/* Android & Devices Status */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-fg-muted flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-success" />
          Mobile Devices & Simulators
        </h3>

        <Panel variant="sidebar">
          <PanelHeader
            title="Mobile Device Bridge (ADB)"
            actions={
              <span className="text-xs text-fg-muted font-mono">
                {preflightData?.devices.length ?? 0} Connected Device(s)
              </span>
            }
          />
          <PanelBody className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">Status:</span>
              {preflightData?.adb.available ? (
                <div className="flex items-center gap-1.5">
                  <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3 text-success" />}>
                    Ready
                  </Badge>
                  {preflightData.adb.path && (
                    <span className="text-xs font-mono text-fg-muted truncate max-w-md">
                      ({preflightData.adb.path})
                    </span>
                  )}
                </div>
              ) : (
                <Badge variant="warning" icon={<AlertCircle className="w-3 h-3 text-warning" />}>
                  Not Found on System PATH
                </Badge>
              )}
            </div>

            {/* Connected Devices */}
            {!preflightData?.devices.length ? (
              <div className="text-xs text-fg-muted italic py-1">
                No mobile devices or simulators connected. Connect a device via USB or start an emulator to run mobile tests.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {preflightData.devices.map((dev) => (
                  <div key={dev.serial} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg-bright">{dev.model || "Android Device"}</span>
                        <span className="font-mono text-xs text-fg-muted bg-input px-1.5 py-0.2 rounded-xs border border-border">
                          {dev.serial}
                        </span>
                      </div>

                      {/* Installed Packages status for mobile targets */}
                      <div className="mt-2 space-y-1">
                        {Object.entries(dev.packages).map(([appId, isInstalled]) => (
                          <div key={appId} className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-fg-muted">App ID {appId}:</span>
                            {isInstalled ? (
                              <Badge size="xs" variant="success" icon={<CheckCircle2 className="w-2.5 h-2.5 text-success" />}>
                                Installed
                              </Badge>
                            ) : (
                              <Badge size="xs" variant="danger" icon={<XCircle className="w-2.5 h-2.5 text-error" />}>
                                Not Installed (Use "Install Mobile App" Option)
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <Badge size="xs" variant={dev.state === "device" ? "success" : "warning"}>
                      {dev.state === "device" ? "Connected" : dev.state.charAt(0).toUpperCase() + dev.state.slice(1)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      {/* Target Drivers & Architecture Configuration */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-fg-muted flex items-center gap-2">
          <FolderTree className="w-3.5 h-3.5 text-info" />
          Connected Platforms & Engines
        </h3>

        <Panel variant="sidebar">
          <table className="w-full text-left text-xs">
            <thead className="bg-titlebar text-fg-muted font-semibold border-b border-border">
              <tr>
                <th className="p-2.5 pl-3">Platform Name</th>
                <th className="p-2.5">Engine / Type</th>
                <th className="p-2.5">Associated Service & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-fg">
              <tr className="hover:bg-hover/40">
                <td className="p-2.5 pl-3 font-semibold text-token-fn">shell</td>
                <td className="p-2.5">
                  <Badge size="xs" variant="driver-shell">
                    Shell
                  </Badge>
                </td>
                <td className="p-2.5 text-fg-muted font-sans text-xs">
                  Built-in local command line runner
                </td>
              </tr>
              {Object.entries(config?.targets ?? {}).map(([name, t]) => {
                const badgeVariant =
                  t.driver === "http"
                    ? "driver-http"
                    : t.driver === "web"
                    ? "driver-web"
                    : t.driver === "mobile"
                    ? "driver-mobile"
                    : "driver-shell"

                return (
                  <tr key={name} className="hover:bg-hover/40">
                    <td className="p-2.5 pl-3 font-semibold text-info">{name}</td>
                    <td className="p-2.5">
                      <Badge size="xs" variant={badgeVariant}>
                        {t.driver.charAt(0).toUpperCase() + t.driver.slice(1)}
                      </Badge>
                    </td>
                    <td className="p-2.5 text-fg-muted font-sans text-xs">
                      {t.driver === "http" && `Service: ${t.service}`}
                      {t.driver === "web" && `Service: ${t.service}, Browser Modules: ${t.modules}`}
                      {t.driver === "mobile" && `App ID: ${t.appId}, Workflows: ${t.flows}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}
