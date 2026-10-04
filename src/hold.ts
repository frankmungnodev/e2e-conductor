import type { FailureLabel } from "./assertions.ts"
import type { Step } from "./scenario.ts"

/** A step that failed after its final attempt, held open while the user fixes it. */
export type PausedStep = {
  scenarioId: string
  iteration: number
  index: number
  step: Step
  error: string
  label: FailureLabel
  /** The last manual retry passed, so the scenario may continue. */
  retryPassed: boolean
}

export type HoldDecision = { kind: "retry"; step: Step } | { kind: "continue" } | { kind: "end" }

/** Called by the scenario loop on a pausable failure; resolves with what the user chose. */
export type PauseHook = (paused: PausedStep) => Promise<HoldDecision>

/** Why a hold action was refused. */
export class HoldError extends Error {}

/**
 * Holds at most one paused step for a run and hands the user's choice back to the
 * scenario loop. A cancel rejects the pending wait, so Stop needs no route of its own.
 */
export class HoldController {
  private pending?: { paused: PausedStep; resolve: (decision: HoldDecision) => void }

  constructor(private readonly signal?: AbortSignal) {}

  /** The paused step, or undefined when the run is not paused. */
  get paused(): PausedStep | undefined {
    return this.pending?.paused
  }

  readonly hook: PauseHook = (paused) =>
    new Promise((resolve, reject) => {
      if (this.signal?.aborted) return reject(new Error("Execution cancelled"))
      const onAbort = () => {
        this.pending = undefined
        reject(new Error("Execution cancelled"))
      }
      this.signal?.addEventListener("abort", onAbort, { once: true })
      this.pending = {
        paused,
        resolve: (decision) => {
          this.signal?.removeEventListener("abort", onAbort)
          this.pending = undefined
          resolve(decision)
        },
      }
    })

  retry(step: Step) {
    this.take().resolve({ kind: "retry", step })
  }

  continue() {
    const pending = this.take()
    if (!pending.paused.retryPassed) throw new HoldError("Retry the step until it passes before continuing")
    pending.resolve({ kind: "continue" })
  }

  endScenario() {
    this.take().resolve({ kind: "end" })
  }

  private take() {
    if (!this.pending) throw new HoldError("The run is not paused")
    return this.pending
  }
}
