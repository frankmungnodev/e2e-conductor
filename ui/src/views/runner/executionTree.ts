import { ENVIRONMENT_DOWN } from "../../runResult.ts"
import type { FailureLabel, RunEvent, RunSummary, ScenarioItem } from "../../types.ts"

/** `not_run` is set only when the run finishes after an environment-down stop. */
export type RunState = "pending" | "running" | "passed" | "failed" | "not_run"

export type StepState = {
  name: string
  target: string
  status: RunState
  duration_ms?: number
  error?: string
  label?: FailureLabel
  /** Passed only after a retry. */
  recovered?: boolean
}

export type ScenarioState = {
  id: string
  name: string
  iteration: number
  totalIterations: number
  status: RunState
  duration_ms?: number
  error?: string
  /** The scenario's failure label; the only place a failed setup fixture's label shows. */
  label?: FailureLabel
  steps: StepState[]
}

function markPendingStepsNotRun(scenario: ScenarioState) {
  for (const step of scenario.steps) {
    if (step.status === "pending") step.status = "not_run"
  }
}

/**
 * Marks what an environment-down stop never reached. Pending entries change only when the summary
 * lists them in `notRun`, so a summary from before not-run existed leaves them pending.
 */
function applyStop(tree: ScenarioState[], summary: RunSummary, lastEnded?: ScenarioState) {
  for (const entry of summary.notRun ?? []) {
    const scenario = tree.find((s) => s.id === entry.scenario && s.iteration === entry.iteration)
    if (scenario?.status !== "pending") continue
    scenario.status = "not_run"
    markPendingStepsNotRun(scenario)
  }
  if (summary.reason === ENVIRONMENT_DOWN && lastEnded) markPendingStepsNotRun(lastEnded)
}

/** How many of a scenario's steps passed only on a retry. */
export function recoveredIn(scenario: ScenarioState): number {
  return scenario.steps.filter((st) => st.recovered).length
}

/** Rebuilds the live scenario/step tree from the run's event stream. */
export function buildExecutionTree(events: RunEvent[], scenarios: ScenarioItem[]): ScenarioState[] {
  let tree: ScenarioState[] = []
  let lastEnded: ScenarioState | undefined

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
        if (ev.recovered) target.steps[ev.index].recovered = true
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
            label: ev.label,
          }
        } else {
          target.steps[ev.index].status = "failed"
          target.steps[ev.index].duration_ms = ev.duration_ms
          target.steps[ev.index].error = ev.error
          target.steps[ev.index].label = ev.label
        }
      }
    } else if (ev.type === "scenario_end") {
      const target = tree.find((s) => s.id === ev.scenarioId && s.iteration === ev.iteration)
      if (target) {
        target.status = ev.passed ? "passed" : "failed"
        target.duration_ms = ev.duration_ms
        target.error = ev.error
        target.label = ev.label
        lastEnded = target
      }
    } else if (ev.type === "finish") {
      applyStop(tree, ev.summary, lastEnded)
    }
  }

  return [...tree]
}
