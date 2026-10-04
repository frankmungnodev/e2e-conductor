import type { PausedStep, RunEvent, ScenarioStep } from "../../types.ts"

/**
 * The step the run is paused on, replayed from the event stream. `initial` is the paused step the
 * server reported when the page loaded, used until the stream says something about the pause.
 */
export function pausedFrom(events: RunEvent[], initial: PausedStep | null): PausedStep | null {
  let paused = initial
  for (const ev of events) {
    if (ev.type === "hold_start") {
      const { type: _type, stepName: _stepName, ...pausedStep } = ev
      paused = pausedStep
    } else if (ev.type === "hold_retry" && paused) {
      // The next edit starts from the step the retry ran, not the original.
      paused = ev.passed
        ? { ...paused, step: ev.step, retryPassed: true }
        : { ...paused, step: ev.step, retryPassed: false, error: ev.error ?? paused.error, label: ev.label ?? paused.label }
    } else if (ev.type === "hold_end" || ev.type === "finish" || ev.type === "run_start") {
      paused = null
    }
  }
  return paused
}

/** Parses the retry dialog's text into a step, or says why it cannot be one. */
export function parseStepJson(text: string): { step?: ScenarioStep; error?: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return { error: `Not valid JSON: ${(e as Error).message}` }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { error: "The step must be a JSON object" }
  const step = value as Partial<ScenarioStep>
  if (typeof step.name !== "string" || !step.name.trim()) return { error: "The step needs a name" }
  if (typeof step.target !== "string" || !step.target.trim()) return { error: "The step needs a target" }
  return { step: step as ScenarioStep }
}
