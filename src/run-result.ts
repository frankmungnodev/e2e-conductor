import type { Summary } from "./runner.ts"

/** A scenario-iteration the run never reached, because an environment-down failure stopped it. */
export type NotRun = { scenario: string; iteration: number }

export const ENVIRONMENT_DOWN = "environment down"
export const STRICT_RECOVERED = "recovered steps (strict)"

/**
 * Everything after the scenario at `index` in `iteration`: the rest of that iteration, then every
 * later iteration in full. Counted per scenario-iteration so passed + failed + not run adds up
 * to the run's total.
 */
export function notRunAfter(scenarioIds: string[], repeat: number, iteration: number, index: number): NotRun[] {
  const rest: NotRun[] = scenarioIds.slice(index + 1).map((scenario) => ({ scenario, iteration }))
  for (let later = iteration + 1; later <= repeat; later++) {
    rest.push(...scenarioIds.map((scenario) => ({ scenario, iteration: later })))
  }
  return rest
}

/**
 * Decide the run's status. The environment-down reason is set by the scenario loop and wins;
 * strict turns a run whose only issue is recovered steps into a failure, so the exit code,
 * summary.json and the stored run all agree.
 */
export function settleStatus(summary: Summary, strict: boolean) {
  if (strict) summary.strict = true
  if (summary.reason === ENVIRONMENT_DOWN || summary.failed > 0) {
    summary.status = "FAILED"
  } else if (strict && summary.recovered > 0) {
    summary.status = "FAILED"
    summary.reason = STRICT_RECOVERED
  } else {
    summary.status = "PASSED"
  }
}

/** The run's one-line result, e.g. "FAILED (environment down: service api (http://…)) 0/3 passed, 2 not run in 1.2s". */
export function resultLine(summary: Summary): string {
  const counts = [`${summary.passed}/${summary.total} passed`]
  if (summary.recovered > 0) counts.push(`${summary.recovered} recovered`)
  if (summary.notRun.length > 0) counts.push(`${summary.notRun.length} not run`)
  const tail = `${counts.join(", ")} in ${(summary.duration_ms / 1000).toFixed(1)}s`
  if (summary.reason === ENVIRONMENT_DOWN) return `FAILED (${ENVIRONMENT_DOWN}: ${(summary.down ?? []).join(", ")}) ${tail}`
  if (summary.reason === STRICT_RECOVERED) return `FAILED (strict): ${tail}`
  return `${summary.status} ${tail}`
}
