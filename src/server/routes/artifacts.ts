import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { resolveFromConfig } from "../../config.ts"
import { MIME_TYPES, sendText } from "../http.ts"
import type { Route } from "../route.ts"

export const artifactRoutes: Route[] = [
  // GET /api/artifacts/*
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/artifacts/") && req.method === "GET",
    handle: async ({ state, res, pathname }) => {
      const rel = pathname.replace("/api/artifacts/", "")
      const resultsDir = resolveFromConfig(state.config, state.config.results)
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
    },
  },
]
