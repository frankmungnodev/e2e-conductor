import { CheckCheck, Play, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/Button.tsx"
import { Checkbox } from "../../components/Checkbox.tsx"
import { Select } from "../../components/Select.tsx"
import { capitalize } from "../../format.ts"
import type { ScenarioItem } from "../../types.ts"
import { DraftRow } from "./DraftRow.tsx"
import { passingDrafts, revisionLabel } from "./draftHelpers.ts"
import type { DraftGroup, DraftItem } from "./draftTypes.ts"

type DraftGroupCardProps = {
  group: DraftGroup
  scenarios: ScenarioItem[]
  /** Environments that carry the draft mark. Run batch offers only these. */
  environments: string[]
  defaultEnvironment?: string
  isRunning: boolean
  onRunBatch: (ids: string[], environment: string, pauseOnFailure: boolean) => void
  onOpenEnvironments: () => void
  onKeep: (draft: DraftItem) => void
  onKeepAllPassing: () => void
  onMarkBug: (draft: DraftItem) => void
  onEdit: (draft: DraftItem) => void
  onDiscard: (draft: DraftItem) => void
  onDiscardGroup: () => void
}

/** The drafts one prompt produced, with Run batch on a draft-allowed environment and Keep all passing. */
export function DraftGroupCard({
  group,
  scenarios,
  environments,
  defaultEnvironment,
  isRunning,
  onRunBatch,
  onOpenEnvironments,
  onKeep,
  onKeepAllPassing,
  onMarkBug,
  onEdit,
  onDiscard,
  onDiscardGroup,
}: DraftGroupCardProps) {
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [pauseOnFailure, setPauseOnFailure] = useState(false)
  const environment = chosen && environments.includes(chosen) ? chosen : defaultEnvironment
  const passing = passingDrafts(group).length
  const count = group.drafts.length
  const meta = [
    group.agent ? `Saved by ${group.agent}` : undefined,
    `${count} draft${count === 1 ? "" : "s"}`,
    `${passing} passed`,
  ].filter(Boolean)

  return (
    <section aria-label={group.prompt} className="bg-sidebar border border-border rounded-xs shadow-xs">
      <div className="flex items-start justify-between gap-4 px-3 py-2.5 border-b border-border bg-titlebar">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-xs font-bold text-fg-bright">{group.prompt}</h3>
          <span className="text-xs text-fg-muted">{meta.join(" · ")}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="xs"
            variant="secondary"
            onClick={onKeepAllPassing}
            disabled={passing === 0 || isRunning}
            icon={<CheckCheck className="w-3 h-3" />}
          >
            Keep All Passing
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={onDiscardGroup}
            className="text-error hover:text-error hover:bg-error-bg"
            icon={<Trash2 className="w-3 h-3" />}
          >
            Discard Group
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border">
        {environment ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-40">
                <Select
                  size="xs"
                  value={environment}
                  onChange={setChosen}
                  options={environments.map((name) => ({ value: name, label: capitalize(name) }))}
                />
              </div>
              <Checkbox checked={pauseOnFailure} onCheckedChange={setPauseOnFailure} label="Pause on Failure" />
            </div>
            <Button
              size="xs"
              variant="primary"
              onClick={() =>
                onRunBatch(
                  group.drafts.map((draft) => draft.id),
                  environment,
                  pauseOnFailure,
                )
              }
              disabled={isRunning || count === 0}
              icon={<Play className="w-3 h-3" />}
            >
              Run Batch
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-warning">No environment allows draft runs yet</span>
              <span className="text-xs text-fg-muted">
                Drafts run only on an environment with Allow Draft Runs turned on. Turn it on in Config, under
                Environments.
              </span>
            </div>
            <Button size="xs" variant="secondary" onClick={onOpenEnvironments} icon={<Settings2 className="w-3 h-3" />}>
              Open Environments
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col">
        {group.drafts.map((draft) => (
          <DraftRow
            key={draft.id}
            draft={draft}
            revisionLabel={revisionLabel(draft, scenarios)}
            isRunning={isRunning}
            onKeep={() => onKeep(draft)}
            onMarkBug={() => onMarkBug(draft)}
            onEdit={() => onEdit(draft)}
            onDiscard={() => onDiscard(draft)}
          />
        ))}
      </div>
    </section>
  )
}
