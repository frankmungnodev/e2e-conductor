import { Check, Copy, Inbox } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/Button.tsx"
import { NoDraftEnvironment } from "./DraftsRunBar.tsx"

const KIT_COMMAND = "npx e2e-conductor kit"

type DraftsEmptyCardProps = {
  /** Shows the no-environment warning when no environment carries the draft mark. */
  hasDraftEnvironment: boolean
  onOpenEnvironments: () => void
}

/** What the Drafts tab shows before any agent saved a draft: three steps to the first one. */
export function DraftsEmptyCard({ hasDraftEnvironment, onOpenEnvironments }: DraftsEmptyCardProps) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(KIT_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied; the command is still on screen to copy by hand.
    }
  }

  return (
    <section aria-label="No Drafts" className="flex flex-col gap-3 max-w-xl p-4 bg-sidebar border border-border rounded-xs">
      <div className="flex items-center gap-2">
        <Inbox className="w-4 h-4 text-fg-muted" />
        <h3 className="text-xs font-bold text-fg-bright">No Drafts</h3>
      </div>
      <p className="text-xs text-fg-muted">
        A coding agent can write scenarios for this project. They land here for you to run, check and keep.
      </p>
      <ol className="flex flex-col gap-2 text-xs text-fg list-decimal pl-4">
        <li>
          <div className="flex items-center gap-2">
            <span>In your project, run</span>
            <code className="px-1.5 py-0.5 font-mono bg-editor border border-border rounded-xs">{KIT_COMMAND}</code>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void copy()}
              aria-label="Copy command"
              icon={copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            />
          </div>
        </li>
        <li>Ask your coding agent to write e2e scenarios, for example "Write e2e tests for the checkout flow".</li>
        <li>
          The agent checks and saves them with{" "}
          <code className="px-1.5 py-0.5 font-mono bg-editor border border-border rounded-xs">e2e-conductor save</code>.
          They show up here, grouped by your request.
        </li>
      </ol>
      {!hasDraftEnvironment && <NoDraftEnvironment onOpenEnvironments={onOpenEnvironments} />}
    </section>
  )
}
