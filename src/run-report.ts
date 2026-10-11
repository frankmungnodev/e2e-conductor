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
  /** The screen as the step left it, saved when the run had "Screenshot every step" on. */
  screenshot?: ReportFile
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
    const byIndex = new Map<number, StepRunRecord[]>()
    for (const attempt of attemptsOf(stepRuns, run.scenarioId, run.iteration)) {
      byIndex.set(attempt.index, [...(byIndex.get(attempt.index) ?? []), attempt])
    }
    const scenarioFiles = (run.artifactsDir && files[run.artifactsDir]) || []
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
        screenshot: scenarioFiles.find((file) => file.name === `step-${index + 1}.png`),
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
      files: scenarioFiles,
    }
  })
}

/** A step attempt with its step's position in the scenario. */
export type StepAttempt = StepRunRecord & { index: number }

/** A scenario-iteration's step attempts, in the order given. An attempt whose id has no position is left out. */
export function attemptsOf(stepRuns: StepRunRecord[], scenarioId: string, iteration: number): StepAttempt[] {
  return stepRuns.flatMap((attempt) => {
    const index = stepIndexOf(attempt.id)
    return attempt.scenarioId === scenarioId && attempt.iteration === iteration && index !== undefined ? [{ ...attempt, index }] : []
  })
}

/** A step run id is `<runId>:<scenarioId>:<iteration>:<stepIndex>:<attempt>`; run ids hold no colon. */
function stepIndexOf(id: string): number | undefined {
  const parts = id.split(":")
  const index = Number(parts.at(-2))
  return parts.length >= 5 && Number.isInteger(index) ? index : undefined
}

export function parseSteps(json: string | undefined): Array<{ name?: string; target?: string }> {
  if (!json) return []
  try {
    const steps = (JSON.parse(json) as { steps?: unknown }).steps
    return Array.isArray(steps) ? steps : []
  } catch {
    return []
  }
}
