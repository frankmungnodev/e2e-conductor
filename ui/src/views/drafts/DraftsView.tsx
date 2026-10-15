import { useState } from "react"
import { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import type { ConfigMeta, ScenarioItem } from "../../types.ts"
import { DraftGroupCard } from "./DraftGroupCard.tsx"
import { DraftsEmptyCard } from "./DraftsEmptyCard.tsx"
import { DraftsRunBar } from "./DraftsRunBar.tsx"
import { defaultDraftEnvironment, draftEnvironments } from "./draftHelpers.ts"
import { useDrafts } from "./useDrafts.ts"

type DraftsViewProps = {
  scenarios: ScenarioItem[]
  config?: ConfigMeta
  isRunning: boolean
  /** Starts a run of exactly these drafts on `environment`, then shows it in the Runner. */
  onRunBatch: (ids: string[], environment: string, pauseOnFailure: boolean) => void
  onEditInBuilder: (id: string) => void
  /** Reloads the app's scenario list after a draft is kept or discarded. */
  onScenariosChanged: () => void
  onOpenEnvironments: () => void
}

/** Scenarios a coding agent saved, grouped by prompt, for the person to run, keep, mark or discard. */
export function DraftsView({
  scenarios,
  config,
  isRunning,
  onRunBatch,
  onEditInBuilder,
  onScenariosChanged,
  onOpenEnvironments,
}: DraftsViewProps) {
  const drafts = useDrafts(onScenariosChanged)
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const environments = draftEnvironments(config)
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [pauseOnFailure, setPauseOnFailure] = useState(false)
  const environment = chosen && environments.includes(chosen) ? chosen : defaultDraftEnvironment(config)
  const run = (ids: string[]) => {
    if (environment) onRunBatch(ids, environment, pauseOnFailure)
  }
  const allIds = drafts.groups?.flatMap((group) => group.drafts.map((draft) => draft.id)) ?? []
  const isEmpty = drafts.groups?.length === 0

  return (
    <div className="h-full overflow-y-auto bg-editor">
      <div className={`flex flex-col gap-3 min-h-full px-6 py-4 ${isEmpty ? "" : "max-w-5xl"}`}>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-bold text-fg-bright">Drafts</h2>
          {allIds.length > 0 && (
            <p className="text-xs text-fg-muted">Scenarios a coding agent saved, grouped by the request that produced them.</p>
          )}
        </div>

        {drafts.groups === null ? (
          <p className="text-xs text-fg-muted">Loading…</p>
        ) : drafts.groups.length === 0 ? (
          <DraftsEmptyCard hasDraftEnvironment={environment !== undefined} onOpenEnvironments={onOpenEnvironments} />
        ) : (
          <>
            <DraftsRunBar
              environments={environments}
              environment={environment}
              onEnvironmentChange={setChosen}
              pauseOnFailure={pauseOnFailure}
              onPauseOnFailureChange={setPauseOnFailure}
              isRunning={isRunning}
              draftCount={allIds.length}
              onRunAll={() => run(allIds)}
              onOpenEnvironments={onOpenEnvironments}
            />
            {drafts.groups.map((group) => (
              <DraftGroupCard
                key={group.key}
                group={group}
                scenarios={scenarios}
                canRun={environment !== undefined}
                isRunning={isRunning}
                onRun={run}
                onKeep={(draft) => void drafts.keep(draft.id, draft.name)}
                onKeepAllPassing={() => void drafts.keepAllPassing(group.key)}
                onMarkBug={(draft) => void drafts.markBug(draft.id)}
                onEdit={(draft) => onEditInBuilder(draft.id)}
                onDiscard={(draft) =>
                  confirm({
                    title: "Discard Draft",
                    message: `Discard "${draft.name}"? Its scenario is deleted, and an agent can save it again later.`,
                    confirmText: "Discard",
                    onConfirm: () => drafts.discard(draft.id),
                  })
                }
                onDiscardGroup={() =>
                  confirm({
                    title: "Discard Group",
                    message: `Discard all ${group.drafts.length} drafts saved for "${group.prompt}"? Kept scenarios are not touched.`,
                    confirmText: "Discard Group",
                    onConfirm: () => drafts.discardGroup(group.key),
                  })
                }
              />
            ))}
          </>
        )}
      </div>
      <ConfirmDialog />
    </div>
  )
}
