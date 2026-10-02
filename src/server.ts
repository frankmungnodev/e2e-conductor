import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, join, relative, resolve } from "node:path"
import { type LoadedConfig, loadConfig, type MobileTarget, resolveFromConfig } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { deleteEnvPlatform as deleteDbEnvPlatform, type EnvPlatformRecord, getEnvPlatforms as getDbEnvPlatforms, getPlatformsForEnv as getDbPlatformsForEnv, type PlatformWithEnvOverrides, saveEnvPlatform as saveDbEnvPlatform } from "./db/env-platforms.ts"
import { deleteEnvironment as deleteDbEnvironment, getActiveEnvironment as getDbActiveEnvironment, getDefaultEnvironment as getDbDefaultEnvironment, getEnvironments as getDbEnvironments, saveEnvironment as saveDbEnvironment, setActiveEnvironment as setDbActiveEnvironment } from "./db/environments.ts"
import { deleteFixture as deleteDbFixture, getFixtures as getDbFixtures, saveFixture as saveDbFixture } from "./db/fixtures.ts"
import { checkDbStatus, resolveDbPath, writeDbPointer } from "./db/paths.ts"
import { deletePlatform as deleteDbPlatform, getPlatforms as getDbPlatforms, type PlatformRecord, platformsToTargetsAndServices, savePlatform as saveDbPlatform } from "./db/platforms.ts"
import { getRun as getDbRun, getRuns as getDbRuns, getStepRuns as getDbStepRuns } from "./db/runs.ts"
import { deleteScenario as deleteDbScenario, getScenario as getDbScenario, saveScenario as saveDbScenario } from "./db/scenarios.ts"
import { deleteStepGroup as deleteDbStepGroup, getStepGroups as getDbStepGroups, type StepGroup, saveStepGroup as saveDbStepGroup } from "./db/step-groups.ts"
import { deleteStepPreset as deleteDbStepPreset, type StepPreset, saveStepPreset as saveDbStepPreset } from "./db/step-presets.ts"
import { checkFlowSource } from "./flow.ts"
import { initProject } from "./init.ts"
import { isUp, listAdbDevices, unfinishedGitOperation } from "./preflight.ts"
import { adbPath, runAdb, runShell, startBackground } from "./process.ts"
import { type RunEvent, type RunOptions, run, type Summary } from "./runner.ts"
import { checkSteps, getOrSeedPresets, getOrSeedScenarios, type Scenario, targetsUsed } from "./scenario.ts"
import { describeErrors, validateScenario } from "./schema.ts"
import {
  detectWorkspace,
  saveWizardComponentsToDb,
  scaffoldWizardFiles,
  type WizardComponent,
  type WizardEnvironment,
} from "./wizard.ts"

const UI_DIST_PATH = resolve(import.meta.dirname, "../ui/dist")

export type ServerOptions = {
  port?: number
  host?: string
  open?: boolean
}

type ActiveRun = {
  runId: string
  options: RunOptions
  startedAt: number
  controller: AbortController
}


const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".log": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

export function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref()
  } catch {
    // Ignore browser open errors
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS })
  res.end(JSON.stringify(data))
}

function sendText(res: ServerResponse, status: number, text: string, contentType = "text/plain") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      if (!body.trim()) return resolveBody({})
      try {
        resolveBody(JSON.parse(body))
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${(err as Error).message}`))
      }
    })
    req.on("error", reject)
  })
}


export function startServer(
  config: LoadedConfig,
  options: ServerOptions = {},
): Promise<{ server: Server; url: string; port: number }> {
  return new Promise((resolveReady, reject) => {
    const port = options.port ?? 4173
    const host = options.host ?? "127.0.0.1"
    let currentConfig = config
    const initialDbStatus = checkDbStatus(currentConfig.configDir)
    if (initialDbStatus.dbExists) {
      try {
        withDb(initialDbStatus.dbPath, (db) => {
          const dbEnvs = getDbEnvironments(db)
          if (Object.keys(dbEnvs).length > 0) {
            currentConfig.environments = dbEnvs
            const active = getDbActiveEnvironment(db)
            const def = getDbDefaultEnvironment(db)
            if (active) currentConfig.activeEnvironment = active
            if (def) currentConfig.defaultEnvironment = def
          }
          const dbPlats = getDbPlatforms(db)
          if (dbPlats.length > 0) {
            const { targets, services } = platformsToTargetsAndServices(dbPlats)
            currentConfig.targets = { ...currentConfig.targets, ...targets }
            currentConfig.services = { ...currentConfig.services, ...services }
          }
        })
      } catch {
        // ignore load errors
      }
    }
    const sseClients = new Set<ServerResponse>()
    let activeRun: ActiveRun | null = null
    let lastSummary: Summary | null = null
    let lastEvent: RunEvent | null = null

    const broadcast = (event: RunEvent) => {
      lastEvent = event
      const payload = `data: ${JSON.stringify(event)}\n\n`
      for (const client of sseClients) {
        try {
          client.write(payload)
        } catch {
          sseClients.delete(client)
        }
      }
    }

    // Keep-alive heartbeat for SSE connections
    const heartbeat = setInterval(() => {
      for (const client of sseClients) {
        try {
          client.write(": keep-alive\n\n")
        } catch {
          sseClients.delete(client)
        }
      }
    }, 15000)
    heartbeat.unref()

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      const pathname = url.pathname

      // CORS Preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS)
        return res.end()
      }

      // API Endpoints
      if (pathname.startsWith("/api/")) {
        try {
          // SSE events stream
          if (pathname === "/api/events" && req.method === "GET") {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": "*",
            })
            res.write(`data: ${JSON.stringify({ type: "connected", active: Boolean(activeRun) })}\n\n`)
            if (lastEvent) {
              res.write(`data: ${JSON.stringify(lastEvent)}\n\n`)
            }
            sseClients.add(res)
            req.on("close", () => {
              sseClients.delete(res)
            })
            return
          }

          // GET /api/config
          if (pathname === "/api/config" && req.method === "GET") {
            const servicesMeta = Object.fromEntries(
              Object.entries(currentConfig.services ?? {}).map(([name, s]) => [
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
            for (const [name, fix] of Object.entries(currentConfig.fixtures ?? {})) {
              if (typeof fix === "object" && fix && "cmd" in fix) {
                fixturesMap[name] = { cmd: fix.cmd, cwd: fix.cwd }
              } else if (typeof fix === "function") {
                fixturesMap[name] = { cmd: "(custom typescript function)" }
              }
            }
            const dbStatus = checkDbStatus(currentConfig.configDir)
            let dbPlatforms: PlatformRecord[] = []
            let dbEnvPlatforms: EnvPlatformRecord[] = []
            let platformsWithEnv: PlatformWithEnvOverrides[] = []

            if (dbStatus.dbExists) {
              try {
                withDb(dbStatus.dbPath, (db) => {
                  dbPlatforms = getDbPlatforms(db)
                  dbEnvPlatforms = getDbEnvPlatforms(db)
                  const targetEnv = url.searchParams.get("env") || currentConfig.activeEnvironment || currentConfig.defaultEnvironment
                  if (targetEnv) {
                    platformsWithEnv = getDbPlatformsForEnv(db, targetEnv)
                  }
                })
              } catch {
                // ignore
              }
            }

            return sendJson(res, 200, {
              configDir: currentConfig.configDir,
              defaultEnvironment: currentConfig.defaultEnvironment,
              activeEnvironment: currentConfig.activeEnvironment,
              environments: currentConfig.environments ?? {},
              services: servicesMeta,
              targets: currentConfig.targets,
              scenariosPath: currentConfig.scenarios,
              resultsPath: currentConfig.results,
              fixtures: Object.keys(currentConfig.fixtures ?? {}),
              fixturesMap,
              dbExists: dbStatus.dbExists,
              dbPath: dbStatus.relativeDbPath,
              hasEnvironments: dbStatus.hasEnvironments,
              platforms: dbPlatforms,
              envPlatforms: dbEnvPlatforms,
              platformsWithEnv,
            })
          }

          // POST /api/config/environment/active
          if (pathname === "/api/config/environment/active" && req.method === "POST") {
            const body = (await readBody(req)) as { environment?: string }
            if (!body?.environment?.trim()) {
              return sendJson(res, 400, { ok: false, error: "Environment name is required" })
            }
            const envName = body.environment.trim()
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(targetDbPath)) {
              try {
                withDb(targetDbPath, (db) => setDbActiveEnvironment(db, envName))
              } catch {
                // ignore
              }
            }
            try {
              currentConfig = await loadConfig(currentConfig.configDir, envName)
            } catch {
              currentConfig.activeEnvironment = envName
              currentConfig.defaultEnvironment = envName
            }
            return sendJson(res, 200, {
              ok: true,
              activeEnvironment: currentConfig.activeEnvironment,
              defaultEnvironment: currentConfig.defaultEnvironment,
              message: `Active environment set to ${currentConfig.activeEnvironment}`,
            })
          }

          // POST /api/config/environment
          if (pathname === "/api/config/environment" && req.method === "POST") {
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
            const targetDbPath = resolveDbPath(currentConfig.configDir, body.dbPath)
            const defaultDbPath = resolveDbPath(currentConfig.configDir)
            if (body.dbPath && targetDbPath !== defaultDbPath) {
              writeDbPointer(currentConfig.configDir, targetDbPath)
            }

            try {
              withDb(targetDbPath, (db) => {
                saveDbEnvironment(db, envName, {
                  url: body.url?.trim() || undefined,
                  description: body.description?.trim() || undefined,
                  scenarios: body.scenarios?.trim() || undefined,
                  flows: body.flows?.trim() || undefined,
                  results: body.results?.trim() || undefined,
                  env: body.env,
                })
              })
              currentConfig = await loadConfig(currentConfig.configDir, envName)
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: `SQLite error: ${(err as Error).message}` })
            }

            return sendJson(res, 200, {
              ok: true,
              message: `Environment "${envName}" saved`,
              environments: currentConfig.environments ?? {},
              activeEnvironment: currentConfig.activeEnvironment,
              defaultEnvironment: currentConfig.defaultEnvironment,
              dbPath: relative(currentConfig.configDir, targetDbPath),
              hasEnvironments: true,
            })
          }

          // DELETE /api/config/environment
          if (pathname.startsWith("/api/config/environment") && req.method === "DELETE") {
            const nameParam = url.searchParams.get("name") || pathname.split("/").pop()
            if (!nameParam || nameParam === "environment") {
              return sendJson(res, 400, { ok: false, error: "Environment name is required" })
            }
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              withDb(targetDbPath, (db) => deleteDbEnvironment(db, nameParam))
              currentConfig = await loadConfig(currentConfig.configDir, currentConfig.activeEnvironment)
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }

            return sendJson(res, 200, {
              ok: true,
              message: `Environment "${nameParam}" removed`,
              environments: currentConfig.environments ?? {},
            })
          }

          // POST /api/config/platform
          if (pathname === "/api/config/platform" && req.method === "POST") {
            const body = (await readBody(req)) as PlatformRecord & { scaffoldFiles?: boolean }
            if (!body?.name?.trim() || !body?.type) {
              return sendJson(res, 400, { ok: false, error: "Platform name and type are required" })
            }
            const platName = body.name.trim()
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              withDb(targetDbPath, (db) => {
                saveDbPlatform(db, {
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
                })
              })

              if (body.scaffoldFiles) {
                scaffoldWizardFiles(currentConfig.configDir, [body as any])
              }

              currentConfig = await loadConfig(currentConfig.configDir, currentConfig.activeEnvironment)

              return sendJson(res, 200, {
                ok: true,
                message: `Platform "${platName}" saved`,
                targets: currentConfig.targets,
                services: currentConfig.services,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // DELETE /api/config/platform
          if (pathname.startsWith("/api/config/platform") && req.method === "DELETE") {
            const nameParam = url.searchParams.get("name") || pathname.split("/").pop()
            if (!nameParam || nameParam === "platform") {
              return sendJson(res, 400, { ok: false, error: "Platform name is required" })
            }
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              withDb(targetDbPath, (db) => deleteDbPlatform(db, nameParam))
              currentConfig = await loadConfig(currentConfig.configDir, currentConfig.activeEnvironment)

              return sendJson(res, 200, {
                ok: true,
                message: `Platform "${nameParam}" removed`,
                targets: currentConfig.targets,
                services: currentConfig.services,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // GET /api/config/env-platforms
          if (pathname === "/api/config/env-platforms" && req.method === "GET") {
            const envParam = url.searchParams.get("env") || undefined
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              const resData = withDb(targetDbPath, (db) => {
                const envPlatforms = getDbEnvPlatforms(db, envParam)
                const platformsWithEnv = envParam ? getDbPlatformsForEnv(db, envParam) : undefined
                return { envPlatforms, platformsWithEnv }
              })
              return sendJson(res, 200, {
                ok: true,
                ...resData,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // POST /api/config/env-platform
          if (pathname === "/api/config/env-platform" && req.method === "POST") {
            const body = (await readBody(req)) as EnvPlatformRecord
            if (!body?.envName?.trim() || !body?.platformId?.trim()) {
              return sendJson(res, 400, { ok: false, error: "Environment name and platform ID are required" })
            }
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              const { envPlatforms, platformsWithEnv } = withDb(targetDbPath, (db) => {
                saveDbEnvPlatform(db, {
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
                })
                return {
                  envPlatforms: getDbEnvPlatforms(db, body.envName),
                  platformsWithEnv: getDbPlatformsForEnv(db, body.envName),
                }
              })

              // If updating the active environment, sync currentConfig targets and services
              if (body.envName === currentConfig.activeEnvironment) {
                const platRes = platformsToTargetsAndServices(platformsWithEnv)
                currentConfig.targets = platRes.targets
                currentConfig.services = platRes.services
              }

              return sendJson(res, 200, {
                ok: true,
                message: `Environment platform updated for "${body.envName}"`,
                envPlatforms,
                platformsWithEnv,
                targets: currentConfig.targets,
                services: currentConfig.services,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // DELETE /api/config/env-platform
          if (pathname === "/api/config/env-platform" && req.method === "DELETE") {
            const envParam = url.searchParams.get("env")
            const platParam = url.searchParams.get("platformId")
            if (!envParam || !platParam) {
              return sendJson(res, 400, { ok: false, error: "Both env and platformId parameters are required" })
            }
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              const { envPlatforms, platformsWithEnv } = withDb(targetDbPath, (db) => {
                deleteDbEnvPlatform(db, envParam, platParam)
                return {
                  envPlatforms: getDbEnvPlatforms(db, envParam),
                  platformsWithEnv: getDbPlatformsForEnv(db, envParam),
                }
              })

              // If removing an override for the active environment, sync currentConfig
              if (envParam === currentConfig.activeEnvironment) {
                const platRes = platformsToTargetsAndServices(platformsWithEnv)
                currentConfig.targets = platRes.targets
                currentConfig.services = platRes.services
              }

              return sendJson(res, 200, {
                ok: true,
                message: "Environment platform link removed",
                envPlatforms,
                platformsWithEnv,
                targets: currentConfig.targets,
                services: currentConfig.services,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }


          // POST /api/config/fixture
          if (pathname === "/api/config/fixture" && req.method === "POST") {
            const body = (await readBody(req)) as { name?: string; cmd?: string; cwd?: string }
            if (!body?.name?.trim() || !body?.cmd?.trim()) {
              return sendJson(res, 400, { ok: false, error: "Fixture name and cmd are required" })
            }
            const fixName = body.name.trim()
            const fixCmd = body.cmd.trim()
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              const fixturesMap = withDb(targetDbPath, (db) => {
                saveDbFixture(db, fixName, {
                  cmd: fixCmd,
                  cwd: body.cwd?.trim() || undefined,
                })
                return getDbFixtures(db)
              })
              currentConfig.fixtures = fixturesMap

              return sendJson(res, 200, {
                ok: true,
                message: `Fixture "${fixName}" saved`,
                fixtures: Object.keys(fixturesMap),
                fixturesMap,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // DELETE /api/config/fixture
          if (pathname.startsWith("/api/config/fixture") && req.method === "DELETE") {
            const nameParam = url.searchParams.get("name") || pathname.split("/").pop()
            if (!nameParam || nameParam === "fixture") {
              return sendJson(res, 400, { ok: false, error: "Fixture name is required" })
            }
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              const fixturesMap = withDb(targetDbPath, (db) => {
                deleteDbFixture(db, nameParam)
                return getDbFixtures(db)
              })
              currentConfig.fixtures = fixturesMap

              return sendJson(res, 200, {
                ok: true,
                message: `Fixture "${nameParam}" removed`,
                fixtures: Object.keys(fixturesMap),
                fixturesMap,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // POST /api/fixtures/run
          if (pathname === "/api/fixtures/run" && req.method === "POST") {
            const body = (await readBody(req)) as { name?: string; cmd?: string; cwd?: string }
            let cmdToRun = body?.cmd
            let cwdToRun = body?.cwd
            if (body?.name && currentConfig.fixtures?.[body.name]) {
              const fix = currentConfig.fixtures[body.name]
              if (typeof fix === "object" && fix && "cmd" in fix) {
                cmdToRun = fix.cmd
                cwdToRun = fix.cwd
              }
            }
            if (!cmdToRun) {
              return sendJson(res, 400, { ok: false, error: "No shell command specified to run" })
            }
            const start = Date.now()
            const logs: string[] = []
            try {
              const fullCwd = cwdToRun ? resolveFromConfig(currentConfig, cwdToRun) : currentConfig.configDir
              const resCmd = await runShell(cmdToRun, {
                cwd: fullCwd,
                timeoutMs: 60_000,
                log: (line) => logs.push(line),
              })
              const durationMs = Date.now() - start
              const stdout = (resCmd.stdout || "").trim()
              const stderr = (resCmd.stderr || "").trim()
              const output = [stdout, stderr, ...logs].filter(Boolean).join("\n") || "(no output)"
              return sendJson(res, 200, {
                ok: resCmd.exitCode === 0,
                exitCode: resCmd.exitCode,
                output,
                durationMs,
              })
            } catch (err) {
              return sendJson(res, 500, {
                ok: false,
                exitCode: 1,
                output: (err as Error).message,
                durationMs: Date.now() - start,
              })
            }
          }

          // POST /api/init
          if (pathname === "/api/init" && req.method === "POST") {
            try {
              const { created, skipped } = initProject(currentConfig.configDir)
              try {
                currentConfig = await loadConfig(currentConfig.configDir)
              } catch {
                // Ignore reload error if not yet initialized
              }
              return sendJson(res, 200, { ok: true, created, skipped })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // GET /api/wizard/detect
          if (pathname === "/api/wizard/detect" && req.method === "GET") {
            const detected = detectWorkspace(currentConfig.configDir)
            return sendJson(res, 200, { detected })
          }

          // POST /api/wizard/apply
          if (pathname === "/api/wizard/apply" && req.method === "POST") {
            const body = (await readBody(req)) as {
              components?: WizardComponent[]
              environment?: WizardEnvironment
              environments?: Record<string, { description?: string; url?: string; scenarios?: string; flows?: string; results?: string; env?: Record<string, string> }>
              defaultEnvironment?: string
              scaffoldFiles?: boolean
              fixtures?: Record<string, { cmd: string; cwd?: string }>
            }
            const components = body.components ?? []
            const targetDbPath = resolveDbPath(currentConfig.configDir)
            try {
              withDb(targetDbPath, (db) => {
                saveWizardComponentsToDb(db, components, {
                  environment: body.environment,
                  environments: body.environments,
                  defaultEnvironment: body.defaultEnvironment,
                })
                if (body.fixtures) {
                  for (const [name, fix] of Object.entries(body.fixtures)) {
                    saveDbFixture(db, name, fix)
                  }
                }
              })

              let created: string[] = [targetDbPath]
              let skipped: string[] = []

              if (body.scaffoldFiles && components.length > 0) {
                const scaffoldRes = scaffoldWizardFiles(currentConfig.configDir, components)
                created = [...created, ...scaffoldRes.created]
                skipped = [...skipped, ...scaffoldRes.skipped]
              }

              try {
                currentConfig = await loadConfig(currentConfig.configDir, body.defaultEnvironment || body.environment?.name)
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
          }

          // GET /api/scenarios
          if (pathname === "/api/scenarios" && req.method === "GET") {
            const scenariosList = getOrSeedScenarios(currentConfig)
            const checkedFlows = new Set<string>()
            const scenarios = scenariosList.map((scenario) => {
              const id = scenario.id
              const schemaErrors: string[] = []
              if (!validateScenario(scenario)) {
                for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
              }
              const stepErrors = checkSteps(currentConfig, scenario, checkedFlows)
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
          }

          // POST /api/scenarios
          if (pathname === "/api/scenarios" && req.method === "POST") {
            const body = (await readBody(req)) as { id?: string; content?: Scenario }
            if (!body?.id || !body.content) {
              return sendJson(res, 400, { error: "Missing 'id' or 'content' in payload" })
            }
            const scenario = { ...body.content, id: body.id }
            const schemaErrors: string[] = []
            if (!validateScenario(body.content)) {
              for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
            }
            const stepErrors = checkSteps(currentConfig, scenario, new Set())
            const errors = [...schemaErrors, ...stepErrors]

            // Save to SQLite
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                withDb(dbPath, (db) => saveDbScenario(db, scenario))
              } catch {
                // ignore db save error
              }
            }

            // Sync to filesystem
            try {
              const dir = resolveFromConfig(currentConfig, currentConfig.scenarios)
              mkdirSync(dir, { recursive: true })
              const filePath = join(dir, `${body.id}.json`)
              writeFileSync(filePath, `${JSON.stringify(body.content, null, 2)}\n`)
            } catch {
              // ignore fs error
            }

            return sendJson(res, 200, { ok: true, id: body.id, isValid: errors.length === 0, errors })
          }

          // DELETE /api/scenarios/:id
          if (pathname.startsWith("/api/scenarios/") && req.method === "DELETE") {
            const id = pathname.replace("/api/scenarios/", "").trim()
            let found = false

            // Delete from SQLite
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                withDb(dbPath, (db) => {
                  const existing = getDbScenario(db, id)
                  if (existing) {
                    deleteDbScenario(db, id)
                    found = true
                  }
                })
              } catch {
                // ignore db delete error
              }
            }

            // Delete from filesystem
            const dir = resolveFromConfig(currentConfig, currentConfig.scenarios)
            const filePath = join(dir, `${id}.json`)
            if (existsSync(filePath)) {
              rmSync(filePath)
              found = true
            }

            if (found) {
              return sendJson(res, 200, { ok: true, id })
            }
            return sendJson(res, 404, { error: `Scenario ${id} not found` })
          }

          // GET /api/step-groups
          if (pathname === "/api/step-groups" && req.method === "GET") {
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (!existsSync(dbPath)) {
              return sendJson(res, 200, { stepGroups: [] })
            }
            try {
              const stepGroups = withDb(dbPath, (db) => getDbStepGroups(db))
              return sendJson(res, 200, { stepGroups })
            } catch (error) {
              return sendJson(res, 500, { error: (error as Error).message })
            }
          }

          // POST /api/step-groups
          if (pathname === "/api/step-groups" && req.method === "POST") {
            const body = (await readBody(req)) as StepGroup
            if (!body?.name || !body.steps) {
              return sendJson(res, 400, { error: "Missing required fields: name and steps" })
            }
            const dbPath = resolveDbPath(currentConfig.configDir)
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
              withDb(dbPath, (db) => saveDbStepGroup(db, group))
              return sendJson(res, 200, { ok: true, stepGroup: group })
            } catch (error) {
              return sendJson(res, 500, { error: (error as Error).message })
            }
          }

          // DELETE /api/step-groups/:id
          if (pathname.startsWith("/api/step-groups/") && req.method === "DELETE") {
            const id = pathname.replace("/api/step-groups/", "").trim()
            const dbPath = resolveDbPath(currentConfig.configDir)
            try {
              withDb(dbPath, (db) => deleteDbStepGroup(db, id))
              return sendJson(res, 200, { ok: true, id })
            } catch (error) {
              return sendJson(res, 500, { error: (error as Error).message })
            }
          }

          // GET /api/presets
          if (pathname === "/api/presets" && req.method === "GET") {
            try {
              const presets = getOrSeedPresets(currentConfig)
              return sendJson(res, 200, { presets })
            } catch (error) {
              return sendJson(res, 500, { error: (error as Error).message })
            }
          }

          // POST /api/presets
          if (pathname === "/api/presets" && req.method === "POST") {
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

            // Save to SQLite
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                withDb(dbPath, (db) => saveDbStepPreset(db, preset))
              } catch {
                // ignore db save error
              }
            }

            // Dual-write to filesystem: .e2e/presets/<id>.json
            try {
              const presetsDir = join(currentConfig.configDir, "presets")
              mkdirSync(presetsDir, { recursive: true })
              const filePath = join(presetsDir, `${preset.id}.json`)
              writeFileSync(filePath, `${JSON.stringify(preset, null, 2)}\n`)
            } catch {
              // ignore fs error
            }

            return sendJson(res, 200, { ok: true, preset })
          }

          // DELETE /api/presets/:id
          if (pathname.startsWith("/api/presets/") && req.method === "DELETE") {
            const id = pathname.replace("/api/presets/", "").trim()
            let found = false

            // Delete from SQLite
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                withDb(dbPath, (db) => {
                  deleteDbStepPreset(db, id)
                  found = true
                })
              } catch {
                // ignore db delete error
              }
            }

            // Delete from filesystem
            try {
              const presetsDir = join(currentConfig.configDir, "presets")
              const filePath = join(presetsDir, `${id}.json`)
              if (existsSync(filePath)) {
                rmSync(filePath)
                found = true
              }
            } catch {
              // ignore fs error
            }

            if (found) {
              return sendJson(res, 200, { ok: true, id })
            }
            return sendJson(res, 404, { error: `Preset ${id} not found` })
          }

          // GET /api/flows
          if (pathname === "/api/flows" && req.method === "GET") {
            const flows: Array<{ target: string; file: string; path: string; content: string; isValid: boolean; errors: string[] }> = []
            for (const [targetName, target] of Object.entries(currentConfig.targets)) {
              if (target.driver === "mobile") {
                const mob = target as MobileTarget
                const flowsDir = resolveFromConfig(currentConfig, mob.flows)
                if (existsSync(flowsDir)) {
                  const files = readdirSync(flowsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort()
                  for (const file of files) {
                    const full = join(flowsDir, file)
                    const content = readFileSync(full, "utf8")
                    const errors = checkFlowSource(content)
                    flows.push({
                      target: targetName,
                      file,
                      path: full,
                      content,
                      isValid: errors.length === 0,
                      errors,
                    })
                  }
                }
              }
            }
            return sendJson(res, 200, flows)
          }

          // POST /api/flows
          if (pathname === "/api/flows" && req.method === "POST") {
            const body = (await readBody(req)) as { target: string; file: string; content: string }
            if (!body?.target || !body.file || typeof body.content !== "string") {
              return sendJson(res, 400, { error: "Missing target, file, or content" })
            }
            const target = currentConfig.targets[body.target] as MobileTarget | undefined
            if (target?.driver !== "mobile") {
              return sendJson(res, 400, { error: `Target ${body.target} is not a mobile target` })
            }
            const flowsDir = resolveFromConfig(currentConfig, target.flows)
            mkdirSync(flowsDir, { recursive: true })
            const full = join(flowsDir, body.file)
            writeFileSync(full, body.content)
            const errors = checkFlowSource(body.content)
            return sendJson(res, 200, { ok: true, file: body.file, isValid: errors.length === 0, errors })
          }


          // GET /api/preflight
          if (pathname === "/api/preflight" && req.method === "GET") {
            const servicesStatus = await Promise.all(
              Object.entries(currentConfig.services ?? {}).map(async ([name, s]) => {
                const began = Date.now()
                const up = await isUp(s)
                const latency = Date.now() - began
                const repo = s.start && resolveFromConfig(currentConfig, s.start.cwd)
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
                  for (const target of Object.values(currentConfig.targets)) {
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
          }

          // POST /api/preflight/start-service
          if (pathname === "/api/preflight/start-service" && req.method === "POST") {
            const body = (await readBody(req)) as { name: string }
            const service = currentConfig.services?.[body.name]
            if (!service?.start) {
              return sendJson(res, 400, { error: `Service ${body?.name} has no start command` })
            }
            const resultsDir = resolveFromConfig(currentConfig, currentConfig.results)
            const logsDir = join(resultsDir, "services")
            mkdirSync(logsDir, { recursive: true })
            const logFile = join(logsDir, `${body.name}.log`)
            const cwd = resolveFromConfig(currentConfig, service.start.cwd)
            const child = startBackground(service.start.cmd, cwd, logFile)
            writeFileSync(join(logsDir, `${body.name}.pid`), String(child.pid))
            return sendJson(res, 200, { ok: true, pid: child.pid, logFile })
          }

          // POST /api/run
          if (pathname === "/api/run" && req.method === "POST") {
            if (activeRun) {
              return sendJson(res, 409, { error: "A test run is already in progress", runId: activeRun.runId })
            }
            const body = (await readBody(req)) as {
              scenarios?: string[]
              repeat?: number
              start?: boolean
              install?: boolean
              headless?: boolean
              verbose?: boolean
              environment?: string
            }
            if (body.headless) process.env.E2E_HEADLESS = "1"
            if (body.verbose) process.env.E2E_VERBOSE = "1"

            const controller = new AbortController()
            const runOptions: RunOptions = {
              scenarios: body.scenarios ?? [],
              repeat: Math.max(1, body.repeat ?? 1),
              start: Boolean(body.start),
              install: Boolean(body.install),
              checkOnly: false,
              signal: controller.signal,
              onEvent: (event) => broadcast(event),
            }

            const runId = new Date().toISOString().replace(/[:.]/g, "-")
            activeRun = {
              runId,
              options: runOptions,
              startedAt: Date.now(),
              controller,
            }

            // Launch run asynchronously
            void (async () => {
              try {
                let runConfig = currentConfig
                if (body.environment) {
                  try {
                    runConfig = await loadConfig(currentConfig.configDir, body.environment)
                  } catch {
                    // Fall back to currentConfig if loading fails
                  }
                }
                const summary = await run(runConfig, runOptions)
                lastSummary = summary
              } catch (err) {
                const errorMsg = (err as Error).message
                broadcast({
                  type: "log",
                  text: `Run error: ${errorMsg}`,
                  level: "info",
                })
                broadcast({
                  type: "finish",
                  summary: {
                    status: "FAILED",
                    total: Math.max(1, (runOptions.scenarios?.length || 1) * (runOptions.repeat || 1)),
                    passed: 0,
                    failed: Math.max(1, (runOptions.scenarios?.length || 1) * (runOptions.repeat || 1)),
                    duration_ms: Date.now() - (activeRun?.startedAt ?? Date.now()),
                    failures: [{ scenario: "run", iteration: 1, step: "init", error: errorMsg }],
                    artifacts: "",
                  },
                })
              } finally {
                activeRun = null
              }
            })()

            return sendJson(res, 200, { ok: true, runId })
          }

          // POST /api/run/stop
          if (pathname === "/api/run/stop" && req.method === "POST") {
            if (!activeRun) {
              return sendJson(res, 400, { error: "No active run to stop" })
            }
            activeRun.controller.abort()
            return sendJson(res, 200, { ok: true, message: "Run cancellation requested" })
          }

          // GET /api/run/status
          if (pathname === "/api/run/status" && req.method === "GET") {
            return sendJson(res, 200, {
              isRunning: Boolean(activeRun),
              currentRun: activeRun
                ? {
                    runId: activeRun.runId,
                    startedAt: activeRun.startedAt,
                    duration_ms: Date.now() - activeRun.startedAt,
                    options: {
                      scenarios: activeRun.options.scenarios,
                      repeat: activeRun.options.repeat,
                    },
                  }
                : null,
              lastSummary,
            })
          }

          // GET /api/runs
          if (pathname === "/api/runs" && req.method === "GET") {
            const resultsDir = resolveFromConfig(currentConfig, currentConfig.results)
            const artifactsDir = join(resultsDir, "artifacts")
            const runsMap = new Map<
              string,
              {
                runId: string
                timestamp: number
                scenarios: string[]
                status?: string
                environmentName?: string
                totalScenarios?: number
                passedScenarios?: number
                failedScenarios?: number
                durationMs?: number
              }
            >()

            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                withDb(dbPath, (db) => {
                  const dbRuns = getDbRuns(db, 100)
                  for (const r of dbRuns) {
                    runsMap.set(r.id, {
                      runId: r.id,
                      timestamp: r.startedAt,
                      status: r.status,
                      environmentName: r.environmentName,
                      totalScenarios: r.totalScenarios,
                      passedScenarios: r.passedScenarios,
                      failedScenarios: r.failedScenarios,
                      durationMs: r.durationMs,
                      scenarios: [],
                    })
                  }
                })
              } catch {
                // ignore
              }
            }

            if (existsSync(artifactsDir)) {
              const entries = readdirSync(artifactsDir).filter((e) => statSync(join(artifactsDir, e)).isDirectory())
              for (const entry of entries) {
                const dir = join(artifactsDir, entry)
                const scenarioFolders = readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())
                const stat = statSync(dir)
                const existing = runsMap.get(entry)
                if (existing) {
                  existing.scenarios = scenarioFolders
                } else {
                  runsMap.set(entry, {
                    runId: entry,
                    timestamp: stat.mtimeMs,
                    scenarios: scenarioFolders,
                  })
                }
              }
            }

            const runs = Array.from(runsMap.values()).sort((a, b) => b.timestamp - a.timestamp)

            const latestSummaryPath = join(resultsDir, "summary.json")
            let latestSummary: Summary | undefined
            if (existsSync(latestSummaryPath)) {
              try {
                latestSummary = JSON.parse(readFileSync(latestSummaryPath, "utf8"))
              } catch {
                // ignore
              }
            }

            return sendJson(res, 200, { runs, latestSummary })
          }

          // GET /api/runs/:runId
          if (pathname.startsWith("/api/runs/") && req.method === "GET") {
            const runId = pathname.replace("/api/runs/", "").trim()
            const dbPath = resolveDbPath(currentConfig.configDir)
            let dbRun: ReturnType<typeof getDbRun> | undefined
            if (existsSync(dbPath)) {
              try {
                dbRun = withDb(dbPath, (db) => getDbRun(db, runId))
              } catch {
                // ignore
              }
            }

            const resultsDir = resolveFromConfig(currentConfig, currentConfig.results)
            const runDir = join(resultsDir, "artifacts", runId)
            const scenarioArtifacts: Record<string, Array<{ name: string; url: string; isImage: boolean }>> = {}

            if (existsSync(runDir)) {
              const scenariosList = readdirSync(runDir).filter((e) => statSync(join(runDir, e)).isDirectory())
              for (const s of scenariosList) {
                const sDir = join(runDir, s)
                const files = readdirSync(sDir).filter((f) => statSync(join(sDir, f)).isFile())
                scenarioArtifacts[s] = files.map((f) => ({
                  name: f,
                  url: `/api/artifacts/${runId}/${s}/${f}`,
                  isImage: [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(f).toLowerCase()),
                }))
              }
            } else if (!dbRun) {
              return sendJson(res, 404, { error: `Run ${runId} not found` })
            }

            const runLogPath = join(resultsDir, "run.log")
            let runLog = ""
            if (existsSync(runLogPath)) {
              runLog = readFileSync(runLogPath, "utf8")
            }

            return sendJson(res, 200, {
              runId,
              status: dbRun?.status,
              environmentName: dbRun?.environmentName,
              durationMs: dbRun?.durationMs,
              totalScenarios: dbRun?.totalScenarios,
              passedScenarios: dbRun?.passedScenarios,
              failedScenarios: dbRun?.failedScenarios,
              stepRuns: dbRun?.stepRuns ?? [],
              scenarios: scenarioArtifacts,
              runLog,
            })
          }

          // GET /api/step-runs
          if (pathname === "/api/step-runs" && req.method === "GET") {
            const urlObj = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
            const scenarioId = urlObj.searchParams.get("scenarioId") || undefined
            const stepId = urlObj.searchParams.get("stepId") || undefined
            const runId = urlObj.searchParams.get("runId") || undefined
            const limit = urlObj.searchParams.has("limit") ? Number(urlObj.searchParams.get("limit")) : 200
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                const stepRuns = withDb(dbPath, (db) => getDbStepRuns(db, { scenarioId, stepId, runId, limit }))
                return sendJson(res, 200, stepRuns)
              } catch (e) {
                return sendJson(res, 500, { error: (e as Error).message })
              }
            }
            return sendJson(res, 200, [])
          }

          // GET /api/steps/:stepId/runs
          if (pathname.startsWith("/api/steps/") && pathname.endsWith("/runs") && req.method === "GET") {
            const stepId = decodeURIComponent(pathname.replace("/api/steps/", "").replace("/runs", ""))
            const dbPath = resolveDbPath(currentConfig.configDir)
            if (existsSync(dbPath)) {
              try {
                const stepRuns = withDb(dbPath, (db) => getDbStepRuns(db, { stepId, limit: 100 }))
                return sendJson(res, 200, stepRuns)
              } catch (e) {
                return sendJson(res, 500, { error: (e as Error).message })
              }
            }
            return sendJson(res, 200, [])
          }

          // GET /api/artifacts/*
          if (pathname.startsWith("/api/artifacts/") && req.method === "GET") {
            const rel = pathname.replace("/api/artifacts/", "")
            const resultsDir = resolveFromConfig(currentConfig, currentConfig.results)
            const targetPath = join(resultsDir, "artifacts", rel)

            // Security: Prevent directory traversal outside results
            if (!resolve(targetPath).startsWith(resolve(resultsDir))) {
              return sendText(res, 403, "Forbidden")
            }

            if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
              return sendText(res, 404, "Artifact Not Found")
            }

            const ext = extname(targetPath).toLowerCase()
            const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
            const content = readFileSync(targetPath)
            res.writeHead(200, {
              "Content-Type": contentType,
              "Content-Length": content.length,
              "Cache-Control": "public, max-age=3600",
            })
            return res.end(content)
          }

          return sendJson(res, 404, { error: `API route not found: ${pathname}` })
        } catch (apiError) {
          return sendJson(res, 500, { error: (apiError as Error).message })
        }
      }

      // Static file serving from UI_DIST_PATH
      if (existsSync(UI_DIST_PATH)) {
        let filePath = resolve(UI_DIST_PATH, `.${pathname}`)
        if (!filePath.startsWith(UI_DIST_PATH)) {
          return sendText(res, 403, "Forbidden")
        }
        if (existsSync(filePath) && statSync(filePath).isDirectory()) {
          filePath = join(filePath, "index.html")
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          // SPA Fallback: serve index.html for unknown routes without file extensions
          if (!extname(pathname)) {
            filePath = join(UI_DIST_PATH, "index.html")
          }
        }

        if (existsSync(filePath) && statSync(filePath).isFile()) {
          const ext = extname(filePath).toLowerCase()
          const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
          const content = readFileSync(filePath)
          res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": content.length,
          })
          return res.end(content)
        }
      }

      // Fallback HTML if UI is not yet built
      const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>e2e-orchestrator UI</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2.5rem; max-width: 520px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5); }
    h1 { margin-top: 0; font-size: 1.5rem; color: #38bdf8; display: flex; align-items: center; gap: 0.5rem; }
    p { color: #94a3b8; line-height: 1.6; }
    code { background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; color: #f43f5e; font-family: monospace; }
    .badge { display: inline-block; background: #0369a1; color: #e0f2fe; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Backend API Active</div>
    <h1>⚡ e2e-orchestrator UI Server</h1>
    <p>The backend server is running and ready at <code>http://${host}:${port}</code>.</p>
    <p>To serve the full graphical interface, build the UI bundle using:</p>
    <p><code>pnpm run build:ui</code></p>
    <p>Or start the Vite development server with hot-module reloading:</p>
    <p><code>pnpm run dev:ui</code></p>
  </div>
</body>
</html>`
      return sendText(res, 200, fallbackHtml, "text/html; charset=utf-8")
    })

    server.on("close", () => {
      clearInterval(heartbeat)
      for (const client of sseClients) {
        try {
          client.end()
        } catch {
          // ignore
        }
      }
      sseClients.clear()
    })

    server.on("error", (err) => {
      clearInterval(heartbeat)
      reject(err)
    })

    server.listen(port, host, () => {
      const addr = server.address() as AddressInfo
      const actualPort = addr?.port ?? port
      const url = `http://${host}:${actualPort}`
      if (options.open !== false) {
        openBrowser(url)
      }
      resolveReady({ server, url, port: actualPort })
    })
  })
}
