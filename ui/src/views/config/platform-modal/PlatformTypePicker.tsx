import { Globe, Server, Smartphone } from "lucide-react"
import type { WizardComponentType } from "../../../types.ts"

export interface PlatformTypePickerProps {
  platform: WizardComponentType
  setPlatform: (platform: WizardComponentType) => void
  isOverride: boolean
}

export function PlatformTypePicker({ platform, setPlatform, isOverride }: PlatformTypePickerProps) {
  return (
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
  )
}
