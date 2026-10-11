import type { ConfigMeta, ScenarioItem } from "../../types.ts"
import type {
  DraftAwareConfig,
  DraftAwareScenario,
  DraftGroup,
  DraftItem,
  DraftState,
  ScenarioDraft,
} from "./draftTypes.ts"

/** A `Badge` variant. Named here because the unit tests cannot load `Badge.tsx`. */
type BadgeSpec = { label: string; variant: "success" | "warning" | "neutral" | "info" | "danger" }

/** The draft state of a scenario from `GET /api/scenarios`, or undefined for a kept scenario. */
export function scenarioDraft(item: ScenarioItem): ScenarioDraft | undefined {
  return (item as DraftAwareScenario).draft
}

/** The scenarios that are kept: no drafts, no revisions. Ordinary runs run only these. */
export function keptScenarios(items: ScenarioItem[]): ScenarioItem[] {
  return items.filter((item) => !scenarioDraft(item))
}

/** The environments that carry the draft mark, in config order. A draft run may use only these. */
export function draftEnvironments(config: ConfigMeta | undefined): string[] {
  const environments = (config as DraftAwareConfig | undefined)?.environments ?? {}
  return Object.entries(environments)
    .filter(([, environment]) => environment.allowDrafts)
    .map(([name]) => name)
}

/** The active environment when it carries the draft mark, else the first marked one. */
export function defaultDraftEnvironment(config: ConfigMeta | undefined): string | undefined {
  const marked = draftEnvironments(config)
  const active = config?.activeEnvironment
  return active && marked.includes(active) ? active : marked[0]
}

export function stateBadge(state: DraftState): BadgeSpec {
  return state === "bug_found" ? { label: "Bug Found", variant: "danger" } : { label: "Draft", variant: "info" }
}

/** Whether the draft's current content passed. A pass that needed a fix during the run does not count. */
export function passBadge(draft: DraftItem): BadgeSpec {
  if (draft.passed) return { label: "Passed", variant: "success" }
  if (draft.lastRun?.status === "FIXED") return { label: "Fixed, Run Again", variant: "warning" }
  return { label: "Not Yet Passed", variant: "neutral" }
}

/** The drafts Keep all passing would keep. */
export function passingDrafts(group: DraftGroup): DraftItem[] {
  return group.drafts.filter((draft) => draft.passed)
}

/** A draft that ran and did not pass can be marked as failing on an app bug. */
export function canMarkBugFound(draft: DraftItem): boolean {
  return draft.state === "draft" && !draft.passed && draft.lastRun !== null
}

/** "Revision of <kept name>" for a revision, or undefined for a new draft. */
export function revisionLabel(draft: DraftItem, scenarios: ScenarioItem[]): string | undefined {
  if (!draft.revisionOf) return undefined
  const kept = scenarios.find((item) => item.id === draft.revisionOf)
  return `Revision of ${kept?.name ?? draft.revisionOf}`
}
