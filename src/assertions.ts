import { getPath, mismatch } from "./context.ts"
import type { StepResult } from "./drivers/types.ts"
import type { Step } from "./scenario.ts"

/**
 * A check the scenario author asked for did not hold: the step ran, but its result was not
 * what the scenario expected. Its class is what tells "Assertion failed" apart from "Step error",
 * so code that re-wraps an error to add context must keep the class.
 */
export class AssertionFailure extends Error {
  override name = "AssertionFailure"
}

export type FailureLabel = "Environment down" | "Assertion failed" | "Step error"

/**
 * Label a failure by what happened, not by who is to blame. `down` is what the post-failure
 * re-check found down; anything down wins, because a dead service explains any other symptom.
 */
export function failureLabel(error: unknown, down: string[]): FailureLabel {
  if (down.length > 0) return "Environment down"
  if (error instanceof AssertionFailure || isPlaywrightExpectError(error)) return "Assertion failed"
  return "Step error"
}

// Playwright's `expect` (used inside web modules) throws an ExpectError that carries the
// matcher result. Playwright does not export the class, so recognize it by that field.
function isPlaywrightExpectError(error: unknown): boolean {
  return error instanceof Error && "matcherResult" in error
}

export function checkAssert(step: Step, result: StepResult) {
  const expect = step.assert ?? {}
  const errors: string[] = []

  if (expect.status !== undefined && result.status !== expect.status) {
    errors.push(`status: expected ${expect.status}, got ${result.status}`)
  } else if (expect.status === undefined && result.status !== undefined && result.status >= 400) {
    errors.push(`status ${result.status} (add assert.status to expect an error)`)
  }
  if (result.exitCode !== undefined && result.exitCode !== (expect.exit_code ?? 0)) {
    errors.push(`exit code: expected ${expect.exit_code ?? 0}, got ${result.exitCode}`)
  }
  if (expect.output_contains !== undefined && !(result.output ?? "").includes(expect.output_contains)) {
    errors.push(`output does not contain "${expect.output_contains}"`)
  }
  for (const [path, expected] of Object.entries(expect.json_match ?? {})) {
    const problem = mismatch(getPath(result.data, path), expected)
    if (problem) errors.push(`${path}: ${problem}`)
  }
  if (errors.length > 0) throw new AssertionFailure(errors.join("; "))
}

export function extract(step: Step, result: StepResult, ctx: Record<string, unknown>) {
  for (const [name, path] of Object.entries(step.extract ?? {})) {
    const value = getPath(result.data, path)
    if (value === undefined) throw new AssertionFailure(`extract ${name}: nothing at "${path}"`)
    ctx[name] = value
  }
}

/** Add context to an error's message, keeping it an AssertionFailure if it was one. */
export function prefixError(prefix: string, error: unknown): Error {
  const message = `${prefix}${(error as Error).message}`
  return error instanceof AssertionFailure ? new AssertionFailure(message) : new Error(message)
}
