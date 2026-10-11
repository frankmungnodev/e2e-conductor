import { PROBLEM_CODES, type ProblemCode } from "./vocabulary.ts"

/** One thing wrong with a scenario, in a form an agent can parse and a person can read. */
export type Problem = {
  /** The scenario file, when the check read one. */
  file?: string
  /** JSON pointer to the offending value, e.g. `/steps/0/actions/1/action`. */
  pointer: string
  stepIndex?: number
  stepName?: string
  code: ProblemCode
  message: string
  /** The offending value: a field name, action name, target or fixture. */
  value?: unknown
  /** The values that would be accepted, when there is a fixed set. */
  allowed?: string[]
  hint: string
}

/** A problem with the hint its code carries. */
export function problem(code: ProblemCode, fields: Omit<Problem, "code" | "hint">): Problem {
  return { code, hint: PROBLEM_CODES[code], ...fields }
}

/** The one-line text `loadScenarios`, the scenario routes and the UI show: `steps[0] "name": message`. */
export function formatProblem(found: Problem): string {
  const where = found.stepIndex !== undefined ? `steps[${found.stepIndex}] "${found.stepName}"` : found.pointer.split("/")[1]
  return `${where}: ${found.message}`
}
