import { Bug, Check, ChevronRight, PencilLine, Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { Menu } from "../../components/Menu.tsx"
import { canMarkBugFound, failureText, rowStatus, stepCountLabel } from "./draftHelpers.ts"
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

/** One draft on one line: its status, what it uses and why it failed. Click the line to read its steps. */
export function DraftRow({ draft, revisionLabel, isRunning, onKeep, onMarkBug, onEdit, onDiscard }: DraftRowProps) {
  const [expanded, setExpanded] = useState(false)
  const status = rowStatus(draft)
  const failure = failureText(draft)
  return (
    <article aria-label={draft.name} className="flex flex-col border-t border-border first:border-t-0">
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-hover/40">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus rounded-xs"
        >
          <ChevronRight className={`w-3 h-3 shrink-0 text-fg-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
          <span className="text-xs font-semibold text-fg-bright truncate">{draft.name}</span>
          <Badge variant={status.variant} size="xs" dot>
            {status.label}
          </Badge>
          {draft.readback.targets.map((target) => (
            <span key={target} className="text-xs font-mono text-fg-muted px-1 border border-border rounded-xs">
              {target}
            </span>
          ))}
          <span className="text-xs text-fg-subtle shrink-0">{stepCountLabel(draft.readback)}</span>
          {revisionLabel && <span className="text-xs text-fg-muted truncate">{revisionLabel}</span>}
        </button>
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
          <Menu
            label={`More actions for ${draft.name}`}
            items={[
              { label: "Edit in Builder", icon: <PencilLine className="w-3 h-3" />, onSelect: onEdit },
              { label: "Discard", icon: <Trash2 className="w-3 h-3" />, onSelect: onDiscard, danger: true },
            ]}
          />
        </div>
      </div>
      {failure && <p className="px-3 pb-1.5 pl-8 text-xs text-error wrap-break-word">Last run: {failure}</p>}
      {expanded && <ReadbackView description={draft.description} readback={draft.readback} />}
    </article>
  )
}

/** The draft's steps as plain sentences, then what it uses, with shell commands and full URLs verbatim. */
function ReadbackView({ description, readback }: { description?: string; readback: Readback }) {
  return (
    <div className="flex flex-col gap-2 ml-8 mr-3 mb-2.5 pl-3 border-l border-border-light">
      {description && <p className="text-xs text-fg-muted">{description}</p>}
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
