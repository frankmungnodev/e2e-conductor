import type { DatabaseSync } from "node:sqlite"

export type ScenarioRunStatus = "RUNNING" | "PASSED" | "FAILED" | "FIXED" | "CANCELLED"

/** One scenario-iteration of a run, pinned to the scenario content it started with. */
export type ScenarioRunRecord = {
  runId: string
  scenarioId: string
  iteration: number
  /** Fingerprint of the scenario content; the content itself is in `scenario_versions`. */
  fingerprint: string
  status: ScenarioRunStatus
  /** The scenario-iteration's folder under the run's artifacts folder. */
  artifactsDir?: string
  startedAt: number
  completedAt?: number
}

type ScenarioRunRow = {
  run_id: string
  scenario_id: string
  iteration: number
  fingerprint: string
  status: ScenarioRunStatus
  artifacts_dir?: string | null
  started_at: number
  completed_at?: number | null
  last_pass_fingerprint?: string | null
}

/** Stores a scenario's content under its fingerprint. Content already stored is kept as it is. */
export function saveScenarioVersion(db: DatabaseSync, fingerprint: string, json: string): void {
  db.prepare("INSERT OR IGNORE INTO scenario_versions (fingerprint, scenario_json, created_at) VALUES (?, ?, ?)").run(
    fingerprint,
    json,
    Date.now(),
  )
}

export function getScenarioVersion(db: DatabaseSync, fingerprint: string): string | undefined {
  const row = db.prepare("SELECT scenario_json FROM scenario_versions WHERE fingerprint = ?").get(fingerprint) as
    | { scenario_json: string }
    | undefined
  return row?.scenario_json
}

export function saveScenarioRun(db: DatabaseSync, run: ScenarioRunRecord): void {
  db.prepare(`
    INSERT INTO scenario_runs (run_id, scenario_id, iteration, fingerprint, status, artifacts_dir, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, scenario_id, iteration) DO UPDATE SET
      status = excluded.status,
      completed_at = excluded.completed_at
  `).run(
    run.runId,
    run.scenarioId,
    run.iteration,
    run.fingerprint,
    run.status,
    run.artifactsDir || null,
    run.startedAt,
    run.completedAt ?? null,
  )
}

/**
 * A run's scenario-iterations. `changedSinceLastPass` is derived, not stored: the scenario's
 * latest plain pass that started earlier, in any run or environment, had different content.
 * With no earlier pass there is nothing to compare, so it is false.
 */
export function getScenarioRuns(db: DatabaseSync, runId: string): Array<ScenarioRunRecord & { changedSinceLastPass: boolean }> {
  const rows = db
    .prepare(`
      SELECT sr.*, (
        SELECT prev.fingerprint FROM scenario_runs prev
        WHERE prev.scenario_id = sr.scenario_id AND prev.status = 'PASSED' AND prev.started_at < sr.started_at
        ORDER BY prev.started_at DESC LIMIT 1
      ) AS last_pass_fingerprint
      FROM scenario_runs sr
      WHERE sr.run_id = ?
      ORDER BY sr.started_at ASC
    `)
    .all(runId) as ScenarioRunRow[]
  return rows.map((r) => ({
    runId: r.run_id,
    scenarioId: r.scenario_id,
    iteration: r.iteration,
    fingerprint: r.fingerprint,
    status: r.status,
    artifactsDir: r.artifacts_dir || undefined,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? undefined,
    changedSinceLastPass: r.last_pass_fingerprint != null && r.last_pass_fingerprint !== r.fingerprint,
  }))
}

/**
 * Whether the scenario passed on the content `fingerprint` names: the latest run that ran it on that
 * content finished every iteration `PASSED`. `FIXED` does not count. Derived, never stored, so any
 * content change (a new fingerprint) needs a new pass.
 */
export function passedOnContent(db: DatabaseSync, scenarioId: string, fingerprint: string): boolean {
  const row = db
    .prepare(`
      SELECT NOT EXISTS (
        SELECT 1 FROM scenario_runs sr
        WHERE sr.run_id = latest.run_id AND sr.scenario_id = ? AND sr.fingerprint = ? AND sr.status <> 'PASSED'
      ) AS passed
      FROM (
        SELECT run_id FROM scenario_runs WHERE scenario_id = ? AND fingerprint = ?
        ORDER BY started_at DESC LIMIT 1
      ) latest
    `)
    .get(scenarioId, fingerprint, scenarioId, fingerprint) as { passed: number } | undefined
  return row?.passed === 1
}

/** A run's outcome for one scenario across its iterations: the first status in this order that any iteration has. */
const OUTCOME_ORDER: ScenarioRunStatus[] = ["RUNNING", "FAILED", "CANCELLED", "FIXED", "PASSED"]

/** The latest run that ran the scenario, with its outcome across that run's iterations. */
export function lastScenarioRun(db: DatabaseSync, scenarioId: string): { runId: string; status: ScenarioRunStatus } | undefined {
  const rows = db
    .prepare(`
      SELECT run_id, status FROM scenario_runs
      WHERE scenario_id = ? AND run_id = (
        SELECT run_id FROM scenario_runs WHERE scenario_id = ? ORDER BY started_at DESC LIMIT 1
      )
    `)
    .all(scenarioId, scenarioId) as Array<{ run_id: string; status: ScenarioRunStatus }>
  const status = OUTCOME_ORDER.find((candidate) => rows.some((row) => row.status === candidate))
  return status && { runId: rows[0].run_id, status }
}

/** Why a run failed the scenario: the final failed step attempt. `step` (1-based) and `name` are absent once that step is gone. */
export type ScenarioFailure = { step?: number; name?: string; message: string }

/** The scenario's last failed step attempt in `runId`, or undefined when no step failed there. */
export function scenarioRunFailure(db: DatabaseSync, scenarioId: string, runId: string): ScenarioFailure | undefined {
  const row = db
    .prepare(`
      SELECT sr.error_message, ss.order_num, ss.name FROM step_runs sr
      LEFT JOIN scenario_steps ss ON ss.id = sr.step_id AND ss.scenario_id = sr.scenario_id
      WHERE sr.run_id = ? AND sr.scenario_id = ? AND sr.status = 'FAILED'
      ORDER BY sr.created_at DESC, sr.rowid DESC LIMIT 1
    `)
    .get(runId, scenarioId) as { error_message: string | null; order_num: number | null; name: string | null } | undefined
  if (!row) return undefined
  return {
    ...(row.order_num != null ? { step: row.order_num, name: row.name ?? undefined } : {}),
    message: row.error_message ?? "Failed",
  }
}
