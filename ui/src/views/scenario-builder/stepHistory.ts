import type { StepHistory } from "../../types.ts"

/** Passed and failed, or passed only after a retry, within its latest executions. */
export function isFlaky(history: StepHistory | undefined): boolean {
  if (!history) return false
  return history.recovered > 0 || (history.failed > 0 && history.passed > 0)
}

/** "18 of 20 passed first try" style headline, or undefined when the step has never run. */
export function historyHeadline(history: StepHistory | undefined): string | undefined {
  if (!history || history.executions === 0) return undefined
  const runs = history.executions === 1 ? "run" : "runs"
  return `Passed first try in ${history.passed} of the last ${history.executions} ${runs}`
}

/** Each part that is not zero: "2 passed only after a retry", "1 failed". */
export function historyDetails(history: StepHistory): string[] {
  const details: string[] = []
  if (history.recovered > 0) details.push(`${history.recovered} passed only after a retry`)
  if (history.failed > 0) details.push(`${history.failed} failed`)
  return details
}
