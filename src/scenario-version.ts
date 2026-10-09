import { createHash } from "node:crypto"
import type { Scenario } from "./db/scenarios.ts"

/**
 * The content of a scenario that decides what a run does, as canonical JSON, and its SHA-256
 * fingerprint. Steps stay as written, with placeholders unsubstituted, so no secret is stored.
 * Name, description, step ids and action ids are left out: changing them changes nothing that runs.
 * `read_only` is in only when true, so scenarios saved before it existed keep their fingerprint.
 */
export function scenarioVersion(scenario: Scenario): { fingerprint: string; json: string } {
  const content = {
    setup: scenario.setup ?? [],
    vars: scenario.vars ?? {},
    ...(scenario.read_only ? { read_only: true } : {}),
    steps: scenario.steps.map(({ id: _id, actions, ...step }) => ({
      ...withoutEmpty(step),
      ...(actions ? { actions: actions.map(({ id: _actionId, ...action }) => withoutEmpty(action)) } : {}),
    })),
  }
  const json = JSON.stringify(sortKeys(content))
  return { fingerprint: createHash("sha256").update(json).digest("hex"), json }
}

// A step or action read from SQLite and the same one read from JSON differ only in absent-versus-null
// fields, which must not read as a change. Only those records' own fields are dropped: a null inside
// vars, a body or an assertion is the scenario's data, and changes what runs.
function withoutEmpty<T extends object>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value != null)) as Partial<T>
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  )
}
