import { CheckCircle2, CircleDashed, CircleSlash, Loader2, XCircle } from "lucide-react"
import type { Tone } from "./reportFormat.ts"

export type IconStatus = Tone | "not-run"

const ICONS: Record<IconStatus, { Icon: typeof CheckCircle2; className: string; label: string }> = {
  success: { Icon: CheckCircle2, className: "text-success", label: "Passed" },
  error: { Icon: XCircle, className: "text-error", label: "Failed" },
  running: { Icon: Loader2, className: "text-info animate-spin", label: "Running" },
  stopped: { Icon: CircleSlash, className: "text-fg-muted", label: "Stopped" },
  "not-run": { Icon: CircleDashed, className: "text-fg-subtle", label: "Not run" },
}

/** One status glyph, the same shape and color everywhere in Reports. */
export function StatusIcon({ status, size = "md" }: { status: IconStatus; size?: "sm" | "md" | "lg" }) {
  const { Icon, className, label } = ICONS[status]
  const box = size === "lg" ? "w-6 h-6" : size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"
  return <Icon className={`${box} ${className} shrink-0`} aria-label={label} />
}

/** The icon status of a scenario or step run status. */
export function iconStatusOf(status: string): IconStatus {
  if (status === "PASSED" || status === "FIXED") return "success"
  if (status === "FAILED") return "error"
  if (status === "RUNNING") return "running"
  if (status === "NOT_RUN") return "not-run"
  return "stopped"
}
