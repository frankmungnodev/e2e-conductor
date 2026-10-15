// Draft types for the UI. They live here, not in `ui/src/types.ts`, because that file is at its line budget.
import type { ConfigMeta, EnvironmentMeta, RunSummary, ScenarioItem } from "../../types.ts"

export type DraftState = "draft" | "bug_found"

/** Mirrors `ScenarioRunStatus` in src/db/scenario-runs.ts. */
export type DraftRunStatus = "RUNNING" | "PASSED" | "FAILED" | "FIXED" | "CANCELLED"

/** Mirrors `Readback` in src/readback.ts. */
export type Readback = {
  steps: Array<{ name: string; target: string; sentences: string[] }>
  targets: string[]
  fixtures: string[]
  notes: string[]
  commands: string[]
  urls: string[]
}

/** One draft from `GET /api/drafts`. `passed` is true when its current content passed a run. */
export type DraftItem = {
  id: string
  name: string
  description?: string
  state: DraftState
  revisionOf?: string
  passed: boolean
  lastRun: { runId: string; status: DraftRunStatus } | null
  readback: Readback
}

/** The drafts saved under one prompt, from `GET /api/drafts`. */
export type DraftGroup = {
  key: string
  prompt: string
  agent?: string
  createdAt: number
  drafts: DraftItem[]
}

/** A run summary, marked `drafts` when it came from a draft run. Lives here because `ui/src/types.ts` is at its budget. */
export type DraftAwareSummary = RunSummary & { drafts?: true }

/** The draft state `GET /api/scenarios` sends next to a draft, outside `raw`. */
export type ScenarioDraft = { state: DraftState; group: string; revisionOf?: string }

/** A `GET /api/scenarios` item with its draft state. */
export type DraftAwareScenario = ScenarioItem & { draft?: ScenarioDraft }

/** An environment from `GET /api/config` with its draft mark. */
export type DraftAwareEnvironment = EnvironmentMeta & { allowDrafts?: boolean }

export type DraftAwareConfig = ConfigMeta & { environments?: Record<string, DraftAwareEnvironment> }
