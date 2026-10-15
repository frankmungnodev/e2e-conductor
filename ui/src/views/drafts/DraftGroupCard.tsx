import { CheckCheck, Play, Trash2 } from "lucide-react"
import { Button } from "../../components/Button.tsx"
import { Menu } from "../../components/Menu.tsx"
import type { ScenarioItem } from "../../types.ts"
import { DraftRow } from "./DraftRow.tsx"
import { passingDrafts, promptLine, revisionLabel } from "./draftHelpers.ts"
import type { DraftGroup, DraftItem } from "./draftTypes.ts"

type DraftGroupCardProps = {
  group: DraftGroup
  scenarios: ScenarioItem[]
  /** False when no environment carries the draft mark, so Run is disabled. */
  canRun: boolean
  isRunning: boolean
  onRun: (ids: string[]) => void
  onKeep: (draft: DraftItem) => void
  onKeepAllPassing: () => void
  onMarkBug: (draft: DraftItem) => void
  onEdit: (draft: DraftItem) => void
  onDiscard: (draft: DraftItem) => void
  onDiscardGroup: () => void
}

/** The drafts one prompt produced, one line each, with Run and Keep all passing for the group. */
export function DraftGroupCard({
  group,
  scenarios,
  canRun,
  isRunning,
  onRun,
  onKeep,
  onKeepAllPassing,
  onMarkBug,
  onEdit,
  onDiscard,
  onDiscardGroup,
}: DraftGroupCardProps) {
  const passing = passingDrafts(group).length
  const count = group.drafts.length
  const prompt = promptLine(group.prompt)
  const meta = [group.agent, `${count} draft${count === 1 ? "" : "s"}`, `${passing} passed`].filter(Boolean)

  return (
    <section aria-label={group.prompt} className="bg-sidebar border border-border rounded-xs shadow-xs">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-titlebar">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 title={group.prompt} className="text-xs font-semibold text-fg-bright truncate">
            {prompt}
          </h3>
          <span className="text-xs text-fg-muted shrink-0">{meta.join(" · ")}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {passing > 0 && (
            <Button
              size="xs"
              variant="secondary"
              onClick={onKeepAllPassing}
              disabled={isRunning}
              icon={<CheckCheck className="w-3 h-3" />}
            >
              Keep {passing} Passing
            </Button>
          )}
          <Button
            size="xs"
            variant="secondary"
            onClick={() => onRun(group.drafts.map((draft) => draft.id))}
            disabled={!canRun || isRunning || count === 0}
            icon={<Play className="w-3 h-3" />}
          >
            Run
          </Button>
          <Menu
            label={`More actions for ${prompt}`}
            items={[{ label: "Discard Group", icon: <Trash2 className="w-3 h-3" />, onSelect: onDiscardGroup, danger: true }]}
          />
        </div>
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
