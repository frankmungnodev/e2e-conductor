import { Bug, Check, PencilLine, Trash2 } from "lucide-react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { canMarkBugFound, passBadge, stateBadge } from "./draftHelpers.ts"
import type { DraftItem, Readback } from "./draftTypes.ts"

type DraftRowProps = {
  draft: DraftItem
  /** "Revision of <kept name>" when the draft revises a kept scenario. */
  revisionLabel?: string
  isRunning: boolean
  onKeep: () => void
  onMarkBug: () => void
  onEdit: () => void
  onDiscard: () => void
}

/** One draft: its state, whether its current content passed, its actions, and its readback. */
export function DraftRow({ draft, revisionLabel, isRunning, onKeep, onMarkBug, onEdit, onDiscard }: DraftRowProps) {
  const state = stateBadge(draft.state)
  const pass = passBadge(draft)
  return (
    <article aria-label={draft.name} className="flex flex-col gap-2 px-3 py-2.5 border-t border-border first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-fg-bright truncate">{draft.name}</span>
            <Badge variant={state.variant} size="xs">
              {state.label}
            </Badge>
            <Badge variant={pass.variant} size="xs">
              {pass.label}
            </Badge>
          </div>
          {revisionLabel && <span className="text-xs text-fg-muted">{revisionLabel}</span>}
          {draft.description && <span className="text-xs text-fg-muted">{draft.description}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {draft.passed && (
            <Button size="xs" variant="primary" onClick={onKeep} disabled={isRunning} icon={<Check className="w-3 h-3" />}>
              Keep
            </Button>
          )}
          {canMarkBugFound(draft) && (
            <Button size="xs" variant="secondary" onClick={onMarkBug} icon={<Bug className="w-3 h-3" />}>
              Mark Bug Found
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={onEdit} icon={<PencilLine className="w-3 h-3" />}>
            Edit in Builder
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={onDiscard}
            className="text-error hover:text-error hover:bg-error-bg"
            icon={<Trash2 className="w-3 h-3" />}
          >
            Discard
          </Button>
        </div>
      </div>
      <ReadbackView readback={draft.readback} />
    </article>
  )
}

/** The draft's steps as plain sentences, then what it uses, with shell commands and full URLs verbatim. */
function ReadbackView({ readback }: { readback: Readback }) {
  return (
    <div className="flex flex-col gap-2 pl-3 border-l border-border-light">
      {readback.notes.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {readback.notes.map((note) => (
            <li key={note} className="text-xs text-fg-muted">
              {note}
            </li>
          ))}
        </ul>
      )}
      <ol className="flex flex-col gap-1.5">
        {readback.steps.map((step, index) => (
          <li key={`${index}:${step.name}`} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-fg-subtle">{index + 1}.</span>
              <span className="text-xs font-medium text-fg">{step.name}</span>
              <span className="text-xs font-mono text-fg-muted">{step.target}</span>
            </div>
            <ul className="flex flex-col gap-0.5 pl-5">
              {step.sentences.map((sentence, sentenceIndex) => (
                <li key={`${sentenceIndex}:${sentence}`} className="text-xs text-fg-muted">
                  {sentence}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <ReadbackList label="Targets" values={readback.targets} />
      <ReadbackList label="Fixtures" values={readback.fixtures} />
      <ReadbackList label="Shell Commands" values={readback.commands} verbatim />
      <ReadbackList label="Full URLs" values={readback.urls} verbatim />
    </div>
  )
}

function ReadbackList({ label, values, verbatim = false }: { label: string; values: string[]; verbatim?: boolean }) {
  if (values.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {verbatim ? (
        values.map((value) => (
          <code key={value} className="text-xs font-mono text-warning break-all">
            {value}
          </code>
        ))
      ) : (
        <span className="text-xs font-mono text-fg">{values.join(", ")}</span>
      )}
    </div>
  )
}
