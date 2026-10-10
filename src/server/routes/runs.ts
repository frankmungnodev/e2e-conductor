import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { reloadConfig, resolveFromConfig } from "../../config.ts"
import { withDb } from "../../db/connection.ts"
import { effectiveStatus, getRun, getRuns, getStepRuns } from "../../db/runs.ts"
import { getScenarioRuns, getScenarioVersion } from "../../db/scenario-runs.ts"
import { getScenario, replaceScenarioStep } from "../../db/scenarios.ts"
import { HoldController } from "../../hold.ts"
import { buildRunReport } from "../../run-report.ts"
import { type RunOptions, run, type Summary } from "../../runner.ts"
import type { Step } from "../../scenario.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"
import type { ServerState } from "../state.ts"

/** Saves a step whose retry passed into its stored scenario; returns the scenario's name, or undefined when it was not saved. */
function saveFixedStep(state: ServerState, scenarioId: string, step: Step): string | undefined {
  let savedTo: string | undefined
  try {
    savedTo = withDb(state.config.dbPath, (db) => replaceScenarioStep(db, scenarioId, step))
  } catch (error) {
    state.broadcast({ type: "log", text: `Could not save the fixed step: ${(error as Error).message}`, level: "info" })
    return undefined
  }
  const text = savedTo
    ? `Saved the fixed step to scenario "${savedTo}"`
    : `Did not save the fixed step: step "${step.name}" is no longer in scenario "${scenarioId}"`
  state.broadcast({ type: "log", text, level: "info" })
  return savedTo
}

export const runRoutes: Route[] = [
  // SSE events stream
  {
    match: ({ req, pathname }) => pathname === "/api/events" && req.method === "GET",
    handle: async ({ state, req, res }) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      })
      res.write(`data: ${JSON.stringify({ type: "connected", active: Boolean(state.activeRun) })}\n\n`)
      if (state.lastEvent) {
        res.write(`data: ${JSON.stringify(state.lastEvent)}\n\n`)
      }
      state.sseClients.add(res)
      req.on("close", () => {
        state.sseClients.delete(res)
      })
      return
    },
  },
  // POST /api/run
  {
    match: ({ req, pathname }) => pathname === "/api/run" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      if (state.activeRun) {
        return sendJson(res, 409, { error: "A test run is already in progress", runId: state.activeRun.runId })
      }
      const body = (await readBody(req)) as {
        scenarios?: string[]
        repeat?: number
        start?: boolean
        install?: boolean
        headless?: boolean
        verbose?: boolean
        environment?: string
        pauseOnFailure?: boolean
        stepScreenshots?: boolean
      }
      if (body.headless) process.env.E2E_HEADLESS = "1"
      if (body.verbose) process.env.E2E_VERBOSE = "1"

      const controller = new AbortController()
      const hold = body.pauseOnFailure ? new HoldController(controller.signal) : undefined
      const runOptions: RunOptions = {
        scenarios: body.scenarios ?? [],
        repeat: Math.max(1, body.repeat ?? 1),
        start: Boolean(body.start),
        install: Boolean(body.install),
        checkOnly: false,
        signal: controller.signal,
        pause: hold?.hook,
        stepScreenshots: Boolean(body.stepScreenshots),
        onEvent: (event) => {
          // Save a passing retry before broadcasting it, and say on the event whether it was saved.
          if (event.type === "hold_retry" && event.passed) {
            const savedTo = saveFixedStep(state, event.scenarioId, event.step)
            state.broadcast({ ...event, savedTo })
            return
          }
          state.broadcast(event)
        },
      }

      const runId = new Date().toISOString().replace(/[:.]/g, "-")
      state.activeRun = {
        runId,
        options: runOptions,
        startedAt: Date.now(),
        controller,
        hold,
      }

      // Launch run asynchronously
      void (async () => {
        try {
          let runConfig = state.config
          if (body.environment) {
            try {
              runConfig = await reloadConfig(state.config, body.environment)
            } catch {
              // Fall back to state.config if loading fails
            }
          }
          const summary = await run(runConfig, runOptions)
          state.lastSummary = summary
        } catch (err) {
          const errorMsg = (err as Error).message
          state.broadcast({
            type: "log",
            text: `Run error: ${errorMsg}`,
            level: "info",
          })
          state.broadcast({
            type: "finish",
            summary: {
              status: "FAILED",
              total: Math.max(1, (runOptions.scenarios?.length || 1) * (runOptions.repeat || 1)),
              passed: 0,
              failed: Math.max(1, (runOptions.scenarios?.length || 1) * (runOptions.repeat || 1)),
              duration_ms: Date.now() - (state.activeRun?.startedAt ?? Date.now()),
              failures: [{ scenario: "run", iteration: 1, step: "init", error: errorMsg }],
              artifacts: "",
              fixed: 0,
              recovered: 0,
              notRun: [],
            },
          })
        } finally {
          state.activeRun = null
        }
      })()

      return sendJson(res, 200, { ok: true, runId })
    },
  },
  // POST /api/run/stop
  {
    match: ({ req, pathname }) => pathname === "/api/run/stop" && req.method === "POST",
    handle: async ({ state, res }) => {
      if (!state.activeRun) {
        return sendJson(res, 400, { error: "No active run to stop" })
      }
      state.activeRun.controller.abort()
      return sendJson(res, 200, { ok: true, message: "Run cancellation requested" })
    },
  },
  // GET /api/run/status
  {
    match: ({ req, pathname }) => pathname === "/api/run/status" && req.method === "GET",
    handle: async ({ state, res }) => {
      return sendJson(res, 200, {
        isRunning: Boolean(state.activeRun),
        currentRun: state.activeRun
          ? {
              runId: state.activeRun.runId,
              startedAt: state.activeRun.startedAt,
              duration_ms: Date.now() - state.activeRun.startedAt,
              options: {
                scenarios: state.activeRun.options.scenarios,
                repeat: state.activeRun.options.repeat,
              },
              paused: state.activeRun.hold?.paused ?? null,
            }
          : null,
        lastSummary: state.lastSummary,
      })
    },
  },
  // GET /api/runs
  {
    match: ({ req, pathname }) => pathname === "/api/runs" && req.method === "GET",
    handle: async ({ state, res }) => {
      const resultsDir = resolveFromConfig(state.config, state.config.results)
      const artifactsDir = join(resultsDir, "artifacts")
      const runsMap = new Map<
        string,
        {
          runId: string
          timestamp: number
          scenarios: string[]
          status?: string
          environmentName?: string
          totalScenarios?: number
          passedScenarios?: number
          failedScenarios?: number
          durationMs?: number
          reason?: string
          recoveredSteps?: number
          notRunScenarios?: number
          fixedScenarios?: number
        }
      >()

      const dbPath = state.config.dbPath
      if (existsSync(dbPath)) {
        try {
          withDb(dbPath, (db) => {
            const dbRuns = getRuns(db, 100)
            for (const r of dbRuns) {
              runsMap.set(r.id, {
                runId: r.id,
                timestamp: r.startedAt,
                status: effectiveStatus(r, state.activeRun?.runId),
                environmentName: r.environmentName,
                totalScenarios: r.totalScenarios,
                passedScenarios: r.passedScenarios,
                failedScenarios: r.failedScenarios,
                durationMs: r.durationMs,
                reason: r.reason,
                recoveredSteps: r.recoveredSteps,
                fixedScenarios: r.fixedScenarios,
                notRunScenarios: r.notRunScenarios,
                scenarios: [],
              })
            }
          })
        } catch {
          // ignore
        }
      }

      if (existsSync(artifactsDir)) {
        const entries = readdirSync(artifactsDir).filter((e) => statSync(join(artifactsDir, e)).isDirectory())
        for (const entry of entries) {
          const dir = join(artifactsDir, entry)
          const scenarioFolders = readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())
          const stat = statSync(dir)
          const existing = runsMap.get(entry)
          if (existing) {
            existing.scenarios = scenarioFolders
          } else {
            runsMap.set(entry, {
              runId: entry,
              timestamp: stat.mtimeMs,
              scenarios: scenarioFolders,
            })
          }
        }
      }

      const runs = Array.from(runsMap.values()).sort((a, b) => b.timestamp - a.timestamp)

      const latestSummaryPath = join(resultsDir, "summary.json")
      let latestSummary: Summary | undefined
      if (existsSync(latestSummaryPath)) {
        try {
          latestSummary = JSON.parse(readFileSync(latestSummaryPath, "utf8"))
        } catch {
          // ignore
        }
      }

      return sendJson(res, 200, { runs, latestSummary })
    },
  },
  // GET /api/runs/:runId
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/runs/") && req.method === "GET",
    handle: async ({ state, res, pathname }) => {
      const runId = pathname.replace("/api/runs/", "").trim()
      const dbPath = state.config.dbPath
      let dbRun: ReturnType<typeof getRun> | undefined
      let scenarioRuns: ReturnType<typeof getScenarioRuns> = []
      const versions: Record<string, string | undefined> = {}
      const names: Record<string, string> = {}
      if (existsSync(dbPath)) {
        try {
          withDb(dbPath, (db) => {
            dbRun = getRun(db, runId)
            scenarioRuns = getScenarioRuns(db, runId)
            for (const { fingerprint, scenarioId } of scenarioRuns) {
              versions[fingerprint] ??= getScenarioVersion(db, fingerprint)
              names[scenarioId] ??= getScenario(db, scenarioId)?.name ?? scenarioId
            }
          })
        } catch {
          // ignore
        }
      }

      const resultsDir = resolveFromConfig(state.config, state.config.results)
      const runDir = join(resultsDir, "artifacts", runId)
      const scenarioArtifacts: Record<string, Array<{ name: string; url: string; isImage: boolean }>> = {}

      if (existsSync(runDir)) {
        const scenariosList = readdirSync(runDir).filter((e) => statSync(join(runDir, e)).isDirectory())
        for (const s of scenariosList) {
          const sDir = join(runDir, s)
          const files = readdirSync(sDir).filter((f) => statSync(join(sDir, f)).isFile())
          // Artifacts are cached for an hour, and a manual retry rewrites a step screenshot in place,
          // so the URL carries the file's modification time.
          scenarioArtifacts[s] = files.map((f) => ({
            name: f,
            url: `/api/artifacts/${runId}/${s}/${f}?v=${Math.floor(statSync(join(sDir, f)).mtimeMs)}`,
            isImage: [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(f).toLowerCase()),
          }))
        }
      } else if (!dbRun) {
        return sendJson(res, 404, { error: `Run ${runId} not found` })
      }

      // Each run keeps its own log since this version; older runs only have it if they were the latest.
      const ownLog = join(runDir, "run.log")
      const latestLog = join(resultsDir, "run.log")
      const isLatest = latestRunId(resultsDir) === runId
      const runLogPath = existsSync(ownLog) ? ownLog : isLatest && existsSync(latestLog) ? latestLog : undefined
      const runLog = runLogPath ? readFileSync(runLogPath, "utf8") : ""

      return sendJson(res, 200, {
        runId,
        status: dbRun && effectiveStatus(dbRun, state.activeRun?.runId),
        environmentName: dbRun?.environmentName,
        durationMs: dbRun?.durationMs,
        totalScenarios: dbRun?.totalScenarios,
        passedScenarios: dbRun?.passedScenarios,
        failedScenarios: dbRun?.failedScenarios,
        reason: dbRun?.reason,
        recoveredSteps: dbRun?.recoveredSteps,
        notRunScenarios: dbRun?.notRunScenarios,
        fixedScenarios: dbRun?.fixedScenarios,
        stepRuns: dbRun?.stepRuns ?? [],
        scenarioRuns,
        report: buildRunReport({ scenarioRuns, stepRuns: dbRun?.stepRuns ?? [], versions, names, files: scenarioArtifacts }),
        scenarios: scenarioArtifacts,
        runLog,
      })
    },
  },
  // GET /api/step-runs
  {
    match: ({ req, pathname }) => pathname === "/api/step-runs" && req.method === "GET",
    handle: async ({ state, req, res }) => {
      const urlObj = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      const scenarioId = urlObj.searchParams.get("scenarioId") || undefined
      const stepId = urlObj.searchParams.get("stepId") || undefined
      const runId = urlObj.searchParams.get("runId") || undefined
      const limit = urlObj.searchParams.has("limit") ? Number(urlObj.searchParams.get("limit")) : 200
      const dbPath = state.config.dbPath
      if (existsSync(dbPath)) {
        try {
          const stepRuns = withDb(dbPath, (db) => getStepRuns(db, { scenarioId, stepId, runId, limit }))
          return sendJson(res, 200, stepRuns)
        } catch (e) {
          return sendJson(res, 500, { error: (e as Error).message })
        }
      }
      return sendJson(res, 200, [])
    },
  },
  // GET /api/steps/:stepId/runs
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/steps/") && pathname.endsWith("/runs") && req.method === "GET",
    handle: async ({ state, res, pathname }) => {
      const stepId = decodeURIComponent(pathname.replace("/api/steps/", "").replace("/runs", ""))
      const dbPath = state.config.dbPath
      if (existsSync(dbPath)) {
        try {
          const stepRuns = withDb(dbPath, (db) => getStepRuns(db, { stepId, limit: 100 }))
          return sendJson(res, 200, stepRuns)
        } catch (e) {
          return sendJson(res, 500, { error: (e as Error).message })
        }
      }
      return sendJson(res, 200, [])
    },
  },
]

/** The run `summary.json` describes, which is the run `results/run.log` belongs to. */
function latestRunId(resultsDir: string): string | undefined {
  try {
    const summary = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as { artifacts?: string }
    return summary.artifacts ? basename(summary.artifacts) : undefined
  } catch {
    return undefined
  }
}
