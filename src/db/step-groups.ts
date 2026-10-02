import type { DatabaseSync } from "node:sqlite"
import { safeJsonParse } from "./connection.ts"
import type { Step } from "./scenarios.ts"

export type StepGroup = {
  id: string
  name: string
  description?: string
  target?: string
  steps: Step[]
  createdAt?: number
  updatedAt?: number
}

type StepGroupRow = {
  id: string
  name: string
  description?: string | null
  target?: string | null
  steps: string
  created_at?: number | null
  updated_at?: number | null
}

function mapStepGroupRow(r: StepGroupRow): StepGroup {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    target: r.target ?? undefined,
    steps: safeJsonParse<Step[]>(r.steps) ?? [],
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  }
}

export function getStepGroups(db: DatabaseSync): StepGroup[] {
  const rows = db.prepare("SELECT * FROM step_groups ORDER BY name ASC").all() as StepGroupRow[]
  return rows.map(mapStepGroupRow)
}

export function getStepGroup(db: DatabaseSync, id: string): StepGroup | undefined {
  const r = db.prepare("SELECT * FROM step_groups WHERE id = ?").get(id) as StepGroupRow | undefined
  return r ? mapStepGroupRow(r) : undefined
}

export function saveStepGroup(db: DatabaseSync, group: StepGroup): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO step_groups (id, name, description, target, steps, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      target = excluded.target,
      steps = excluded.steps,
      updated_at = excluded.updated_at
  `).run(
    group.id,
    group.name,
    group.description || null,
    group.target || null,
    JSON.stringify(group.steps || []),
    group.createdAt ?? now,
    now,
  )
}

export function deleteStepGroup(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM step_groups WHERE id = ?").run(id)
}
