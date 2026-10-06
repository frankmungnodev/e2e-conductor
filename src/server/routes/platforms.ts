import { loadConfig } from "../../config.ts"
import { withDb } from "../../db/connection.ts"
import { deleteEnvPlatform, type EnvPlatformRecord, getEnvPlatforms, getPlatformsForEnv, saveEnvPlatform } from "../../db/env-platforms.ts"
import { resolveDbPath } from "../../db/paths.ts"
import { deletePlatform, type PlatformRecord, platformsToTargetsAndServices, savePlatform } from "../../db/platforms.ts"
import { scaffoldWizardFiles } from "../../wizard.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const platformRoutes: Route[] = [
  // POST /api/config/platform
  {
    match: ({ req, pathname }) => pathname === "/api/config/platform" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as PlatformRecord & { scaffoldFiles?: boolean }
      if (!body?.name?.trim() || !body?.type) {
        return sendJson(res, 400, { ok: false, error: "Platform name and type are required" })
      }
      const platName = body.name.trim()
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        withDb(targetDbPath, (db) => {
          savePlatform(db, {
            id: body.id || `plat-${Date.now()}`,
            name: platName,
            type: body.type,
            orderNum: body.orderNum ?? 1,
            url: body.url?.trim() || undefined,
            serviceName: body.serviceName?.trim() || platName,
            health: body.health?.trim() || undefined,
            startCmd: body.startCmd?.trim() || undefined,
            cwd: body.cwd?.trim() || undefined,
            modules: body.modules?.trim() || undefined,
            slowMo: body.slowMo,
            headless: body.headless,
            exclusive: body.exclusive,
            appId: body.appId?.trim() || undefined,
            flows: body.flows?.trim() || undefined,
            installCmd: body.installCmd?.trim() || undefined,
            grantPermissions: body.grantPermissions,
            reversePorts: body.reversePorts,
            needs: body.needs,
          })
        })

        if (body.scaffoldFiles) {
          scaffoldWizardFiles(state.config.configDir, [body as any])
        }

        state.config = await loadConfig(state.config.configDir, state.config.activeEnvironment)

        return sendJson(res, 200, {
          ok: true,
          message: `Platform "${platName}" saved`,
          targets: state.config.targets,
          services: state.config.services,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // DELETE /api/config/platform
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/config/platform") && req.method === "DELETE",
    handle: async ({ state, res, url, pathname }) => {
      const nameParam = url.searchParams.get("name") || pathname.split("/").pop()
      if (!nameParam || nameParam === "platform") {
        return sendJson(res, 400, { ok: false, error: "Platform name is required" })
      }
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        withDb(targetDbPath, (db) => deletePlatform(db, nameParam))
        state.config = await loadConfig(state.config.configDir, state.config.activeEnvironment)

        return sendJson(res, 200, {
          ok: true,
          message: `Platform "${nameParam}" removed`,
          targets: state.config.targets,
          services: state.config.services,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // GET /api/config/env-platforms
  {
    match: ({ req, pathname }) => pathname === "/api/config/env-platforms" && req.method === "GET",
    handle: async ({ state, res, url }) => {
      const envParam = url.searchParams.get("env") || undefined
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        const resData = withDb(targetDbPath, (db) => {
          const envPlatforms = getEnvPlatforms(db, envParam)
          const platformsWithEnv = envParam ? getPlatformsForEnv(db, envParam) : undefined
          return { envPlatforms, platformsWithEnv }
        })
        return sendJson(res, 200, {
          ok: true,
          ...resData,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // POST /api/config/env-platform
  {
    match: ({ req, pathname }) => pathname === "/api/config/env-platform" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as EnvPlatformRecord
      if (!body?.envName?.trim() || !body?.platformId?.trim()) {
        return sendJson(res, 400, { ok: false, error: "Environment name and platform ID are required" })
      }
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        const { envPlatforms, platformsWithEnv } = withDb(targetDbPath, (db) => {
          saveEnvPlatform(db, {
            envName: body.envName.trim(),
            platformId: body.platformId.trim(),
            enabled: body.enabled !== false,
            url: body.url !== undefined ? body.url.trim() : undefined,
            health: body.health !== undefined ? body.health.trim() : undefined,
            startCmd: body.startCmd !== undefined ? body.startCmd.trim() : undefined,
            cwd: body.cwd !== undefined ? body.cwd.trim() : undefined,
            headless: body.headless,
            slowMo: body.slowMo,
            appId: body.appId !== undefined ? body.appId.trim() : undefined,
            configJson: body.configJson,
            needs: body.needs,
          })
          return {
            envPlatforms: getEnvPlatforms(db, body.envName),
            platformsWithEnv: getPlatformsForEnv(db, body.envName),
          }
        })

        // If updating the active environment, sync state.config targets and services
        if (body.envName === state.config.activeEnvironment) {
          const platRes = platformsToTargetsAndServices(platformsWithEnv)
          state.config.targets = platRes.targets
          state.config.services = platRes.services
        }

        return sendJson(res, 200, {
          ok: true,
          message: `Environment platform updated for "${body.envName}"`,
          envPlatforms,
          platformsWithEnv,
          targets: state.config.targets,
          services: state.config.services,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // DELETE /api/config/env-platform
  {
    match: ({ req, pathname }) => pathname === "/api/config/env-platform" && req.method === "DELETE",
    handle: async ({ state, res, url }) => {
      const envParam = url.searchParams.get("env")
      const platParam = url.searchParams.get("platformId")
      if (!envParam || !platParam) {
        return sendJson(res, 400, { ok: false, error: "Both env and platformId parameters are required" })
      }
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        const { envPlatforms, platformsWithEnv } = withDb(targetDbPath, (db) => {
          deleteEnvPlatform(db, envParam, platParam)
          return {
            envPlatforms: getEnvPlatforms(db, envParam),
            platformsWithEnv: getPlatformsForEnv(db, envParam),
          }
        })

        // If removing an override for the active environment, sync state.config
        if (envParam === state.config.activeEnvironment) {
          const platRes = platformsToTargetsAndServices(platformsWithEnv)
          state.config.targets = platRes.targets
          state.config.services = platRes.services
        }

        return sendJson(res, 200, {
          ok: true,
          message: "Environment platform link removed",
          envPlatforms,
          platformsWithEnv,
          targets: state.config.targets,
          services: state.config.services,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
]
