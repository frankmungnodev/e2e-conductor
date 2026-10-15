import type { ScenarioItem } from "../../types.ts"
import { keptScenarios, scenarioDraft } from "../drafts/draftHelpers.ts"

/**
 * The builder's list: kept scenarios, plus the draft that is open in it (from Edit in Builder), so
 * the person sees what they are editing. Drafts otherwise live in the Drafts tab.
 */
export function builderScenarios(items: ScenarioItem[], openId: string | null): ScenarioItem[] {
  return items.filter((item) => !scenarioDraft(item) || item.id === openId)
}

/** The scenario the builder opens with: the requested one, such as a draft from Edit in Builder, else the first kept one. */
export function initialBuilderScenario(items: ScenarioItem[], requestedId: string | undefined): ScenarioItem | undefined {
  return items.find((item) => item.id === requestedId) ?? keptScenarios(items)[0]
}

/** The kept scenario to open after `deletedId` is deleted, if any is left. */
export function nextAfterDelete(items: ScenarioItem[], deletedId: string): ScenarioItem | undefined {
  return keptScenarios(items).find((item) => item.id !== deletedId)
}
