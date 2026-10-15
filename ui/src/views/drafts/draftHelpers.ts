import type { ConfigMeta, ScenarioItem } from "../../types.ts"
import type {
  DraftAwareConfig,
  DraftAwareScenario,
  DraftGroup,
  DraftItem,
  Readback,
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

/** The one status a draft row shows: Bug Found, then whether its current content passed, then its last run. */
export function rowStatus(draft: DraftItem): BadgeSpec {
  if (draft.state === "bug_found") return { label: "Bug Found", variant: "danger" }
  if (draft.passed) return { label: "Passed", variant: "success" }
  switch (draft.lastRun?.status) {
    case undefined:
      return { label: "Not Run", variant: "neutral" }
    case "FAILED":
      return { label: "Failed", variant: "danger" }
    case "FIXED":
      return { label: "Fixed, Run Again", variant: "warning" }
    // A pass on older content: the draft changed since.
    case "PASSED":
      return { label: "Changed, Run Again", variant: "warning" }
    case "RUNNING":
      return { label: "Running", variant: "info" }
    case "CANCELLED":
      return { label: "Cancelled", variant: "neutral" }
  }
}

/** Why the last run failed, e.g. "Step 2, Check exit: exit code: expected 0, got 1", or undefined. */
export function failureText(draft: DraftItem): string | undefined {
  const failure = draft.lastRun?.status === "FAILED" ? draft.lastRun.failure : undefined
  if (!failure) return undefined
  if (failure.step === undefined) return failure.message
  return `Step ${failure.step}${failure.name ? `, ${failure.name}` : ""}: ${failure.message}`
}

export function stepCountLabel(readback: Readback): string {
  return `${readback.steps.length} step${readback.steps.length === 1 ? "" : "s"}`
}

/** A prompt on one line, for a group heading that must not grow into a paragraph. */
export function promptLine(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim()
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
