import { createHash } from "node:crypto"
import type { Scenario } from "./db/scenarios.ts"

/**
 * The content of a scenario that decides what a run does, as canonical JSON, and its SHA-256
 * fingerprint. Steps stay as written, with placeholders unsubstituted, so no secret is stored.
 * Name, description, step ids and action ids are left out: changing them changes nothing that runs.
 */
export function scenarioVersion(scenario: Scenario): { fingerprint: string; json: string } {
  const content = {
    setup: scenario.setup ?? [],
    vars: scenario.vars ?? {},
    steps: scenario.steps.map(({ id: _id, actions, ...step }) => ({
      ...step,
      actions: actions?.map(({ id: _actionId, ...action }) => action),
    })),
  }
  const json = JSON.stringify(canonical(content))
  return { fingerprint: createHash("sha256").update(json).digest("hex"), json }
}

// Sorted keys, with null and undefined fields dropped: a scenario read from SQLite and the same
// scenario read from JSON differ only in absent-versus-null fields, which must not read as a change.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] != null)
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
  )
}
