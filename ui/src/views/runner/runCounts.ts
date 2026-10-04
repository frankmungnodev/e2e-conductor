import type { RunSummary } from "../../types.ts"
import { recoveredIn, type ScenarioState } from "./executionTree.ts"

export type RunCounts = {
  passed: number
  failed: number
  fixed: number
  notRun: number
  recovered: number
  total: number
  percent: number
}

/**
 * Scenario counts for the status bar, from the live tree, or from the last summary when there is no
 * tree. Not-run scenarios count as complete: the tree only marks them once the run has finished.
 */
export function runCounts(tree: ScenarioState[], lastSummary?: RunSummary): RunCounts {
  if (tree.length === 0) {
    if (!lastSummary) return { passed: 0, failed: 0, fixed: 0, notRun: 0, recovered: 0, total: 0, percent: 0 }
    const { passed, failed, total } = lastSummary
    return {
      passed,
      failed,
      fixed: lastSummary.fixed ?? 0,
      notRun: lastSummary.notRun?.length ?? 0,
      recovered: lastSummary.recovered ?? 0,
      total,
      percent: 100,
    }
  }
  const count = (status: ScenarioState["status"]) => tree.filter((s) => s.status === status).length
  const passed = count("passed")
  const failed = count("failed")
  const fixed = count("fixed")
  const notRun = count("not_run")
  const recovered = tree.reduce((sum, s) => sum + recoveredIn(s), 0)
  const percent = Math.round(((passed + failed + fixed + notRun) / tree.length) * 100)
  return { passed, failed, fixed, notRun, recovered, total: tree.length, percent }
}
