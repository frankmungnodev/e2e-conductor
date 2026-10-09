import type { Scenario } from "./db/scenarios.ts"

/**
 * The state a passed setup left, while every scenario that ran after it was `read_only`.
 * `fixtures` is that setup list as JSON, `ranIn` the label of the scenario-iteration that ran it.
 */
export type HeldSetup = { fixtures: string; ranIn: string }

/** The held setup when it is this scenario's setup: running the fixtures again would change nothing. */
export function reusableSetup(held: HeldSetup | undefined, scenario: Scenario): HeldSetup | undefined {
  const setup = scenario.setup ?? []
  if (!held || setup.length === 0) return undefined
  return held.fixtures === JSON.stringify(setup) ? held : undefined
}

/**
 * What still holds once a scenario ends. A scenario that is not `read_only` may have changed
 * anything, so nothing holds. A read-only one with no setup keeps what held before it; with a setup,
 * it holds its own setup if that setup passed (or was reused).
 */
export function heldAfter(
  held: HeldSetup | undefined,
  scenario: Scenario,
  label: string,
  setupFailed: boolean,
): HeldSetup | undefined {
  if (!scenario.read_only) return undefined
  const setup = scenario.setup ?? []
  if (setup.length === 0) return held
  if (setupFailed) return undefined
  const fixtures = JSON.stringify(setup)
  return held?.fixtures === fixtures ? held : { fixtures, ranIn: label }
}
