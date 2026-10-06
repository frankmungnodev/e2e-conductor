import { friendlyPlaceholders } from "../../format.ts"
import type { ScenarioStep } from "../../types.ts"

/** One-line summary of what a step does (its actions, command, request, module, or flow). */
export function StepActionSummary({ step }: { step: ScenarioStep }) {
  if (step.actions && step.actions.length > 0) {
    return (
      <span className="font-mono text-xs text-fg-muted">
        {step.actions.map((a) => a.action).join(" → ")}
      </span>
    )
  }
  if (step.command) return <span className="font-mono text-xs text-fg-muted">{friendlyPlaceholders(step.command)}</span>
  if (step.url) {
    return (
      <span className="font-mono text-xs text-fg-muted">
        <span className="text-info font-bold">{step.method ?? "GET"}</span> {friendlyPlaceholders(step.url)}
      </span>
    )
  }
  if (step.run) return <span className="font-mono text-xs text-fg-muted">{step.run}()</span>
  if (step.flow) return <span className="font-mono text-xs text-fg-muted">flow: {step.flow}</span>
  return null
}
