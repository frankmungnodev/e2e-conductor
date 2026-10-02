import { resolveFromConfig } from "../../config.ts"
import { withDb } from "../../db/connection.ts"
import { deleteFixture, getFixtures, saveFixture } from "../../db/fixtures.ts"
import { resolveDbPath } from "../../db/paths.ts"
import { runShell } from "../../process.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route } from "../route.ts"

export const fixtureRoutes: Route[] = [
  // POST /api/config/fixture
  {
    match: ({ req, pathname }) => pathname === "/api/config/fixture" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as { name?: string; cmd?: string; cwd?: string }
      if (!body?.name?.trim() || !body?.cmd?.trim()) {
        return sendJson(res, 400, { ok: false, error: "Fixture name and cmd are required" })
      }
      const fixName = body.name.trim()
      const fixCmd = body.cmd.trim()
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        const fixturesMap = withDb(targetDbPath, (db) => {
          saveFixture(db, fixName, {
            cmd: fixCmd,
            cwd: body.cwd?.trim() || undefined,
          })
          return getFixtures(db)
        })
        state.config.fixtures = fixturesMap

        return sendJson(res, 200, {
          ok: true,
          message: `Fixture "${fixName}" saved`,
          fixtures: Object.keys(fixturesMap),
          fixturesMap,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // DELETE /api/config/fixture
  {
    match: ({ req, pathname }) => pathname.startsWith("/api/config/fixture") && req.method === "DELETE",
    handle: async ({ state, res, url, pathname }) => {
      const nameParam = url.searchParams.get("name") || pathname.split("/").pop()
      if (!nameParam || nameParam === "fixture") {
        return sendJson(res, 400, { ok: false, error: "Fixture name is required" })
      }
      const targetDbPath = resolveDbPath(state.config.configDir)
      try {
        const fixturesMap = withDb(targetDbPath, (db) => {
          deleteFixture(db, nameParam)
          return getFixtures(db)
        })
        state.config.fixtures = fixturesMap

        return sendJson(res, 200, {
          ok: true,
          message: `Fixture "${nameParam}" removed`,
          fixtures: Object.keys(fixturesMap),
          fixturesMap,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: (err as Error).message })
      }
    },
  },
  // POST /api/fixtures/run
  {
    match: ({ req, pathname }) => pathname === "/api/fixtures/run" && req.method === "POST",
    handle: async ({ state, req, res }) => {
      const body = (await readBody(req)) as { name?: string; cmd?: string; cwd?: string }
      let cmdToRun = body?.cmd
      let cwdToRun = body?.cwd
      if (body?.name && state.config.fixtures?.[body.name]) {
        const fix = state.config.fixtures[body.name]
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
        const fullCwd = cwdToRun ? resolveFromConfig(state.config, cwdToRun) : state.config.configDir
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
    },
  },
]
