import { formatDuration } from "./format.ts"
import type { FailureLabel, RunSummary } from "./types.ts"

/** Mirrors the reasons in src/run-result.ts. */
export const ENVIRONMENT_DOWN = "environment down"
export const STRICT_RECOVERED = "recovered steps (strict)"
export const FIXED_DURING_RUN = "fixed during run"

const LABEL_TEXT: Record<FailureLabel, string> = {
  "Environment down": "Environment Down",
  "Assertion failed": "Assertion Failed",
  "Step error": "Step Error",
}

/** A failure label in the Title Case that badges use. */
export function failureLabelText(label: FailureLabel): string {
  return LABEL_TEXT[label]
}

export type FinishToast = { tone: "success" | "error"; title: string; message: string }

/** The toast shown when a run finishes. */
export function finishToast(summary: RunSummary): FinishToast {
  if (summary.status === "PASSED") {
    const passed = summary.total === 1 ? "1 scenario passed" : `All ${summary.total} scenarios passed`
    return { tone: "success", title: "Run Passed", message: `${passed} in ${formatDuration(summary.duration_ms)}` }
  }
  if (summary.reason === ENVIRONMENT_DOWN) {
    return { tone: "error", title: "Run Stopped", message: `Stopped: environment down (${(summary.down ?? []).join(", ")})` }
  }
  if (summary.reason === FIXED_DURING_RUN) {
    const fixed = summary.fixed ?? 0
    return {
      tone: "error",
      title: "Fixed During Run",
      message: `${fixed} scenario${fixed === 1 ? " was" : "s were"} fixed while paused, so the run does not count as passed`,
    }
  }
  if (summary.reason === STRICT_RECOVERED) {
    const recovered = summary.recovered ?? 0
    return {
      tone: "error",
      title: "Run Failed",
      message: `Failed (strict): ${recovered} recovered step${recovered === 1 ? "" : "s"}`,
    }
  }
  return { tone: "error", title: "Run Failed", message: `${summary.failed} of ${summary.total} scenarios failed` }
}
