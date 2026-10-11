import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { resolveFromConfig } from "../../config.ts"
import { withDb } from "../../db/connection.ts"
import { getRun } from "../../db/runs.ts"
import { getScenarioRuns, getScenarioVersion } from "../../db/scenario-runs.ts"
import { buildFailureTimeline } from "../../failure-timeline.ts"
import { attemptsOf, parseSteps } from "../../run-report.ts"
import { sendJson } from "../http.ts"
import type { Route } from "../route.ts"

const TIMELINE_PATH = /^\/api\/runs\/([^/]+)\/scenarios\/([^/]+)\/(\d+)\/timeline$/

export const timelineRoutes: Route[] = [
  // GET /api/runs/:runId/scenarios/:scenarioId/:iteration/timeline
  {
    match: ({ req, pathname }) => TIMELINE_PATH.test(pathname) && req.method === "GET",
    handle: async ({ state, res, pathname }) => {
      const [, runId, scenarioId, iterationText] = TIMELINE_PATH.exec(pathname) ?? []
      const scenario = decodeURIComponent(scenarioId)
      const iteration = Number(iterationText)
      if (!existsSync(state.config.dbPath)) return sendJson(res, 404, { error: `Run ${runId} not found` })
      const found = withDb(state.config.dbPath, (db) => {
        const scenarioRun = getScenarioRuns(db, runId).find((r) => r.scenarioId === scenario && r.iteration === iteration)
        if (!scenarioRun) return undefined
        const attempts = attemptsOf(getRun(db, runId)?.stepRuns ?? [], scenario, iteration)
        return { scenarioRun, attempts, steps: parseSteps(getScenarioVersion(db, scenarioRun.fingerprint)) }
      })
      if (!found) return sendJson(res, 404, { error: `Scenario ${scenario} repeat ${iteration} not found in run ${runId}` })

      const { scenarioRun, attempts, steps } = found
      const resultsDir = resolveFromConfig(state.config, state.config.results)
      // The folder name comes from the database; basename keeps the read inside the run's folder.
      const dir = scenarioRun.artifactsDir && join(resultsDir, "artifacts", basename(runId), basename(scenarioRun.artifactsDir))
      const read = (name: string) => {
        if (!dir) return undefined
        try {
          return readFileSync(join(dir, name), "utf8")
        } catch {
          return undefined
        }
      }
      return sendJson(
        res,
        200,
        buildFailureTimeline({
          startedAt: scenarioRun.startedAt,
          steps,
          attempts,
          httpExchanges: read("http-exchanges.json"),
          logcat: read("mobile-logcat.txt"),
        }),
      )
    },
  },
]
