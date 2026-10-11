import { Inbox } from "lucide-react"
import { useConfirmDialog } from "../../components/ConfirmModal.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
import type { ConfigMeta, ScenarioItem } from "../../types.ts"
import { DraftGroupCard } from "./DraftGroupCard.tsx"
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
  const defaultEnvironment = defaultDraftEnvironment(config)

  return (
    <div className="h-full overflow-y-auto bg-editor">
      <div className="flex flex-col gap-3 max-w-5xl px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-bold text-fg-bright">Drafts</h2>
          <p className="text-xs text-fg-muted">
            Scenarios a coding agent saved, grouped by the prompt that produced them. Run a batch, keep the drafts
            that pass, and mark the ones that fail on an app bug.
          </p>
        </div>

        {drafts.groups === null ? (
          <p className="text-xs text-fg-muted">Loading…</p>
        ) : drafts.groups.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-6 h-6" />}
            title="No Drafts"
            description="Run `e2e kit` in your project, then ask your coding agent to write scenarios and save them with `e2e save`. They show up here, grouped by the prompt you gave it."
            bordered
          />
        ) : (
          drafts.groups.map((group) => (
            <DraftGroupCard
              key={group.key}
              group={group}
              scenarios={scenarios}
              environments={environments}
              defaultEnvironment={defaultEnvironment}
              isRunning={isRunning}
              onRunBatch={onRunBatch}
              onOpenEnvironments={onOpenEnvironments}
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
          ))
        )}
      </div>
      <ConfirmDialog />
    </div>
  )
}
