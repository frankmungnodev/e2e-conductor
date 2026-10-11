import { existsSync } from "node:fs"
import { withDb } from "../../db/connection.ts"
import { type Draft, getDrafts } from "../../db/drafts.ts"
import { deleteScenario, getScenario, saveScenario } from "../../db/scenarios.ts"
import { getStepExecutions, summarizeStepHistory } from "../../db/step-history.ts"
import { formatProblem } from "../../problems.ts"
import { checkSteps, getOrSeedScenarios, type Scenario, targetsUsed } from "../../scenario.ts"
import { describeErrors, validateScenario } from "../../schema.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

function draftSummary(draft: Draft | undefined) {
  if (!draft) return undefined
  return { state: draft.state, group: draft.group, ...(draft.revisionOf ? { revisionOf: draft.revisionOf } : {}) }
}

export const scenarioRoutes: Route[] = [
  // GET /api/scenarios
  {
    match: ({ req, pathname }) => pathname === "/api/scenarios" && req.method === "GET",
    handle: async ({ state, res }) => {
      const scenariosList = getOrSeedScenarios(state.config)
      // A draft's state travels outside `raw`, so the builder never posts it back.
      const drafts = new Map<string, Draft>()
      if (existsSync(state.config.dbPath)) {
        for (const draft of withDb(state.config.dbPath, getDrafts)) drafts.set(draft.id, draft)
      }
      const scenarios = scenariosList.map((scenario) => {
        const id = scenario.id
        const schemaErrors: string[] = []
        if (!validateScenario(scenario)) {
          for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
        }
        const stepErrors = checkSteps(state.config, scenario).map(formatProblem)
        const errors = [...schemaErrors, ...stepErrors]
        return {
          id,
          file: `${id}.json`,
          name: scenario.name ?? id,
          description: scenario.description,
          steps: scenario.steps ?? [],
          setup: scenario.setup ?? [],
          vars: scenario.vars ?? {},
          raw: scenario,
          isValid: errors.length === 0,
          errors,
          targets: Array.from(targetsUsed([scenario])),
          draft: draftSummary(drafts.get(id)),
        }
      })
      return sendJson(res, 200, scenarios)
    },
  },
  // POST /api/scenarios
  {
    match: ({ req, pathname }) => pathname === "/api/scenarios" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as { id?: string; content?: Scenario }
      if (!body?.id || !body.content) {
        return sendJson(res, 400, { error: "Missing 'id' or 'content' in payload" })
      }
      const scenario = { ...body.content, id: body.id }
      const schemaErrors: string[] = []
      if (!validateScenario(body.content)) {
        for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
      }
      const stepErrors = checkSteps(state.config, scenario).map(formatProblem)
      const errors = [...schemaErrors, ...stepErrors]

      try {
        withDb(state.config.dbPath, (db) => saveScenario(db, scenario))
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }

      return sendJson(res, 200, { ok: true, id: body.id, isValid: errors.length === 0, errors })
    },
  },
  // GET /api/scenarios/:id/step-history
  {
    match: ({ req, pathname }) => /^\/api\/scenarios\/[^/]+\/step-history$/.test(pathname) && req.method === "GET",
    handle: async ({ state, res, pathname }) => {
      const id = decodeURIComponent(pathname.split("/")[3])
      if (!existsSync(state.config.dbPath)) return sendJson(res, 200, {})
      try {
        return sendJson(res, 200, withDb(state.config.dbPath, (db) => summarizeStepHistory(getStepExecutions(db, id))))
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }
    },
  },
  // DELETE /api/scenarios/:id
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/scenarios/") && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const id = decodeURIComponent(pathname.replace("/api/scenarios/", "").trim())
      const dbPath = state.config.dbPath
      let found = false
      if (existsSync(dbPath)) {
        try {
          found = withDb(dbPath, (db) => {
            if (!getScenario(db, id)) return false
            deleteScenario(db, id)
            return true
          })
        } catch (error) {
          return sendJson(res, 500, { error: (error as Error).message })
        }
      }

      if (found) {
        return sendJson(res, 200, { ok: true, id })
      }
      return sendJson(res, 404, { error: `Scenario ${id} not found` })
    },
  },
]
