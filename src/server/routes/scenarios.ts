import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resolveFromConfig } from "../../config.ts"
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
      const checkedFlows = new Set<string>()
      const scenarios = scenariosList.map((scenario) => {
        const id = scenario.id
        const schemaErrors: string[] = []
        if (!validateScenario(scenario)) {
          for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
        }
        const stepErrors = checkSteps(state.config, scenario, checkedFlows)
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
      const stepErrors = checkSteps(state.config, scenario, new Set())
      const errors = [...schemaErrors, ...stepErrors]

      // Save to SQLite
      const dbPath = resolveDbPath(state.config.configDir)
      if (existsSync(dbPath)) {
        try {
          withDb(dbPath, (db) => saveScenario(db, scenario))
        } catch {
          // ignore db save error
        }
      }

      // Sync to filesystem
      try {
        const dir = resolveFromConfig(state.config, state.config.scenarios)
        mkdirSync(dir, { recursive: true })
        const filePath = join(dir, `${body.id}.json`)
        writeFileSync(filePath, `${JSON.stringify(body.content, null, 2)}\n`)
      } catch {
        // ignore fs error
      }

      return sendJson(res, 200, { ok: true, id: body.id, isValid: errors.length === 0, errors })
    },
  },
  // DELETE /api/scenarios/:id
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/scenarios/") && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const id = pathname.replace("/api/scenarios/", "").trim()
      let found = false

      // Delete from SQLite
      const dbPath = resolveDbPath(state.config.configDir)
      if (existsSync(dbPath)) {
        try {
          withDb(dbPath, (db) => {
            const existing = getScenario(db, id)
            if (existing) {
              deleteScenario(db, id)
              found = true
            }
          })
        } catch {
          // ignore db delete error
        }
      }

      // Delete from filesystem
      const dir = resolveFromConfig(state.config, state.config.scenarios)
      const filePath = join(dir, `${id}.json`)
      if (existsSync(filePath)) {
        rmSync(filePath)
        found = true
      }

      if (found) {
        return sendJson(res, 200, { ok: true, id })
      }
      return sendJson(res, 404, { error: `Scenario ${id} not found` })
    },
  },
]
