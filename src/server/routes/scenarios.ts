import { existsSync } from "node:fs"
import { withDb } from "../../db/connection.ts"
import { resolveDbPath } from "../../db/paths.ts"
import { deleteScenario, getScenario, saveScenario } from "../../db/scenarios.ts"
import { checkSteps, getOrSeedScenarios, type Scenario, targetsUsed } from "../../scenario.ts"
import { describeErrors, validateScenario } from "../../schema.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const scenarioRoutes: Route[] = [
  // GET /api/scenarios
  {
    match: ({ req, pathname }) => pathname === "/api/scenarios" && req.method === "GET",
    handle: async ({ state, res }) => {
      const scenariosList = getOrSeedScenarios(state.config)
      const scenarios = scenariosList.map((scenario) => {
        const id = scenario.id
        const schemaErrors: string[] = []
        if (!validateScenario(scenario)) {
          for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
        }
        const stepErrors = checkSteps(state.config, scenario)
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
      const stepErrors = checkSteps(state.config, scenario)
      const errors = [...schemaErrors, ...stepErrors]

      try {
        withDb(resolveDbPath(state.config.configDir), (db) => saveScenario(db, scenario))
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }

      return sendJson(res, 200, { ok: true, id: body.id, isValid: errors.length === 0, errors })
    },
  },
  // DELETE /api/scenarios/:id
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/scenarios/") && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const id = pathname.replace("/api/scenarios/", "").trim()
      const dbPath = resolveDbPath(state.config.configDir)
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
