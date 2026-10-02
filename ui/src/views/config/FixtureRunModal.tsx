import { Terminal } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { Badge } from "../../components/Badge.tsx"
import { Button } from "../../components/Button.tsx"
import { Modal } from "../../components/Modal.tsx"
import type { FixtureRunState } from "./useFixtures.tsx"

export interface FixtureRunModalProps {
  fixtureRunState: FixtureRunState
  setFixtureRunState: Dispatch<SetStateAction<FixtureRunState>>
}

/** Output and exit status of a fixture test run. */
export function FixtureRunModal({ fixtureRunState, setFixtureRunState }: FixtureRunModalProps) {
  return (
    <Modal
      isOpen={fixtureRunState.isOpen}
      onClose={() => setFixtureRunState((prev) => ({ ...prev, isOpen: false }))}
      title={
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-warning" />
          <span>Fixture Test: {fixtureRunState.name}</span>
        </div>
      }
      description={`$ ${fixtureRunState.cmd}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {fixtureRunState.isRunning ? (
              <Badge variant="warning" size="xs">Running</Badge>
            ) : fixtureRunState.exitCode === 0 ? (
              <Badge variant="success" size="xs">Passed</Badge>
            ) : (
              <Badge variant="danger" size="xs">Failed</Badge>
            )}
            {typeof fixtureRunState.durationMs === "number" && (
              <span className="text-xs font-mono text-fg-muted">{fixtureRunState.durationMs}ms</span>
            )}
          </div>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setFixtureRunState((prev) => ({ ...prev, isOpen: false }))}
          >
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <div className="bg-editor p-3 rounded-xs border border-border font-mono text-xs overflow-x-auto max-h-80 whitespace-pre-wrap text-fg">
          {fixtureRunState.isRunning ? (
            <div className="flex items-center gap-2 text-fg-muted">
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span>Executing shell command...</span>
            </div>
          ) : (
            fixtureRunState.output || "(no output returned)"
          )}
        </div>
      </div>
    </Modal>
  )
}
