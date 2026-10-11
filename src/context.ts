import { JSON_MATCH_OPERATORS } from "./vocabulary.ts"

/** Values a scenario can reference: `${ctx.name}`, `${env.NAME}`, `${run.id}`. */
export type Scope = {
  ctx: Record<string, unknown>
  env: Record<string, string>
  run: Record<string, unknown>
}

export const PLACEHOLDER = /\$\{(ctx|env|run)\.([^}]+)\}/g
const WHOLE_PLACEHOLDER = /^\$\{(ctx|env|run)\.([^}]+)\}$/

function lookup(scope: Scope, root: keyof Scope, path: string): unknown {
  const value = getPath(scope[root], path)
  if (value === undefined) {
    throw new Error(`\${${root}.${path}} is not defined`)
  }
  return value
}

/**
 * Replace placeholders in strings, arrays and objects (keys included).
 * A string that is exactly one placeholder keeps the value's type.
 */
export function substitute<T>(value: T, scope: Scope): T {
  if (typeof value === "string") {
    const whole = value.match(WHOLE_PLACEHOLDER)
    if (whole) return lookup(scope, whole[1] as keyof Scope, whole[2]) as T
    return value.replace(PLACEHOLDER, (_, root: keyof Scope, path: string) => {
      return stringify(lookup(scope, root, path))
    }) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitute(item, scope)) as T
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [substitute(key, scope), substitute(item, scope)]),
    ) as T
  }
  return value
}

/** Read `a.b[0].c` from an object. Returns undefined when any part is missing. */
export function getPath(source: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  let current: unknown = source
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Strings as they are; anything else as JSON. */
export function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

/**
 * Compare one value against an expectation.
 * Plain values must be deeply equal. Operator objects:
 * `{ "$exists": true }`, `{ "$contains": "text" }` (text search in the JSON), `{ "$notContains": "text" }`,
 * `{ "$gt": 1 }`, `{ "$gte": 1 }`.
 * Returns an error message, or undefined when it matches.
 */
export function mismatch(actual: unknown, expected: unknown): string | undefined {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const ops = expected as Record<string, unknown>
    const keys = Object.keys(ops)
    if (keys.length > 0 && keys.every((key) => key.startsWith("$"))) {
      for (const [op, arg] of Object.entries(ops)) {
        if (!(JSON_MATCH_OPERATORS as readonly string[]).includes(op)) return `unknown operator ${op}`
        const failed =
          (op === "$exists" && (actual !== undefined) !== arg) ||
          (op === "$contains" && (actual === undefined || !stringify(actual).includes(String(arg)))) ||
          (op === "$notContains" && actual !== undefined && stringify(actual).includes(String(arg))) ||
          (op === "$gt" && !(typeof actual === "number" && actual > Number(arg))) ||
          (op === "$gte" && !(typeof actual === "number" && actual >= Number(arg)))
        if (failed) return `expected ${op} ${stringify(arg)}, got ${stringify(actual)}`
      }
      return undefined
    }
  }
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? undefined
    : `expected ${stringify(expected)}, got ${stringify(actual)}`
}
