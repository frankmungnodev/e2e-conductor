import { relative } from "node:path"
import { exportToJson } from "../../export.ts"
import { sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const exportRoutes: Route[] = [
  // POST /api/export: writes SQLite scenarios and presets to JSON files
  {
    match: ({ req, pathname }) => pathname === "/api/export" && req.method === "POST",
    handle: async ({ state, res }) => {
      try {
        const { scenarios, presets } = exportToJson(state.config)
        const toRelative = (file: string) => relative(state.config.configDir, file)
        return sendJson(res, 200, { ok: true, scenarios: scenarios.map(toRelative), presets: presets.map(toRelative) })
      } catch (error) {
        return sendJson(res, 500, { error: (error as Error).message })
      }
    },
  },
]
