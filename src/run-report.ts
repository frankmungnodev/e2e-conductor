import type { StepRunRecord } from "./db/runs.ts"
import type { ScenarioRunRecord } from "./db/scenario-runs.ts"

export type ReportFile = { name: string; url: string; isImage: boolean }

export type StepReportStatus = "PASSED" | "FAILED" | "RUNNING" | "NOT_RUN"

/** One step of a scenario-iteration as it ran: its last attempt decides the status. */
export type StepReport = {
  index: number
  name: string
  target: string
  status: StepReportStatus
  /** Automatic and manual attempts together. */
  attempts: number
  durationMs?: number
  error?: string
  failureLabel?: string
  /** Passed only on an automatic retry. */
  recovered: boolean
  /** Passed on a retry the user made while the run was paused. */
  fixedByHand: boolean
  statusCode?: number
}

export type ScenarioReport = {
  scenarioId: string
  name: string
  iteration: number
  status: ScenarioRunRecord["status"]
  durationMs?: number
  changedSinceLastPass: boolean
  steps: StepReport[]
  files: ReportFile[]
}

type Input = {
  scenarioRuns: Array<ScenarioRunRecord & { changedSinceLastPass: boolean }>
  stepRuns: StepRunRecord[]
  /** The pinned content of each fingerprint, as stored in `scenario_versions`. */
  versions: Record<string, string | undefined>
  /** Current scenario names by id; a scenario deleted since keeps its id as its name. */
  names: Record<string, string>
  /** Files saved per scenario artifacts folder. */
  files: Record<string, ReportFile[]>
}

/**
 * What each scenario-iteration of a run did, step by step, in a shape a person can read: step names
 * come from the content the iteration ran, not today's scenario, and each step's attempts collapse
 * into one row. Steps after a failure, or after a cancel, are NOT_RUN.
 */
export function buildRunReport({ scenarioRuns, stepRuns, versions, names, files }: Input): ScenarioReport[] {
  return scenarioRuns.map((run) => {
    const pinned = parseSteps(versions[run.fingerprint])
    const attempts = stepRuns.filter((step) => step.scenarioId === run.scenarioId && step.iteration === run.iteration)
    const byIndex = new Map<number, StepRunRecord[]>()
    for (const attempt of attempts) {
      const index = stepIndexOf(attempt.id)
      if (index === undefined) continue
      byIndex.set(index, [...(byIndex.get(index) ?? []), attempt])
    }
    const count = Math.max(pinned.length, ...[...byIndex.keys()].map((index) => index + 1))
    const steps: StepReport[] = Array.from({ length: count }, (_, index) => {
      const runs = (byIndex.get(index) ?? []).sort((a, b) => a.attempt - b.attempt)
      const last = runs.at(-1)
      const status: StepReportStatus =
        !last ? "NOT_RUN" : last.status === "PASSED" ? "PASSED" : last.status === "FAILED" ? "FAILED" : "RUNNING"
      return {
        index,
        name: pinned[index]?.name ?? `Step ${index + 1}`,
        target: pinned[index]?.target ?? "",
        status,
        attempts: runs.length,
        durationMs: runs.reduce<number | undefined>((sum, r) => (r.durationMs == null ? sum : (sum ?? 0) + r.durationMs), undefined),
        error: status === "FAILED" ? last?.errorMessage : undefined,
        failureLabel: status === "FAILED" ? last?.failureLabel : undefined,
        recovered: status === "PASSED" && !last?.manual && (last?.attempt ?? 1) > 1,
        fixedByHand: status === "PASSED" && last?.manual === true,
        statusCode: last?.statusCode,
      }
    })
    return {
      scenarioId: run.scenarioId,
      name: names[run.scenarioId] ?? run.scenarioId,
      iteration: run.iteration,
      status: run.status,
      durationMs: run.completedAt ? run.completedAt - run.startedAt : undefined,
      changedSinceLastPass: run.changedSinceLastPass,
      steps,
      files: (run.artifactsDir && files[run.artifactsDir]) || [],
    }
  })
}

/** A step run id is `<runId>:<scenarioId>:<iteration>:<stepIndex>:<attempt>`; run ids hold no colon. */
function stepIndexOf(id: string): number | undefined {
  const parts = id.split(":")
  const index = Number(parts.at(-2))
  return parts.length >= 5 && Number.isInteger(index) ? index : undefined
}

function parseSteps(json: string | undefined): Array<{ name?: string; target?: string }> {
  if (!json) return []
  try {
    const steps = (JSON.parse(json) as { steps?: unknown }).steps
    return Array.isArray(steps) ? steps : []
  } catch {
    return []
  }
}
