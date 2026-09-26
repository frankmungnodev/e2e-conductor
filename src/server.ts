import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path"
import { type LoadedConfig, loadConfig, type MobileTarget, resolveFromConfig, type WebTarget } from "./config.ts"
import { checkFlow } from "./flow.ts"
import { initProject } from "./init.ts"
import { isUp, unfinishedGitOperation } from "./preflight.ts"
import { adbPath, runAdb, startBackground } from "./process.ts"
import { type RunEvent, type RunOptions, run, type Summary } from "./runner.ts"
import { checkSteps, type Scenario } from "./scenario.ts"
import { describeErrors, validateScenario } from "./schema.ts"
import {
  detectWorkspace,
  generateConfigCode,
  scaffoldWizardFiles,
  type WizardComponent,
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

export type ModuleFile = {
  id: string
  category: "web" | "fixture" | "helper"
  target?: string
  name: string
  path: string
  content: string
  size: number
  updatedAt: number
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

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  })
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

function listFilesRecursively(
  dir: string,
  baseDir: string = dir,
): Array<{ relPath: string; fullPath: string; size: number; updatedAt: number }> {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const result: Array<{ relPath: string; fullPath: string; size: number; updatedAt: number }> = []
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...listFilesRecursively(full, baseDir))
    } else if (entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name)) {
      try {
        const stat = statSync(full)
        result.push({
          relPath: relative(baseDir, full),
          fullPath: full,
          size: stat.size,
          updatedAt: stat.mtimeMs,
        })
      } catch {
        // ignore errors reading file
      }
    }
  }
  return result
}

function resolveSafeModulePath(
  currentConfig: LoadedConfig,
  category: "web" | "fixture" | "helper",
  targetName?: string,
  relName?: string,
): { rootDir: string; fullPath: string } {
  if (!relName || relName.includes("..") || isAbsolute(relName)) {
    throw new Error("Invalid relative path: path traversal is not permitted")
  }
  let rootDir: string
  if (category === "web") {
    if (!targetName) throw new Error("Target name is required for web module")
    const target = currentConfig.targets[targetName]
    if (target?.driver !== "web") {
      throw new Error(`Target "${targetName}" is not a valid web target`)
    }
    rootDir = resolveFromConfig(currentConfig, (target as WebTarget).modules || "./web")
  } else if (category === "fixture") {
    rootDir = resolveFromConfig(currentConfig, "./fixtures")
  } else if (category === "helper") {
    rootDir = resolveFromConfig(currentConfig, "./helpers")
  } else {
    throw new Error(`Unsupported category: ${category}`)
  }

  const normalizedName = extname(relName) ? relName : `${relName}.ts`
  const fullPath = resolve(rootDir, normalizedName)
  const resolvedRoot = resolve(rootDir)
  if (!fullPath.startsWith(resolvedRoot)) {
    throw new Error("Path traversal forbidden")
  }
  return { rootDir, fullPath }
}

export function startServer(
  config: LoadedConfig,
  options: ServerOptions = {},
): Promise<{ server: Server; url: string; port: number }> {
  return new Promise((resolveReady, reject) => {
    const port = options.port ?? 4173
    const host = options.host ?? "127.0.0.1"
    let currentConfig = config
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
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        })
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
            return sendJson(res, 200, {
              configDir: currentConfig.configDir,
              services: servicesMeta,
              targets: currentConfig.targets,
              scenariosPath: currentConfig.scenarios,
              resultsPath: currentConfig.results,
              fixtures: Object.keys(currentConfig.fixtures ?? {}),
            })
          }

          // GET /api/config/code
          if (pathname === "/api/config/code" && req.method === "GET") {
            const configPath = join(currentConfig.configDir, "e2e.config.ts")
            const exists = existsSync(configPath)
            let content = ""
            if (exists) {
              content = readFileSync(configPath, "utf8")
            }
            return sendJson(res, 200, {
              exists,
              path: configPath,
              content,
              configDir: currentConfig.configDir,
            })
          }

          // POST /api/config/code
          if (pathname === "/api/config/code" && req.method === "POST") {
            const body = (await readBody(req)) as { content?: string }
            if (typeof body?.content !== "string") {
              return sendJson(res, 400, { ok: false, error: "Missing 'content' string in payload" })
            }
            const configPath = join(currentConfig.configDir, "e2e.config.ts")
            try {
              writeFileSync(configPath, body.content, "utf8")
              currentConfig = await loadConfig(configPath)
              return sendJson(res, 200, { ok: true, message: "Configuration saved and reloaded" })
            } catch (err) {
              return sendJson(res, 400, { ok: false, error: (err as Error).message })
            }
          }

          // POST /api/init
          if (pathname === "/api/init" && req.method === "POST") {
            const configPath = join(currentConfig.configDir, "e2e.config.ts")
            try {
              const { created, skipped } = initProject(configPath)
              if (existsSync(configPath)) {
                try {
                  currentConfig = await loadConfig(configPath)
                } catch {
                  // Ignore reload error if node_modules not yet linked in target dir
                }
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
              code?: string
              scaffoldFiles?: boolean
            }
            const configPath = join(currentConfig.configDir, "e2e.config.ts")
            const components = body.components ?? []
            const codeToSave = body.code || generateConfigCode(components)
            try {
              writeFileSync(configPath, codeToSave, "utf8")
              let created: string[] = [configPath]
              let skipped: string[] = []

              if (body.scaffoldFiles && components.length > 0) {
                const scaffoldRes = scaffoldWizardFiles(configPath, components)
                created = [...created, ...scaffoldRes.created]
                skipped = [...skipped, ...scaffoldRes.skipped]
              }

              try {
                currentConfig = await loadConfig(configPath)
              } catch {
                // Ignore reload error
              }

              return sendJson(res, 200, {
                ok: true,
                message: "Configuration generated and applied successfully",
                created,
                skipped,
              })
            } catch (err) {
              return sendJson(res, 500, { ok: false, error: (err as Error).message })
            }
          }

          // GET /api/scenarios
          if (pathname === "/api/scenarios" && req.method === "GET") {
            const dir = resolveFromConfig(currentConfig, currentConfig.scenarios)
            if (!existsSync(dir)) {
              return sendJson(res, 200, [])
            }
            const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
            const checkedFlows = new Set<string>()
            const scenarios = files.map((file) => {
              const id = basename(file, ".json")
              const filePath = join(dir, file)
              try {
                const raw = JSON.parse(readFileSync(filePath, "utf8"))
                const scenario = { ...raw, id } as Scenario
                const schemaErrors: string[] = []
                if (!validateScenario(raw)) {
                  for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
                }
                const stepErrors = checkSteps(currentConfig, scenario, checkedFlows)
                const errors = [...schemaErrors, ...stepErrors]
                return {
                  id,
                  file,
                  name: scenario.name ?? id,
                  description: scenario.description,
                  steps: scenario.steps ?? [],
                  setup: scenario.setup ?? [],
                  vars: scenario.vars ?? {},
                  raw,
                  isValid: errors.length === 0,
                  errors,
                  targets: Array.from(
                    new Set(
                      (scenario.steps ?? [])
                        .map((s) => s.target)
                        .filter(Boolean),
                    ),
                  ),
                }
              } catch (err) {
                return {
                  id,
                  file,
                  name: id,
                  raw: null,
                  steps: [],
                  isValid: false,
                  errors: [(err as Error).message],
                  targets: [],
                }
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
            const dir = resolveFromConfig(currentConfig, currentConfig.scenarios)
            mkdirSync(dir, { recursive: true })
            const filePath = join(dir, `${body.id}.json`)
            const scenario = { ...body.content, id: body.id }
            const schemaErrors: string[] = []
            if (!validateScenario(body.content)) {
              for (const err of describeErrors(validateScenario.errors)) schemaErrors.push(err)
            }
            const stepErrors = checkSteps(currentConfig, scenario, new Set())
            const errors = [...schemaErrors, ...stepErrors]
            writeFileSync(filePath, `${JSON.stringify(body.content, null, 2)}\n`)
            return sendJson(res, 200, { ok: true, id: body.id, isValid: errors.length === 0, errors })
          }

          // DELETE /api/scenarios/:id
          if (pathname.startsWith("/api/scenarios/") && req.method === "DELETE") {
            const id = pathname.replace("/api/scenarios/", "").trim()
            const dir = resolveFromConfig(currentConfig, currentConfig.scenarios)
            const filePath = join(dir, `${id}.json`)
            if (existsSync(filePath)) {
              rmSync(filePath)
              return sendJson(res, 200, { ok: true, id })
            }
            return sendJson(res, 404, { error: `Scenario ${id} not found` })
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
                    const errors = checkFlow(full)
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
            const errors = checkFlow(full)
            return sendJson(res, 200, { ok: true, file: body.file, isValid: errors.length === 0, errors })
          }

          // GET /api/modules
          if (pathname === "/api/modules" && req.method === "GET") {
            const modules: ModuleFile[] = []

            // 1. Web targets
            for (const [targetName, target] of Object.entries(currentConfig.targets)) {
              if (target.driver === "web") {
                const webTarget = target as WebTarget
                const modulesDir = resolveFromConfig(currentConfig, webTarget.modules || "./web")
                if (existsSync(modulesDir)) {
                  const files = listFilesRecursively(modulesDir)
                  for (const f of files) {
                    let content = ""
                    try {
                      content = readFileSync(f.fullPath, "utf8")
                    } catch {
                      // ignore
                    }
                    modules.push({
                      id: `web:${targetName}:${f.relPath}`,
                      category: "web",
                      target: targetName,
                      name: f.relPath,
                      path: f.fullPath,
                      content,
                      size: f.size,
                      updatedAt: f.updatedAt,
                    })
                  }
                }
              }
            }

            // 2. Fixtures directory
            const fixturesDir = resolveFromConfig(currentConfig, "./fixtures")
            if (existsSync(fixturesDir)) {
              const files = listFilesRecursively(fixturesDir)
              for (const f of files) {
                let content = ""
                try {
                  content = readFileSync(f.fullPath, "utf8")
                } catch {
                  // ignore
                }
                modules.push({
                  id: `fixture:${f.relPath}`,
                  category: "fixture",
                  name: f.relPath,
                  path: f.fullPath,
                  content,
                  size: f.size,
                  updatedAt: f.updatedAt,
                })
              }
            }

            // 3. Helpers directory (if exists)
            const helpersDir = resolveFromConfig(currentConfig, "./helpers")
            if (existsSync(helpersDir)) {
              const files = listFilesRecursively(helpersDir)
              for (const f of files) {
                let content = ""
                try {
                  content = readFileSync(f.fullPath, "utf8")
                } catch {
                  // ignore
                }
                modules.push({
                  id: `helper:${f.relPath}`,
                  category: "helper",
                  name: f.relPath,
                  path: f.fullPath,
                  content,
                  size: f.size,
                  updatedAt: f.updatedAt,
                })
              }
            }

            return sendJson(res, 200, modules)
          }

          // POST /api/modules
          if (pathname === "/api/modules" && req.method === "POST") {
            const body = (await readBody(req)) as {
              category?: "web" | "fixture" | "helper"
              target?: string
              name?: string
              content?: string
            }
            if (!body?.category || !body.name || typeof body.content !== "string") {
              return sendJson(res, 400, { ok: false, error: "Missing category, name, or content" })
            }
            try {
              const { fullPath } = resolveSafeModulePath(
                currentConfig,
                body.category,
                body.target,
                body.name,
              )
              mkdirSync(dirname(fullPath), { recursive: true })
              writeFileSync(fullPath, body.content, "utf8")
              const stat = statSync(fullPath)
              const relName = extname(body.name) ? body.name : `${body.name}.ts`
              const item: ModuleFile = {
                id: body.category === "web" ? `web:${body.target}:${relName}` : `${body.category}:${relName}`,
                category: body.category,
                target: body.target,
                name: relName,
                path: fullPath,
                content: body.content,
                size: stat.size,
                updatedAt: stat.mtimeMs,
              }
              return sendJson(res, 200, { ok: true, file: item })
            } catch (err) {
              return sendJson(res, 400, { ok: false, error: (err as Error).message })
            }
          }

          // DELETE /api/modules
          if (pathname === "/api/modules" && req.method === "DELETE") {
            const body = (await readBody(req)) as {
              category?: "web" | "fixture" | "helper"
              target?: string
              name?: string
            }
            const queryName = url.searchParams.get("name") || body?.name
            const queryCategory = (url.searchParams.get("category") || body?.category) as "web" | "fixture" | "helper" | undefined
            const queryTarget = url.searchParams.get("target") || body?.target
            if (!queryCategory || !queryName) {
              return sendJson(res, 400, { ok: false, error: "Missing category or name" })
            }
            try {
              const { fullPath } = resolveSafeModulePath(
                currentConfig,
                queryCategory,
                queryTarget,
                queryName,
              )
              if (existsSync(fullPath)) {
                rmSync(fullPath)
                return sendJson(res, 200, { ok: true, message: `Deleted ${queryName}` })
              }
              return sendJson(res, 404, { ok: false, error: `File not found: ${queryName}` })
            } catch (err) {
              return sendJson(res, 400, { ok: false, error: (err as Error).message })
            }
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
                const list = spawnSync(adb, ["devices"], { encoding: "utf8" }).stdout ?? ""
                const found = list
                  .split("\n")
                  .slice(1)
                  .map((l) => l.trim().split(/\s+/))
                  .filter(([serial, state]) => Boolean(serial) && state === "device")
                  .map(([serial, state]) => ({ serial, state }))

                devicesList = found.map(({ serial, state }) => {
                  const model = runAdb(adb, serial, ["shell", "getprop", "ro.product.model"], { allowFailure: true }).trim()
                  const packages: Record<string, boolean> = {}
                  for (const target of Object.values(currentConfig.targets)) {
                    if (target.driver === "mobile") {
                      const mob = target as MobileTarget
                      const outPkgs = runAdb(adb, serial, ["shell", "pm", "list", "packages", mob.appId], { allowFailure: true })
                      packages[mob.appId] = outPkgs.split("\n").some((l) => l.trim() === `package:${mob.appId}`)
                    }
                  }
                  return { serial, state, model, packages }
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
                const summary = await run(currentConfig, runOptions)
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
            const runs: Array<{
              runId: string
              timestamp: number
              scenarios: string[]
            }> = []

            if (existsSync(artifactsDir)) {
              const entries = readdirSync(artifactsDir).filter((e) => statSync(join(artifactsDir, e)).isDirectory())
              for (const entry of entries) {
                const dir = join(artifactsDir, entry)
                const scenarioFolders = readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())
                const stat = statSync(dir)
                runs.push({
                  runId: entry,
                  timestamp: stat.mtimeMs,
                  scenarios: scenarioFolders,
                })
              }
              runs.sort((a, b) => b.timestamp - a.timestamp)
            }

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
            const resultsDir = resolveFromConfig(currentConfig, currentConfig.results)
            const runDir = join(resultsDir, "artifacts", runId)
            if (!existsSync(runDir)) {
              return sendJson(res, 404, { error: `Run ${runId} not found` })
            }

            const scenariosList = readdirSync(runDir).filter((e) => statSync(join(runDir, e)).isDirectory())
            const scenarioArtifacts: Record<string, Array<{ name: string; url: string; isImage: boolean }>> = {}

            for (const s of scenariosList) {
              const sDir = join(runDir, s)
              const files = readdirSync(sDir).filter((f) => statSync(join(sDir, f)).isFile())
              scenarioArtifacts[s] = files.map((f) => ({
                name: f,
                url: `/api/artifacts/${runId}/${s}/${f}`,
                isImage: [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(f).toLowerCase()),
              }))
            }

            const runLogPath = join(resultsDir, "run.log")
            let runLog = ""
            if (existsSync(runLogPath)) {
              runLog = readFileSync(runLogPath, "utf8")
            }

            return sendJson(res, 200, {
              runId,
              scenarios: scenarioArtifacts,
              runLog,
            })
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
