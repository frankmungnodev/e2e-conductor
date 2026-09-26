import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FolderTree,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Smartphone,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import type { ConfigMeta, PreflightData } from "../types.ts"

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

  const handleStartService = async (name: string) => {
    setStartingServices((prev) => ({ ...prev, [name]: true }))
    try {
      await onStartService(name)
      setTimeout(onRefresh, 1500)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setStartingServices((prev) => ({ ...prev, [name]: false }))
    }
  }

  const allServicesUp = preflightData?.services.every((s) => s.up) ?? false
  const anyServiceDown = preflightData?.services.some((s) => !s.up) ?? false

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-400" />
            Environment & Preflight Status
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time health verification for HTTP services, Android emulators, and target dependencies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {allServicesUp && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> All Services Ready
            </span>
          )}
          {anyServiceDown && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Services Require Attention
            </span>
          )}

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-sky-400" : ""}`} />
            {isLoading ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          HTTP Services & APIs
        </h3>

        {!preflightData?.services.length ? (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-500">
            No services configured in config.services.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {preflightData.services.map((svc) => {
              const isStarting = startingServices[svc.name]
              return (
                <div
                  key={svc.name}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-200">{svc.name}</span>
                        {svc.exclusive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                            exclusive
                          </span>
                        )}
                      </div>

                      {svc.up ? (
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> UP ({svc.latencyMs}ms)
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" /> DOWN
                        </span>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-slate-400 font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">URL:</span>
                        <a
                          href={svc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:underline truncate"
                        >
                          {svc.url}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Health Endpoint:</span>
                        <span className="text-slate-300">{svc.health}</span>
                      </div>
                      {svc.startCmd && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Start Command:</span>
                          <span className="text-slate-300 truncate bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {svc.startCmd}
                          </span>
                        </div>
                      )}
                    </div>

                    {svc.gitWarning && (
                      <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Warning: {svc.gitWarning} in progress in service repository.</span>
                      </div>
                    )}
                  </div>

                  {!svc.up && svc.hasStart && (
                    <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => handleStartService(svc.name)}
                        disabled={isStarting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition disabled:opacity-50"
                      >
                        {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        {isStarting ? "Starting Service..." : "Start Service"}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Android & Devices Status */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          Mobile Devices & Android ADB
        </h3>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Android Debug Bridge (ADB):</span>
              {preflightData?.adb.available ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready ({preflightData.adb.path})
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" /> Not Found on PATH / SDK
                </span>
              )}
            </div>

            <div className="text-xs text-slate-500 font-mono">
              {preflightData?.devices.length ?? 0} connected device(s)
            </div>
          </div>

          {/* Connected Devices */}
          {!preflightData?.devices.length ? (
            <div className="text-xs text-slate-500 italic py-2">
              No Android devices or emulators connected. Ensure an emulator is running or a device is plugged in with USB debugging enabled.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {preflightData.devices.map((dev) => (
                <div key={dev.serial} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200">{dev.model || "Android Device"}</span>
                      <span className="font-mono text-xs text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {dev.serial}
                      </span>
                    </div>

                    {/* Installed Packages status for mobile targets */}
                    <div className="mt-2 space-y-1">
                      {Object.entries(dev.packages).map(([appId, isInstalled]) => (
                        <div key={appId} className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-slate-500">Package {appId}:</span>
                          {isInstalled ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Installed
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Not Installed (Run with --install)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {dev.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Target Drivers & Architecture Configuration */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <FolderTree className="w-3.5 h-3.5 text-purple-400" />
          Target Drivers Map
        </h3>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3 pl-4">Target Name</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Associated Service / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono text-slate-300">
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 pl-4 font-bold text-amber-400">shell</td>
                <td className="p-3">shell</td>
                <td className="p-3 text-slate-400">Built-in local shell command runner</td>
              </tr>
              {Object.entries(config?.targets ?? {}).map(([name, t]) => (
                <tr key={name} className="hover:bg-slate-800/20">
                  <td className="p-3 pl-4 font-bold text-sky-400">{name}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">{t.driver}</span>
                  </td>
                  <td className="p-3 text-slate-400">
                    {t.driver === "http" && `Service: ${t.service}`}
                    {t.driver === "web" && `Service: ${t.service}, Modules: ${t.modules}`}
                    {t.driver === "mobile" && `App ID: ${t.appId}, Flows: ${t.flows}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
