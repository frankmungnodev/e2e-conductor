import type { DatabaseSync } from "node:sqlite"
import { safeJsonParse } from "./connection.ts"
import type { Step } from "./scenarios.ts"

export type StepPreset = {
  id: string
  name: string
  description?: string
  target: string
  step: Step
  createdAt?: number
  updatedAt?: number
}

type StepPresetRow = {
  id: string
  name: string
  description?: string | null
  target: string
  step_json: string
  created_at?: number | null
  updated_at?: number | null
}

function mapStepPresetRow(r: StepPresetRow): StepPreset {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    target: r.target,
    step: safeJsonParse<Step>(r.step_json) ?? { name: r.name, target: r.target },
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  }
}

export function getStepPresets(db: DatabaseSync): StepPreset[] {
  const rows = db.prepare("SELECT * FROM step_presets ORDER BY name ASC").all() as StepPresetRow[]
  return rows.map(mapStepPresetRow)
}

export function getStepPreset(db: DatabaseSync, id: string): StepPreset | undefined {
  const r = db.prepare("SELECT * FROM step_presets WHERE id = ?").get(id) as StepPresetRow | undefined
  return r ? mapStepPresetRow(r) : undefined
}

export function saveStepPreset(db: DatabaseSync, preset: StepPreset): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO step_presets (id, name, description, target, step_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      target = excluded.target,
      step_json = excluded.step_json,
      updated_at = excluded.updated_at
  `).run(
    preset.id,
    preset.name,
    preset.description || null,
    preset.target,
    JSON.stringify(preset.step || { name: preset.name, target: preset.target }),
    preset.createdAt ?? now,
    now,
  )
}

export function deleteStepPreset(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM step_presets WHERE id = ?").run(id)
}
