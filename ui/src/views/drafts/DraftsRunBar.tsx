import { Play, Settings2 } from "lucide-react"
import { Button } from "../../components/Button.tsx"
import { Checkbox } from "../../components/Checkbox.tsx"
import { Select } from "../../components/Select.tsx"
import { capitalize } from "../../format.ts"

type DraftsRunBarProps = {
  /** Environments that carry the draft mark. Empty when none does. */
  environments: string[]
  environment?: string
  onEnvironmentChange: (environment: string) => void
  pauseOnFailure: boolean
  onPauseOnFailureChange: (pause: boolean) => void
  isRunning: boolean
  draftCount: number
  onRunAll: () => void
  onOpenEnvironments: () => void
}

/** The one place to pick where drafts run and to run all of them. */
export function DraftsRunBar({
  environments,
  environment,
  onEnvironmentChange,
  pauseOnFailure,
  onPauseOnFailureChange,
  isRunning,
  draftCount,
  onRunAll,
  onOpenEnvironments,
}: DraftsRunBarProps) {
  if (!environment) return <NoDraftEnvironment onOpenEnvironments={onOpenEnvironments} />
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-sidebar border border-border rounded-xs">
      <div className="flex items-center gap-3">
        <div className="w-40">
          <Select
            size="xs"
            value={environment}
            onChange={onEnvironmentChange}
            options={environments.map((name) => ({ value: name, label: capitalize(name) }))}
          />
        </div>
        <Checkbox checked={pauseOnFailure} onCheckedChange={onPauseOnFailureChange} label="Pause on Failure" />
      </div>
      <Button
        size="xs"
        variant="primary"
        onClick={onRunAll}
        disabled={isRunning || draftCount === 0}
        icon={<Play className="w-3 h-3" />}
      >
        Run All {draftCount}
      </Button>
    </div>
  )
}

/** Drafts run only on an environment with the draft mark; this says so once and links to the setting. */
export function NoDraftEnvironment({ onOpenEnvironments }: { onOpenEnvironments: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-warning-bg border border-warning-border rounded-xs">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-warning">No environment allows draft runs yet</span>
        <span className="text-xs text-fg-muted">Turn on Allow Draft Runs for an environment to run drafts on it.</span>
      </div>
      <Button size="xs" variant="secondary" onClick={onOpenEnvironments} icon={<Settings2 className="w-3 h-3" />}>
        Open Environments
      </Button>
    </div>
  )
}
