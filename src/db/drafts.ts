import type { DatabaseSync } from "node:sqlite"
import { scenarioVersion } from "../scenario-version.ts"
import { passedOnContent } from "./scenario-runs.ts"
import { deleteScenario, getScenario, type Scenario, saveScenario } from "./scenarios.ts"

export type DraftState = "draft" | "bug_found"

/** A scenario an agent saved that the person has not kept yet. A kept scenario has no draft. */
export type Draft = {
  id: string
  state: DraftState
  group: string
  /** Set on a revision: the kept scenario it would replace. */
  revisionOf?: string
  /** On a revision: the kept scenario's fingerprint when the revision was saved. */
  baseFingerprint?: string
}

/** The prompt a batch of drafts came from, keyed by the group slug the agent saved under. */
export type DraftGroup = { key: string; prompt: string; agent?: string; createdAt: number }

export type KeepOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: "not-a-draft" | "not-passed" | "kept-missing" | "base-changed"; message: string }

type DraftRow = {
  id: string
  draft_state: DraftState
  draft_group: string
  revision_of: string | null
  base_fingerprint: string | null
}

const DRAFT_COLUMNS = "id, draft_state, draft_group, revision_of, base_fingerprint"

/** The id of a kept scenario's draft revision. */
export function revisionId(keptId: string): string {
  return `${keptId}@draft`
}

function mapDraftRow(row: DraftRow): Draft {
  return {
    id: row.id,
    state: row.draft_state,
    group: row.draft_group,
    ...(row.revision_of ? { revisionOf: row.revision_of } : {}),
    ...(row.base_fingerprint ? { baseFingerprint: row.base_fingerprint } : {}),
  }
}

/** The draft with this id, or undefined for a kept scenario or a missing id. */
export function getDraft(db: DatabaseSync, id: string): Draft | undefined {
  const row = db.prepare(`SELECT ${DRAFT_COLUMNS} FROM scenarios WHERE id = ? AND draft_state IS NOT NULL`).get(id) as
    | DraftRow
    | undefined
  return row ? mapDraftRow(row) : undefined
}

export function getDrafts(db: DatabaseSync): Draft[] {
  const rows = db.prepare(`SELECT ${DRAFT_COLUMNS} FROM scenarios WHERE draft_state IS NOT NULL ORDER BY id ASC`).all() as DraftRow[]
  return rows.map(mapDraftRow)
}

export function getDraftGroup(db: DatabaseSync, key: string): DraftGroup | undefined {
  const row = db.prepare("SELECT key, prompt, agent, created_at FROM draft_groups WHERE key = ?").get(key) as
    | { key: string; prompt: string; agent: string | null; created_at: number }
    | undefined
  if (!row) return undefined
  return { key: row.key, prompt: row.prompt, ...(row.agent ? { agent: row.agent } : {}), createdAt: row.created_at }
}

/** Adds the group, which then needs a prompt, or updates the prompt and agent a later save names. */
export function saveDraftGroup(db: DatabaseSync, group: { key: string; prompt?: string; agent?: string }): void {
  if (getDraftGroup(db, group.key)) {
    db.prepare("UPDATE draft_groups SET prompt = COALESCE(?, prompt), agent = COALESCE(?, agent) WHERE key = ?").run(
      group.prompt || null,
      group.agent || null,
      group.key,
    )
    return
  }
  if (!group.prompt) throw new Error(`draft group "${group.key}" is new, so it needs a prompt`)
  db.prepare("INSERT INTO draft_groups (key, prompt, agent, created_at) VALUES (?, ?, ?, ?)").run(
    group.key,
    group.prompt,
    group.agent || null,
    Date.now(),
  )
}

/**
 * Saves `scenario` as a draft in `group`, adding it or replacing the draft with its id, which moves to
 * `group`. Incoming step and action ids are dropped, so copied steps never collide with stored ones.
 * The caller routes an id that is a kept scenario to `saveRevision` and refuses a Bug found draft.
 */
export function saveDraft(db: DatabaseSync, scenario: Scenario, group: string): void {
  saveScenario(db, withoutIds(scenario))
  db.prepare("UPDATE scenarios SET draft_state = 'draft', draft_group = ? WHERE id = ?").run(group, scenario.id)
}

/**
 * Saves `scenario` as the draft revision of the kept scenario `keptId` and returns the revision's id.
 * The kept scenario is not touched. Its current fingerprint is recorded, so Keep can tell when it
 * changed after this save.
 */
export function saveRevision(db: DatabaseSync, keptId: string, scenario: Scenario, group: string): string {
  const kept = getScenario(db, keptId)
  if (!kept) throw new Error(`no kept scenario "${keptId}" to revise`)
  const id = revisionId(keptId)
  saveScenario(db, { ...withoutIds(scenario), id })
  db.prepare(
    "UPDATE scenarios SET draft_state = 'draft', draft_group = ?, revision_of = ?, base_fingerprint = ? WHERE id = ?",
  ).run(group, keptId, scenarioVersion(kept).fingerprint, id)
  return id
}

/**
 * Keeps a draft whose current content passed a run. A new draft becomes an ordinary scenario. A revision
 * replaces its kept scenario's content, with new step ids, and is deleted; it is refused when the kept
 * scenario is gone or changed after the revision was saved.
 */
export function keepDraft(db: DatabaseSync, id: string): KeepOutcome {
  const draft = getDraft(db, id)
  const scenario = getScenario(db, id)
  if (!draft || !scenario) return { ok: false, reason: "not-a-draft", message: `"${id}" is not a draft` }
  if (!passedOnContent(db, id, scenarioVersion(scenario).fingerprint)) {
    return { ok: false, reason: "not-passed", message: `"${id}" has not passed a run on its current steps` }
  }
  if (!draft.revisionOf) {
    db.prepare(
      "UPDATE scenarios SET draft_state = NULL, draft_group = NULL, revision_of = NULL, base_fingerprint = NULL WHERE id = ?",
    ).run(id)
    return { ok: true, id }
  }

  const keptId = draft.revisionOf
  const resave = "Discard this revision and have the agent save it again."
  const kept = getScenario(db, keptId)
  if (!kept) return { ok: false, reason: "kept-missing", message: `"${keptId}" no longer exists. ${resave}` }
  if (scenarioVersion(kept).fingerprint !== draft.baseFingerprint) {
    return { ok: false, reason: "base-changed", message: `"${keptId}" changed after this revision was saved. ${resave}` }
  }
  saveScenario(db, { ...withoutIds(scenario), id: keptId })
  deleteScenario(db, id)
  return { ok: true, id: keptId }
}

/** Marks a draft Bug found: its run failed on a real app bug, so an agent save may not change it. */
export function markBugFound(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("UPDATE scenarios SET draft_state = 'bug_found' WHERE id = ? AND draft_state IS NOT NULL").run(id)
  return result.changes > 0
}

/** Deletes a draft. A kept scenario is never deleted here, and false says nothing was. */
export function discardDraft(db: DatabaseSync, id: string): boolean {
  if (!getDraft(db, id)) return false
  deleteScenario(db, id)
  return true
}

/** Deletes every draft in the group and the group itself, returning the ids deleted. */
export function discardDraftGroup(db: DatabaseSync, key: string): string[] {
  const rows = db.prepare("SELECT id FROM scenarios WHERE draft_group = ? AND draft_state IS NOT NULL").all(key) as Array<{ id: string }>
  for (const { id } of rows) deleteScenario(db, id)
  db.prepare("DELETE FROM draft_groups WHERE key = ?").run(key)
  return rows.map(({ id }) => id)
}

function withoutIds(scenario: Scenario): Scenario {
  return {
    ...scenario,
    steps: scenario.steps.map(({ id: _id, actions, ...step }) => ({
      ...step,
      ...(actions ? { actions: actions.map(({ id: _actionId, ...action }) => action) } : {}),
    })),
  }
}
