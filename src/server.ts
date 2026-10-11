import { spawn } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, join, resolve } from "node:path"
import type { LoadedConfig } from "./config.ts"
import { withDb } from "./db/connection.ts"
import { getActiveEnvironment, getDefaultEnvironment, getEnvironments } from "./db/environments.ts"
import { checkDbStatus } from "./db/paths.ts"
import { getPlatforms, platformsToTargetsAndServices } from "./db/platforms.ts"
import { CORS_HEADERS, MIME_TYPES, sendJson, sendText } from "./server/http.ts"
import type { Route } from "./server/route.ts"
import { artifactRoutes } from "./server/routes/artifacts.ts"
import { environmentRoutes } from "./server/routes/environments.ts"
import { exportRoutes } from "./server/routes/export.ts"
import { fixtureRoutes } from "./server/routes/fixtures.ts"
import { flowRoutes } from "./server/routes/flows.ts"
import { holdRoutes } from "./server/routes/hold.ts"
import { platformRoutes } from "./server/routes/platforms.ts"
import { preflightRoutes } from "./server/routes/preflight.ts"
import { presetRoutes } from "./server/routes/presets.ts"
import { runRoutes } from "./server/routes/runs.ts"
import { scenarioRoutes } from "./server/routes/scenarios.ts"
import { setupRoutes } from "./server/routes/setup.ts"
import { stepGroupRoutes } from "./server/routes/step-groups.ts"
import { timelineRoutes } from "./server/routes/timeline.ts"
import { createServerState } from "./server/state.ts"

const UI_DIST_PATH = resolve(import.meta.dirname, "../ui/dist")

const routes: Route[] = [
  // Before runRoutes, whose `GET /api/runs/:runId` matches every path under `/api/runs/`.
  ...timelineRoutes,
  ...runRoutes,
  ...holdRoutes,
  ...environmentRoutes,
  ...platformRoutes,
  ...fixtureRoutes,
  ...setupRoutes,
  ...scenarioRoutes,
  ...stepGroupRoutes,
  ...presetRoutes,
  ...exportRoutes,
  ...flowRoutes,
  ...preflightRoutes,
  ...artifactRoutes,
]

export type ServerOptions = {
  port?: number
  host?: string
  open?: boolean
}

export function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref()
  } catch {
    // Ignore browser open errors
  }
}

export function startServer(
  config: LoadedConfig,
  options: ServerOptions = {},
): Promise<{ server: Server; url: string; port: number }> {
  return new Promise((resolveReady, reject) => {
    const port = options.port ?? 4173
    const host = options.host ?? "127.0.0.1"
    const state = createServerState(config)
    const initialDbStatus = checkDbStatus(state.config.configDir, state.config.dbPath)
    if (initialDbStatus.dbExists) {
      try {
        withDb(initialDbStatus.dbPath, (db) => {
          const dbEnvs = getEnvironments(db)
          if (Object.keys(dbEnvs).length > 0) {
            state.config.environments = dbEnvs
            const active = getActiveEnvironment(db)
            const def = getDefaultEnvironment(db)
            if (active) state.config.activeEnvironment = active
            if (def) state.config.defaultEnvironment = def
          }
          const dbPlats = getPlatforms(db)
          if (dbPlats.length > 0) {
            const { targets, services } = platformsToTargetsAndServices(dbPlats)
            state.config.targets = { ...state.config.targets, ...targets }
            state.config.services = { ...state.config.services, ...services }
          }
        })
      } catch {
        // ignore load errors
      }
    }

    // Keep-alive heartbeat for SSE connections
    const heartbeat = setInterval(() => {
      for (const client of state.sseClients) {
        try {
          client.write(": keep-alive\n\n")
        } catch {
          state.sseClients.delete(client)
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
          for (const route of routes) {
            const ctx = { state, req, res, url, pathname }
            if (!route.match(ctx)) continue
            await route.handle(ctx)
            // A route that sent nothing falls through to later routes, as the old if-chain did.
            if (res.headersSent) return
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
      for (const client of state.sseClients) {
        try {
          client.end()
        } catch {
          // ignore
        }
      }
      state.sseClients.clear()
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
