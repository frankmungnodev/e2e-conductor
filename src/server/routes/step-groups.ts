import { existsSync } from "node:fs"
import { withDb } from "../../db/connection.ts"
import { resolveDbPath } from "../../db/paths.ts"
import { deleteStepGroup, getStepGroups, type StepGroup, saveStepGroup } from "../../db/step-groups.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const stepGroupRoutes: Route[] = [
  // GET /api/step-groups
  {
    match: ({ req, pathname }) => pathname === "/api/step-groups" && req.method === "GET",
    handle: async ({ state, res }) => {
      const dbPath = resolveDbPath(state.config.configDir)
      if (!existsSync(dbPath)) {
        return sendJson(res, 200, { stepGroups: [] })
      }
      try {
        const stepGroups = withDb(dbPath, (db) => getStepGroups(db))
        return sendJson(res, 200, { stepGroups })
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }
    },
  },
  // POST /api/step-groups
  {
    match: ({ req, pathname }) => pathname === "/api/step-groups" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as StepGroup
      if (!body?.name || !body.steps) {
        return sendJson(res, 400, { error: "Missing required fields: name and steps" })
      }
      const dbPath = resolveDbPath(state.config.configDir)
      try {
        const group: StepGroup = {
          id: body.id || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: body.name.trim(),
          description: body.description?.trim(),
          target: body.target,
          steps: body.steps,
          createdAt: body.createdAt,
          updatedAt: Date.now(),
        }
        withDb(dbPath, (db) => saveStepGroup(db, group))
        return sendJson(res, 200, { ok: true, stepGroup: group })
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }
    },
  },
  // DELETE /api/step-groups/:id
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/step-groups/") && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const id = pathname.replace("/api/step-groups/", "").trim()
      const dbPath = resolveDbPath(state.config.configDir)
      try {
        withDb(dbPath, (db) => deleteStepGroup(db, id))
        return sendJson(res, 200, { ok: true, id })
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }
    },
  },
]
