import type { DatabaseSync } from "node:sqlite"

/** How many of a step's latest executions its history covers. */
export const STEP_HISTORY_WINDOW = 20

/** One execution of a step: its last automatic attempt in one scenario-iteration of a run. */
export type StepExecution = {
  stepId: string
  status: "PASSED" | "FAILED"
  attempt: number
  durationMs: number | null
  createdAt: number
}

/** A step's latest executions, newest first. */
export type StepHistory = {
  executions: number
  /** Passed on the first attempt. */
  passed: number
  /** Passed only on a retry. */
  recovered: number
  failed: number
  /** 95th percentile duration of passing executions, nearest rank. Absent with no pass. */
  p95Ms?: number
  /** Outcome of each execution, newest first. */
  recent: Array<"PASSED" | "RECOVERED" | "FAILED">
}

/**
 * A scenario's step executions, one per step per scenario-iteration. Manual retries made during a
 * pause are left out, so a step that failed and was fixed by hand counts as failed. Running and
 * cancelled attempts are left out too: they say nothing about the step.
 */
export function getStepExecutions(db: DatabaseSync, scenarioId: string): StepExecution[] {
  // SQLite returns the other columns from the row holding MAX(attempt).
  const rows = db
    .prepare(`
      SELECT step_id, status, MAX(attempt) AS attempt, duration_ms, created_at
      FROM step_runs
      WHERE scenario_id = ? AND manual = 0 AND step_id IS NOT NULL
      GROUP BY step_id, run_id, iteration
    `)
    .all(scenarioId) as Array<{ step_id: string; status: string; attempt: number; duration_ms: number | null; created_at: number | null }>
  return rows
    .filter((row) => row.status === "PASSED" || row.status === "FAILED")
    .map((row) => ({
      stepId: row.step_id,
      status: row.status as StepExecution["status"],
      attempt: row.attempt,
      durationMs: row.duration_ms,
      createdAt: row.created_at ?? 0,
    }))
}

/** Each step's history over its latest `window` executions, keyed by step id. */
export function summarizeStepHistory(executions: StepExecution[], window = STEP_HISTORY_WINDOW): Record<string, StepHistory> {
  const byStep = new Map<string, StepExecution[]>()
  for (const execution of executions) {
    const list = byStep.get(execution.stepId) ?? []
    list.push(execution)
    byStep.set(execution.stepId, list)
  }
  const history: Record<string, StepHistory> = {}
  for (const [stepId, list] of byStep) {
    const latest = list.sort((a, b) => b.createdAt - a.createdAt).slice(0, window)
    const recent: StepHistory["recent"] = latest.map((e) => (e.status === "FAILED" ? "FAILED" : e.attempt > 1 ? "RECOVERED" : "PASSED"))
    const durations = latest
      .filter((e) => e.status === "PASSED" && e.durationMs != null)
      .map((e) => e.durationMs as number)
      .sort((a, b) => a - b)
    history[stepId] = {
      executions: latest.length,
      passed: recent.filter((r) => r === "PASSED").length,
      recovered: recent.filter((r) => r === "RECOVERED").length,
      failed: recent.filter((r) => r === "FAILED").length,
      ...(durations.length > 0 ? { p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] } : {}),
      recent,
    }
  }
  return history
}
