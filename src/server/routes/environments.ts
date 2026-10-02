import { existsSync } from "node:fs"
import { relative } from "node:path"
import { loadConfig } from "../../config.ts"
import { withDb } from "../../db/connection.ts"
import { type EnvPlatformRecord, getEnvPlatforms, getPlatformsForEnv, type PlatformWithEnvOverrides } from "../../db/env-platforms.ts"
import { deleteEnvironment, saveEnvironment, setActiveEnvironment } from "../../db/environments.ts"
import { checkDbStatus, resolveDbPath, writeDbPointer } from "../../db/paths.ts"
import { getPlatforms, type PlatformRecord } from "../../db/platforms.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const environmentRoutes: Route[] = [
  // GET /api/config
  {
    match: ({ req, pathname }) => pathname === "/api/config" && req.method === "GET",
    handle: async ({ state, res, url }) => {
      const servicesMeta = Object.fromEntries(
        Object.entries(state.config.services ?? {}).map(([name, s]) => [
          name,
          {
            url: s.url,
            health: s.health ?? "/",
            exclusive: Boolean(s.exclusive),
            hasStart: Boolean(s.start),
            startCmd: s.start?.cmd,
            startCwd: s.start?.cwd,
          },
        ]),
      )
      const fixturesMap: Record<string, { cmd: string; cwd?: string }> = {}
      for (const [name, fix] of Object.entries(state.config.fixtures ?? {})) {
        if (typeof fix === "object" && fix && "cmd" in fix) {
          fixturesMap[name] = { cmd: fix.cmd, cwd: fix.cwd }
        } else if (typeof fix === "function") {
          fixturesMap[name] = { cmd: "(custom typescript function)" }
        }
      }
      const dbStatus = checkDbStatus(state.config.configDir)
      let dbPlatforms: PlatformRecord[] = []
      let dbEnvPlatforms: EnvPlatformRecord[] = []
      let platformsWithEnv: PlatformWithEnvOverrides[] = []

      if (dbStatus.dbExists) {
        try {
          withDb(dbStatus.dbPath, (db) => {
            dbPlatforms = getPlatforms(db)
            dbEnvPlatforms = getEnvPlatforms(db)
            const targetEnv = url.searchParams.get("env") || state.config.activeEnvironment || state.config.defaultEnvironment
            if (targetEnv) {
              platformsWithEnv = getPlatformsForEnv(db, targetEnv)
            }
          })
        } catch {
          // ignore
        }
      }

      return sendJson(res, 200, {
        configDir: state.config.configDir,
        defaultEnvironment: state.config.defaultEnvironment,
        activeEnvironment: state.config.activeEnvironment,
        environments: state.config.environments ?? {},
        services: servicesMeta,
        targets: state.config.targets,
        scenariosPath: state.config.scenarios,
        resultsPath: state.config.results,
        fixtures: Object.keys(state.config.fixtures ?? {}),
        fixturesMap,
        dbExists: dbStatus.dbExists,
        dbPath: dbStatus.relativeDbPath,
        hasEnvironments: dbStatus.hasEnvironments,
        platforms: dbPlatforms,
        envPlatforms: dbEnvPlatforms,
        platformsWithEnv,
      })
    },
  },
  // POST /api/config/environment/active
  {
    match: ({ req, pathname }) => pathname === "/api/config/environment/active" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as { environment?: string }
      if (!body?.environment?.trim()) {
        return sendJson(res, 400, { ok: false, error: "Environment name is required" })
      }
      const envName = body.environment.trim()
      const targetDbPath = resolveDbPath(state.config.configDir)
      if (existsSync(targetDbPath)) {
        try {
          withDb(targetDbPath, (db) => setActiveEnvironment(db, envName))
        } catch {
          // ignore
        }
      }
      try {
        state.config = await loadConfig(state.config.configDir, envName)
      } catch {
        state.config.activeEnvironment = envName
        state.config.defaultEnvironment = envName
      }
      return sendJson(res, 200, {
        ok: true,
        activeEnvironment: state.config.activeEnvironment,
        defaultEnvironment: state.config.defaultEnvironment,
        message: `Active environment set to ${state.config.activeEnvironment}`,
      })
    },
  },
  // POST /api/config/environment
  {
    match: ({ req, pathname }) => pathname === "/api/config/environment" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as {
        name?: string
        url?: string
        description?: string
        scenarios?: string
        flows?: string
        results?: string
        env?: Record<string, string>
        dbPath?: string
      }
      if (!body?.name?.trim()) {
        return sendJson(res, 400, { ok: false, error: "Environment name is required" })
      }
      const envName = body.name.trim()
      const targetDbPath = resolveDbPath(state.config.configDir, body.dbPath)
      const defaultDbPath = resolveDbPath(state.config.configDir)
      if (body.dbPath && targetDbPath !== defaultDbPath) {
        writeDbPointer(state.config.configDir, targetDbPath)
      }

      try {
        withDb(targetDbPath, (db) => {
          saveEnvironment(db, envName, {
            url: body.url?.trim() || undefined,
            description: body.description?.trim() || undefined,
            scenarios: body.scenarios?.trim() || undefined,
            flows: body.flows?.trim() || undefined,
            results: body.results?.trim() || undefined,
            env: body.env,
          })
        })
        state.config = await loadConfig(state.config.configDir, envName)
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: `SQLite error: ${(err as Error).message}` })
      }

      return sendJson(res, 200, {
        ok: true,
        message: `Environment "${envName}" saved`,
        environments: state.config.environments ?? {},
        activeEnvironment: state.config.activeEnvironment,
        defaultEnvironment: state.config.defaultEnvironment,
        dbPath: relative(state.config.configDir, targetDbPath),
        hasEnvironments: true,
      })
    },
  },
  // DELETE /api/config/environment
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/config/environment") && req.method === "DELETE",
    handle: async ({ state, res, url, pathname }) => {
      const nameParam = url.searchParams.get("name") || pathname.split("/").pop()
      if (!nameParam || nameParam === "environment") {
        return sendJson(res, 400, { ok: false, error: "Environment name is required" })
      }
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        withDb(targetDbPath, (db) => deleteEnvironment(db, nameParam))
        state.config = await loadConfig(state.config.configDir, state.config.activeEnvironment)
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }

      return sendJson(res, 200, {
        ok: true,
        message: `Environment "${nameParam}" removed`,
        environments: state.config.environments ?? {},
      })
    },
  },
]
