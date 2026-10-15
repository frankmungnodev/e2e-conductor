import { Check, Copy, Inbox } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { Button } from "../../components/Button.tsx"
import { EmptyState } from "../../components/EmptyState.tsx"
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
    <section aria-label="No Drafts" className="flex-1 flex flex-col items-center justify-center py-8">
      <EmptyState
        size="lg"
        icon={<Inbox className="w-7 h-7" />}
        title="No Drafts"
        description="A coding agent can write scenarios for this project. They land here for you to run, check and keep."
        action={
          <div className="w-120 max-w-full flex flex-col gap-3 text-left">
            <ol className="flex flex-col bg-sidebar border border-border rounded-xs divide-y divide-border">
              <Step number={1} title="Add the agent kit to your project">
                <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-editor border border-border rounded-xs">
                  <code className="flex-1 font-mono text-xs text-fg">{KIT_COMMAND}</code>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void copy()}
                    aria-label="Copy command"
                    icon={copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  />
                </div>
              </Step>
              <Step number={2} title="Ask your agent for scenarios">
                <p className="text-xs text-fg-muted">For example: "Write e2e tests for the checkout flow".</p>
              </Step>
              <Step number={3} title="Review them here">
                <p className="text-xs text-fg-muted">
                  The agent checks and saves them with <code className="font-mono text-fg">e2e-conductor save</code>.
                  They show up here, grouped by your request.
                </p>
              </Step>
            </ol>
            {!hasDraftEnvironment && <NoDraftEnvironment onOpenEnvironments={onOpenEnvironments} />}
          </div>
        }
      />
    </section>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-input border border-border-light text-xs font-mono text-fg-muted">
        {number}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-fg-bright">{title}</span>
        {children}
      </div>
    </li>
  )
}
