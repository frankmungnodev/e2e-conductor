import type { DatabaseSync } from "node:sqlite"
import { safeJsonParse } from "./connection.ts"

export type RunRecord = {
  id: string
  environmentName: string
  status: "RUNNING" | "PASSED" | "FAILED" | "CANCELLED"
  totalScenarios: number
  passedScenarios: number
  failedScenarios: number
  durationMs?: number
  artifactsDir?: string
  startedAt: number
  completedAt?: number
  /** Why a failed run failed when no single step explains it, e.g. "environment down". */
  reason?: string
  recoveredSteps?: number
  notRunScenarios?: number
  /** Scenario-iterations that paused on a failure and passed after a manual retry. */
  fixedScenarios?: number
}

export type StepRunRecord = {
  id: string
  runId: string
  stepId?: string
  scenarioId: string
  iteration: number
  attempt: number
  status: "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED"
  durationMs?: number
  statusCode?: number
  errorMessage?: string
  resultData?: unknown
  artifactsPath?: string
  createdAt: number
  failureLabel?: string
  /** A retry the user started while the run was paused, not an automatic retry. */
  manual?: boolean
}

export function saveRun(db: DatabaseSync, run: RunRecord): void {
  db.prepare(`
    INSERT INTO runs (
      id, environment_name, status, total_scenarios, passed_scenarios, failed_scenarios,
      duration_ms, artifacts_dir, started_at, completed_at, reason, recovered_steps, not_run_scenarios,
      fixed_scenarios
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      environment_name = excluded.environment_name,
      status = excluded.status,
      total_scenarios = excluded.total_scenarios,
      passed_scenarios = excluded.passed_scenarios,
      failed_scenarios = excluded.failed_scenarios,
      duration_ms = excluded.duration_ms,
      artifacts_dir = excluded.artifacts_dir,
      completed_at = excluded.completed_at,
      reason = excluded.reason,
      recovered_steps = excluded.recovered_steps,
      not_run_scenarios = excluded.not_run_scenarios,
      fixed_scenarios = excluded.fixed_scenarios
  `).run(
    run.id,
    run.environmentName,
    run.status,
    run.totalScenarios,
    run.passedScenarios,
    run.failedScenarios,
    run.durationMs ?? null,
    run.artifactsDir || null,
    run.startedAt,
    run.completedAt || null,
    run.reason || null,
    run.recoveredSteps ?? 0,
    run.notRunScenarios ?? 0,
    run.fixedScenarios ?? 0,
  )
}

type RunRow = {
  id: string
  environment_name: string
  status: "RUNNING" | "PASSED" | "FAILED" | "CANCELLED"
  total_scenarios: number
  passed_scenarios: number
  failed_scenarios: number
  duration_ms?: number | null
  artifacts_dir?: string | null
  started_at: number
  completed_at?: number | null
  reason?: string | null
  recovered_steps?: number | null
  not_run_scenarios?: number | null
  fixed_scenarios?: number | null
}

function mapRunRow(r: RunRow): RunRecord {
  return {
    id: r.id,
    environmentName: r.environment_name,
    status: r.status,
    totalScenarios: r.total_scenarios,
    passedScenarios: r.passed_scenarios,
    failedScenarios: r.failed_scenarios,
    durationMs: r.duration_ms ?? undefined,
    artifactsDir: r.artifacts_dir || undefined,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? undefined,
    reason: r.reason || undefined,
    recoveredSteps: r.recovered_steps ?? 0,
    notRunScenarios: r.not_run_scenarios ?? 0,
    fixedScenarios: r.fixed_scenarios ?? 0,
  }
}

export function getRuns(db: DatabaseSync, limit: number = 50): RunRecord[] {
  const rows = db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?").all(limit) as RunRow[]
  return rows.map(mapRunRow)
}

type StepRunRow = {
  id: string
  run_id: string
  step_id?: string | null
  scenario_id: string
  iteration: number
  attempt: number
  status: "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "SKIPPED"
  duration_ms?: number | null
  status_code?: number | null
  error_message?: string | null
  result_data?: string | null
  artifacts_path?: string | null
  created_at: number
  failure_label?: string | null
  manual?: number | null
}

function mapStepRunRow(sr: StepRunRow): StepRunRecord {
  return {
    id: sr.id,
    runId: sr.run_id,
    stepId: sr.step_id || undefined,
    scenarioId: sr.scenario_id,
    iteration: sr.iteration,
    attempt: sr.attempt,
    status: sr.status,
    durationMs: sr.duration_ms ?? undefined,
    statusCode: sr.status_code ?? undefined,
    errorMessage: sr.error_message || undefined,
    resultData: safeJsonParse<unknown>(sr.result_data),
    artifactsPath: sr.artifacts_path || undefined,
    createdAt: sr.created_at,
    failureLabel: sr.failure_label || undefined,
    manual: sr.manual === 1 || undefined,
  }
}

export function getRun(db: DatabaseSync, id: string): (RunRecord & { stepRuns: StepRunRecord[] }) | undefined {
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined

  if (!row) return undefined

  const stepRows = db.prepare("SELECT * FROM step_runs WHERE run_id = ? ORDER BY created_at ASC, id ASC").all(id) as StepRunRow[]
  const stepRuns = stepRows.map(mapStepRunRow)

  return { ...mapRunRow(row), stepRuns }
}

export function saveStepRun(db: DatabaseSync, stepRun: StepRunRecord): void {
  const resultDataJson = stepRun.resultData !== undefined ? JSON.stringify(stepRun.resultData) : null

  db.prepare(`
    INSERT INTO step_runs (
      id, run_id, step_id, scenario_id, iteration, attempt, status,
      duration_ms, status_code, error_message, result_data, artifacts_path, created_at, failure_label,
      manual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      iteration = excluded.iteration,
      status = excluded.status,
      duration_ms = excluded.duration_ms,
      status_code = excluded.status_code,
      error_message = excluded.error_message,
      result_data = excluded.result_data,
      artifacts_path = excluded.artifacts_path,
      failure_label = excluded.failure_label,
      manual = excluded.manual
  `).run(
    stepRun.id,
    stepRun.runId,
    stepRun.stepId || null,
    stepRun.scenarioId,
    stepRun.iteration,
    stepRun.attempt,
    stepRun.status,
    stepRun.durationMs ?? null,
    stepRun.statusCode ?? null,
    stepRun.errorMessage || null,
    resultDataJson,
    stepRun.artifactsPath || null,
    stepRun.createdAt,
    stepRun.failureLabel || null,
    stepRun.manual ? 1 : 0,
  )
}

export function getStepRuns(
  db: DatabaseSync,
  filter: { runId?: string; stepId?: string; scenarioId?: string; limit?: number },
): StepRunRecord[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filter.runId) {
    conditions.push("run_id = ?")
    params.push(filter.runId)
  }
  if (filter.stepId) {
    conditions.push("step_id = ?")
    params.push(filter.stepId)
  }
  if (filter.scenarioId) {
    conditions.push("scenario_id = ?")
    params.push(filter.scenarioId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
  const limitClause = filter.limit ? "LIMIT ?" : "LIMIT 100"
  if (filter.limit) params.push(filter.limit)

  const rows = db.prepare(`SELECT * FROM step_runs ${whereClause} ORDER BY created_at DESC ${limitClause}`).all(...params) as StepRunRow[]
  return rows.map(mapStepRunRow)
}
