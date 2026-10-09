import type { Scenario } from "./db/scenarios.ts"
import type { ScenarioOutcome } from "./scenario-run.ts"

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
 * What still holds once a scenario ends: its own setup, when it is `read_only`, its setup passed (or
 * was reused), and it never paused. `read_only` is a promise about the scenario's own setup, so a
 * scenario with no setup ends the hold, and so does a pause, during which the user can change the app
 * or its data by hand.
 */
export function heldAfter(
  held: HeldSetup | undefined,
  scenario: Scenario,
  label: string,
  outcome: Pick<ScenarioOutcome, "setupFailed" | "paused">,
): HeldSetup | undefined {
  const setup = scenario.setup ?? []
  if (!scenario.read_only || setup.length === 0 || outcome.setupFailed || outcome.paused) return undefined
  const fixtures = JSON.stringify(setup)
  return held?.fixtures === fixtures ? held : { fixtures, ranIn: label }
}
