import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type MobileTarget, resolveFromConfig } from "../../config.ts"
import { isUp, listAdbDevices, unfinishedGitOperation } from "../../preflight.ts"
import { adbPath, runAdb, startBackground } from "../../process.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const preflightRoutes: Route[] = [
  // GET /api/preflight
  {
    match: ({ req, pathname }) => pathname === "/api/preflight" && req.method === "GET",
    handle: async ({ state, res }) => {
      const servicesStatus = await Promise.all(
        Object.entries(state.config.services ?? {}).map(async ([name, s]) => {
          const began = Date.now()
          const up = await isUp(s)
          const latency = Date.now() - began
          const repo = s.start && resolveFromConfig(state.config, s.start.cwd)
          const gitWarning = repo ? unfinishedGitOperation(repo) : undefined
          return {
            name,
            url: s.url,
            health: s.health ?? "/",
            up,
            latencyMs: latency,
            gitWarning,
            exclusive: Boolean(s.exclusive),
            hasStart: Boolean(s.start),
            startCmd: s.start?.cmd,
          }
        }),
      )

      const adb = adbPath()
      let devicesList: Array<{ serial: string; state: string; model?: string; packages: Record<string, boolean> }> = []
      if (adb) {
        try {
          devicesList = listAdbDevices(adb).serials.map((serial) => {
            const model = runAdb(adb, serial, ["shell", "getprop", "ro.product.model"], { allowFailure: true }).trim()
            const packages: Record<string, boolean> = {}
            for (const target of Object.values(state.config.targets)) {
              if (target.driver === "mobile") {
                const mob = target as MobileTarget
                const outPkgs = runAdb(adb, serial, ["shell", "pm", "list", "packages", mob.appId], { allowFailure: true })
                packages[mob.appId] = outPkgs.split("\n").some((l) => l.trim() === `package:${mob.appId}`)
              }
            }
            return { serial, state: "device", model, packages }
          })
        } catch {
          // adb invocation error
        }
      }

      return sendJson(res, 200, {
        services: servicesStatus,
        adb: {
          available: Boolean(adb),
          path: adb,
        },
        devices: devicesList,
      })
    },
  },
  // POST /api/preflight/start-service
  {
    match: ({ req, pathname }) => pathname === "/api/preflight/start-service" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as { name: string }
      const service = state.config.services?.[body.name]
      if (!service?.start) {
        return sendJson(res, 400, { error: `Service ${body?.name} has no start command` })
      }
      const resultsDir = resolveFromConfig(state.config, state.config.results)
      const logsDir = join(resultsDir, "services")
      mkdirSync(logsDir, { recursive: true })
      const logFile = join(logsDir, `${body.name}.log`)
      const cwd = resolveFromConfig(state.config, service.start.cwd)
      const child = startBackground(service.start.cmd, cwd, logFile)
      writeFileSync(join(logsDir, `${body.name}.pid`), String(child.pid))
      return sendJson(res, 200, { ok: true, pid: child.pid, logFile })
    },
  },
]
