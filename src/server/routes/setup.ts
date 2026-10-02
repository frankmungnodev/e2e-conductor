import { loadConfig } from "../../config.ts"
import { withDb } from "../../db/connection.ts"
import { saveFixture } from "../../db/fixtures.ts"
import { resolveDbPath } from "../../db/paths.ts"
import { initProject } from "../../init.ts"
import { detectWorkspace, saveWizardComponentsToDb, scaffoldWizardFiles, type WizardComponent, type WizardEnvironment } from "../../wizard.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const setupRoutes: Route[] = [
  // POST /api/init
  {
    match: ({ req, pathname }) => pathname === "/api/init" && req.method === "POST",
    handle: async ({ state, res }) => {
      try {
        const { created, skipped } = initProject(state.config.configDir)
        try {
          state.config = await loadConfig(state.config.configDir)
        } catch {
          // Ignore reload error if not yet initialized
        }
        return sendJson(res, 200, { ok: true, created, skipped })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // GET /api/wizard/detect
  {
    match: ({ req, pathname }) => pathname === "/api/wizard/detect" && req.method === "GET",
    handle: async ({ state, res }) => {
      const detected = detectWorkspace(state.config.configDir)
      return sendJson(res, 200, { detected })
    },
  },
  // POST /api/wizard/apply
  {
    match: ({ req, pathname }) => pathname === "/api/wizard/apply" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as {
        components?: WizardComponent[]
        environment?: WizardEnvironment
        environments?: Record<string, { description?: string; url?: string; scenarios?: string; flows?: string; results?: string; env?: Record<string, string> }>
        defaultEnvironment?: string
        scaffoldFiles?: boolean
        fixtures?: Record<string, { cmd: string; cwd?: string }>
      }
      const components = body.components ?? []
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        withDb(targetDbPath, (db) => {
          saveWizardComponentsToDb(db, components, {
            environment: body.environment,
            environments: body.environments,
            defaultEnvironment: body.defaultEnvironment,
          })
          if (body.fixtures) {
            for (const [name, fix] of Object.entries(body.fixtures)) {
              saveFixture(db, name, fix)
            }
          }
        })

        let created: string[] = [targetDbPath]
        let skipped: string[] = []

        if (body.scaffoldFiles && components.length > 0) {
          const scaffoldRes = scaffoldWizardFiles(state.config.configDir, components)
          created = [...created, ...scaffoldRes.created]
          skipped = [...skipped, ...scaffoldRes.skipped]
        }

        try {
          state.config = await loadConfig(state.config.configDir, body.defaultEnvironment || body.environment?.name)
        } catch {
          // Ignore reload error
        }

        return sendJson(res, 200, {
          ok: true,
          message: "Configuration applied successfully",
          created,
          skipped,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
]
