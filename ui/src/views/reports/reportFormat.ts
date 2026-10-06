import { formatDuration } from "../../format.ts"
import type { RunHistoryItem, ScenarioReport } from "../../types.ts"

export { formatDuration }

/** Mirrors the run reasons in src/run-result.ts. */
const ENVIRONMENT_DOWN = "environment down"
const FIXED_DURING_RUN = "fixed during run"
const STRICT_RECOVERED = "recovered steps (strict)"

export type Tone = "success" | "error" | "running" | "stopped"

/** The one-line outcome of a run, worded for someone who has never seen the tool. */
export function runHeadline(run: Pick<RunHistoryItem, "status" | "totalScenarios" | "failedScenarios" | "reason">): {
  tone: Tone
  title: string
} {
  const total = run.totalScenarios ?? 0
  const failed = run.failedScenarios ?? 0
  const scenarios = (n: number) => `${n} scenario${n === 1 ? "" : "s"}`
  switch (run.status) {
    case "PASSED":
      return { tone: "success", title: total === 1 ? "1 scenario passed" : `All ${scenarios(total)} passed` }
    case "RUNNING":
      return { tone: "running", title: "Running…" }
    case "CANCELLED":
      return { tone: "stopped", title: "Stopped before it finished" }
    case "FAILED":
      if (run.reason === ENVIRONMENT_DOWN) return { tone: "error", title: "Stopped: a service or device went down" }
      if (run.reason === FIXED_DURING_RUN) return { tone: "error", title: "Passed only after fixes during the run" }
      if (run.reason === STRICT_RECOVERED) return { tone: "error", title: "Passed only after retries" }
      return { tone: "error", title: total > 0 ? `${failed} of ${scenarios(total)} failed` : "Failed" }
    default:
      return { tone: "stopped", title: "No result recorded" }
  }
}

/** When a run started: "Today, 12:54 AM", "Yesterday, 3:10 PM" or "Oct 5, 3:10 PM". */
export function runWhen(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`
}

const SCENARIO_ORDER: Record<ScenarioReport["status"], number> = { FAILED: 0, CANCELLED: 1, RUNNING: 2, FIXED: 3, PASSED: 4 }

/** Failed scenarios first, so the reason a run is red is the first thing on screen. */
export function sortScenarioReports(reports: ScenarioReport[]): ScenarioReport[] {
  return [...reports].sort((a, b) => SCENARIO_ORDER[a.status] - SCENARIO_ORDER[b.status])
}

/** A short note on how a passing step got there, or undefined for a plain first-try pass. */
export function stepNote(step: { recovered: boolean; fixedByHand: boolean; attempts: number }): string | undefined {
  if (step.fixedByHand) return "Passed after you fixed it during the run"
  if (step.recovered) return `Passed on try ${step.attempts}, after ${step.attempts - 1} failed ${step.attempts === 2 ? "try" : "tries"}`
  return undefined
}
