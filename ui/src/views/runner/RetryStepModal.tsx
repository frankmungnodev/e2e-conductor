import { RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../../components/Button.tsx"
import { Textarea } from "../../components/FormControls.tsx"
import { Modal } from "../../components/Modal.tsx"
import type { ScenarioStep } from "../../types.ts"
import { parseStepJson } from "./pauseState.ts"

export interface RetryStepModalProps {
  isOpen: boolean
  step: ScenarioStep
  busy: boolean
  onClose: () => void
  onRetry: (step: ScenarioStep) => void
}

/** Edit the paused step as JSON, then run it once on the live run. */
export function RetryStepModal({ isOpen, step, busy, onClose, onRetry }: RetryStepModalProps) {
  const [text, setText] = useState("")
  useEffect(() => {
    if (isOpen) setText(JSON.stringify(step, null, 2))
  }, [isOpen, step])
  const parsed = parseStepJson(text)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Retry Step"
      description="Fix the step, then run it once where it failed. A passing retry is saved to the scenario."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button size="xs" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="xs"
            variant="primary"
            icon={<RotateCcw className="w-3 h-3" />}
            disabled={busy || !parsed.step}
            onClick={() => parsed.step && onRetry(parsed.step)}
          >
            Retry Step
          </Button>
        </div>
      }
    >
      <Textarea
        label="Step"
        aria-label="Step JSON"
        mono
        rows={16}
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={parsed.error}
        spellCheck={false}
      />
    </Modal>
  )
}
