import { existsSync } from "node:fs"
import type { DatabaseSync } from "node:sqlite"
import { withDb } from "../../db/connection.ts"
import {
  type Draft,
  discardDraft,
  discardDraftGroup,
  draftIdsInGroup,
  getDraftGroup,
  getDrafts,
  keepDraft,
  markBugFound,
} from "../../db/drafts.ts"
import { lastScenarioRun, passedOnContent, scenarioRunFailure } from "../../db/scenario-runs.ts"
import { getScenario } from "../../db/scenarios.ts"
import { readback } from "../../readback.ts"
import { scenarioVersion } from "../../scenario-version.ts"
import { sendJson } from "../http.ts"
import type { Route } from "../route.ts"
import type { ServerState } from "../state.ts"

/** The ids among `ids` that the active run is running. Ordinary runs never run drafts. */
function inActiveRun(state: ServerState, ids: string[]): string[] {
  return ids.filter((id) => state.activeRun?.options.drafts?.includes(id))
}

const busy = (ids: string[]) =>
  `${ids.map((id) => `"${id}"`).join(", ")} ${ids.length === 1 ? "is" : "are"} in the run that is going on. Wait for it to finish.`

const notADraft = (id: string) => `"${id}" is not a draft`

function draftView(state: ServerState, db: DatabaseSync, draft: Draft) {
  const scenario = getScenario(db, draft.id)
  if (!scenario) return undefined
  const lastRun = lastScenarioRun(db, draft.id)
  const failure = lastRun?.status === "FAILED" ? scenarioRunFailure(db, draft.id, lastRun.runId) : undefined
  return {
    id: draft.id,
    name: scenario.name ?? draft.id,
    description: scenario.description,
    state: draft.state,
    revisionOf: draft.revisionOf,
    passed: passedOnContent(db, draft.id, scenarioVersion(scenario).fingerprint),
    lastRun: lastRun ? { ...lastRun, ...(failure ? { failure } : {}) } : null,
    readback: readback(state.config, scenario),
  }
}

/** The draft id or group key in the path's `index`th segment. */
const segment = (pathname: string, index: number) => decodeURIComponent(pathname.split("/")[index])

export const draftRoutes: Route[] = [
  // GET /api/drafts
  {
    match: ({ req, pathname }) => pathname === "/api/drafts" && req.method === "GET",
    handle: async ({ state, res }) => {
      if (!existsSync(state.config.dbPath)) return sendJson(res, 200, { groups: [] })
      const groups = withDb(state.config.dbPath, (db) => {
        const drafts = getDrafts(db)
        const keys = [...new Set(drafts.map((draft) => draft.group))]
        return keys
          .map((key) => {
            const group = getDraftGroup(db, key) ?? { key, prompt: "", createdAt: 0 }
            const views = drafts.filter((draft) => draft.group === key).map((draft) => draftView(state, db, draft))
            return { ...group, drafts: views.filter((view) => view !== undefined) }
          })
          .sort((a, b) => a.createdAt - b.createdAt)
      })
      return sendJson(res, 200, { groups })
    },
  },
  // POST /api/drafts/groups/:key/keep keeps every draft in the group whose current content passed.
  {
    match: ({ req, pathname }) => /^\/api\/drafts\/groups\/[^/]+\/keep$/.test(pathname) && req.method === "POST",
    handle: async ({ state, res, pathname }) => {
      const key = segment(pathname, 4)
      const ids = withDb(state.config.dbPath, (db) => draftIdsInGroup(db, key))
      if (ids.length === 0) return sendJson(res, 404, { error: `No drafts in group "${key}"` })
      const running = inActiveRun(state, ids)
      if (running.length > 0) return sendJson(res, 409, { error: busy(running) })

      const kept: string[] = []
      const skipped: Array<{ id: string; message: string }> = []
      withDb(state.config.dbPath, (db) => {
        for (const id of ids) {
          const outcome = keepDraft(db, id)
          if (outcome.ok) kept.push(outcome.id)
          else if (outcome.reason !== "not-passed") skipped.push({ id, message: outcome.message })
        }
      })
      return sendJson(res, 200, { ok: true, kept, skipped })
    },
  },
  // DELETE /api/drafts/groups/:key discards the group's drafts and revisions.
  {
    match: ({ req, pathname }) => /^\/api\/drafts\/groups\/[^/]+$/.test(pathname) && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const key = segment(pathname, 4)
      const ids = withDb(state.config.dbPath, (db) => {
        if (!getDraftGroup(db, key)) return undefined
        return draftIdsInGroup(db, key)
      })
      if (!ids) return sendJson(res, 404, { error: `No draft group "${key}"` })
      const running = inActiveRun(state, ids)
      if (running.length > 0) return sendJson(res, 409, { error: busy(running) })
      const discarded = withDb(state.config.dbPath, (db) => discardDraftGroup(db, key))
      return sendJson(res, 200, { ok: true, discarded })
    },
  },
  // POST /api/drafts/:id/keep
  {
    match: ({ req, pathname }) => /^\/api\/drafts\/[^/]+\/keep$/.test(pathname) && req.method === "POST",
    handle: async ({ state, res, pathname }) => {
      const id = segment(pathname, 3)
      if (inActiveRun(state, [id]).length > 0) return sendJson(res, 409, { error: busy([id]) })
      const outcome = withDb(state.config.dbPath, (db) => keepDraft(db, id))
      if (outcome.ok) return sendJson(res, 200, { ok: true, id: outcome.id })
      const status = outcome.reason === "not-a-draft" ? 404 : 409
      return sendJson(res, status, { error: outcome.message, reason: outcome.reason })
    },
  },
  // POST /api/drafts/:id/bug-found
  {
    match: ({ req, pathname }) => /^\/api\/drafts\/[^/]+\/bug-found$/.test(pathname) && req.method === "POST",
    handle: async ({ state, res, pathname }) => {
      const id = segment(pathname, 3)
      const marked = withDb(state.config.dbPath, (db) => markBugFound(db, id))
      return marked ? sendJson(res, 200, { ok: true, id }) : sendJson(res, 404, { error: notADraft(id) })
    },
  },
  // DELETE /api/drafts/:id
  {
    match: ({ req, pathname }) => /^\/api\/drafts\/[^/]+$/.test(pathname) && req.method === "DELETE",
    handle: async ({ state, res, pathname }) => {
      const id = segment(pathname, 3)
      if (inActiveRun(state, [id]).length > 0) return sendJson(res, 409, { error: busy([id]) })
      const discarded = withDb(state.config.dbPath, (db) => discardDraft(db, id))
      return discarded ? sendJson(res, 200, { ok: true, id }) : sendJson(res, 404, { error: notADraft(id) })
    },
  },
]
