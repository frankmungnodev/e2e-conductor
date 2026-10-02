import type { RunEvent, ScenarioItem } from "../../types.ts"

export type StepState = {
  name: string
  target: string
  status: "pending" | "running" | "passed" | "failed"
  duration_ms?: number
  error?: string
}

export type ScenarioState = {
  id: string
  name: string
  iteration: number
  totalIterations: number
  status: "pending" | "running" | "passed" | "failed"
  duration_ms?: number
  error?: string
  steps: StepState[]
}

/** Rebuilds the live scenario/step tree from the run's event stream. */
export function buildExecutionTree(events: RunEvent[], scenarios: ScenarioItem[]): ScenarioState[] {
  let tree: ScenarioState[] = []

  for (const ev of events) {
    if (ev.type === "run_start") {
      tree = []
      for (let iter = 1; iter <= ev.repeat; iter++) {
        for (const s of ev.scenarios) {
          const scObj = scenarios.find((item) => item.id === s.id)
          tree.push({
            id: s.id,
            name: s.name,
            iteration: iter,
            totalIterations: ev.repeat,
            status: "pending",
            steps: (scObj?.steps ?? []).map((step) => ({
              name: step.name,
              target: step.target,
              status: "pending",
            })),
          })
        }
      }
    } else if (ev.type === "scenario_start") {
      const target = tree.find((s) => s.id === ev.scenarioId && s.iteration === ev.iteration)
      if (target) {
        target.status = "running"
      }
    } else if (ev.type === "step_start") {
      const target = tree.find((s) => s.id === ev.scenarioId && s.status === "running")
      if (target) {
        if (!target.steps[ev.index]) {
          target.steps[ev.index] = {
            name: ev.stepName,
            target: ev.target,
            status: "running",
          }
        } else {
          target.steps[ev.index].status = "running"
        }
      }
    } else if (ev.type === "step_pass") {
      const target = tree.find((s) => s.id === ev.scenarioId && s.status === "running")
      if (target) {
        if (!target.steps[ev.index]) {
          target.steps[ev.index] = {
            name: ev.stepName,
            target: ev.target,
            status: "passed",
            duration_ms: ev.duration_ms,
          }
        } else {
          target.steps[ev.index].status = "passed"
          target.steps[ev.index].duration_ms = ev.duration_ms
        }
      }
    } else if (ev.type === "step_fail") {
      const target = tree.find((s) => s.id === ev.scenarioId && s.status === "running")
      if (target) {
        if (!target.steps[ev.index]) {
          target.steps[ev.index] = {
            name: ev.stepName,
            target: ev.target,
            status: "failed",
            duration_ms: ev.duration_ms,
            error: ev.error,
          }
        } else {
          target.steps[ev.index].status = "failed"
          target.steps[ev.index].duration_ms = ev.duration_ms
          target.steps[ev.index].error = ev.error
        }
      }
    } else if (ev.type === "scenario_end") {
      const target = tree.find((s) => s.id === ev.scenarioId && s.iteration === ev.iteration)
      if (target) {
        target.status = ev.passed ? "passed" : "failed"
        target.duration_ms = ev.duration_ms
        target.error = ev.error
      }
    }
  }

  return [...tree]
}
