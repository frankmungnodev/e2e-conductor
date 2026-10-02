import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type MobileTarget, resolveFromConfig } from "../../config.ts"
import { checkFlowSource } from "../../flow.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const flowRoutes: Route[] = [
  // GET /api/flows
  {
    match: ({ req, pathname }) => pathname === "/api/flows" && req.method === "GET",
    handle: async ({ state, res }) => {
      const flows: Array<{ target: string; file: string; path: string; content: string; isValid: boolean; errors: string[] }> = []
      for (const [targetName, target] of Object.entries(state.config.targets)) {
        if (target.driver === "mobile") {
          const mob = target as MobileTarget
          const flowsDir = resolveFromConfig(state.config, mob.flows)
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
    },
  },
  // POST /api/flows
  {
    match: ({ req, pathname }) => pathname === "/api/flows" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as { target: string; file: string; content: string }
      if (!body?.target || !body.file || typeof body.content !== "string") {
        return sendJson(res, 400, { error: "Missing target, file, or content" })
      }
      const target = state.config.targets[body.target] as MobileTarget | undefined
      if (target?.driver !== "mobile") {
        return sendJson(res, 400, { error: `Target ${body.target} is not a mobile target` })
      }
      const flowsDir = resolveFromConfig(state.config, target.flows)
      mkdirSync(flowsDir, { recursive: true })
      const full = join(flowsDir, body.file)
      writeFileSync(full, body.content)
      const errors = checkFlowSource(body.content)
      return sendJson(res, 200, { ok: true, file: body.file, isValid: errors.length === 0, errors })
    },
  },
]
