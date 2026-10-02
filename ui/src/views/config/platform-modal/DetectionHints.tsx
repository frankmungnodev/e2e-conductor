import { Search } from "lucide-react"
import { Badge } from "../../../components/Badge.tsx"
import type { DetectedService } from "../../../types.ts"

export interface DetectionHintsProps {
  detected: DetectedService[]
  applyDetection: (det: DetectedService) => void
}

/** Workspace scan results the user can click to pre-fill the form. */
export function DetectionHints({ detected, applyDetection }: DetectionHintsProps) {
  return (
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
  )
}
