import { existsSync } from "node:fs"
import { withDb } from "../../db/connection.ts"
import { deleteStepPreset, getStepPreset, type StepPreset, saveStepPreset } from "../../db/step-presets.ts"
import { getOrSeedPresets } from "../../scenario.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const presetRoutes: Route[] = [
  // GET /api/presets
  {
    match: ({ req, pathname }) => pathname === "/api/presets" && req.method === "GET",
    handle: async ({ state, res }) => {
      try {
        const presets = getOrSeedPresets(state.config)
        return sendJson(res, 200, { presets })
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }
    },
  },
  // POST /api/presets
  {
    match: ({ req, pathname }) => pathname === "/api/presets" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as StepPreset
      if (!body?.name || !body.step) {
        return sendJson(res, 400, { error: "Missing required fields: name and step" })
      }
      const presetId =
        body.id ||
        `preset-${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`
      const preset: StepPreset = {
        id: presetId,
        name: body.name.trim(),
        description: body.description?.trim(),
        target: body.target || body.step.target || "web",
        step: {
          ...body.step,
          name: body.step.name || body.name.trim(),
          target: body.step.target || body.target || "web",
        },
        createdAt: body.createdAt || Date.now(),
        updatedAt: Date.now(),
      }

      try {
        withDb(state.config.dbPath, (db) => saveStepPreset(db, preset))
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }

      return sendJson(res, 200, { ok: true, preset })
    },
  },
  // DELETE /api/presets/:id
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/presets/") && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const id = pathname.replace("/api/presets/", "").trim()
      const dbPath = state.config.dbPath
      let found = false
      if (existsSync(dbPath)) {
        try {
          found = withDb(dbPath, (db) => {
            if (!getStepPreset(db, id)) return false
            deleteStepPreset(db, id)
            return true
          })
        } catch (error) {
          return sendJson(res, 500, { error: (error as Error).message })
        }
      }

      if (found) {
        return sendJson(res, 200, { ok: true, id })
      }
      return sendJson(res, 404, { error: `Preset ${id} not found` })
    },
  },
]
