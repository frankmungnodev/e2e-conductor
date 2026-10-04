import { useEffect, useMemo, useRef, useState } from "react"
import { continuePausedRun, endPausedScenario, fetchPausedStep, retryPausedStep } from "../../api.ts"
import { useToast } from "../../components/Toast.tsx"
import type { PausedStep, RunEvent, ScenarioItem, ScenarioStep } from "../../types.ts"
import { pausedFrom } from "./pauseState.ts"

/** The step the run is paused on, and the actions that answer the pause. */
export function usePause(events: RunEvent[], scenarios: ScenarioItem[], isRunning: boolean) {
  const { error: toastError, success: toastSuccess } = useToast()
  // What the server reported on load, so a reloaded page still shows the pause.
  const [initial, setInitial] = useState<PausedStep | null>(null)
  const [busy, setBusy] = useState(false)
  // A retry was accepted and is running; cleared when its result arrives.
  const [retrying, setRetrying] = useState(false)
  const seen = useRef(events.length)

  useEffect(() => {
    if (!isRunning) {
      setInitial(null)
      return
    }
    fetchPausedStep()
      .then(setInitial)
      .catch(() => {})
  }, [isRunning])

  useEffect(() => {
    for (const ev of events.slice(seen.current)) {
      if (ev.type === "hold_retry" || ev.type === "hold_end") setRetrying(false)
      if (ev.type === "hold_retry" && ev.passed) {
        const name = scenarios.find((s) => s.id === ev.scenarioId)?.name ?? ev.scenarioId
        toastSuccess(`The fixed step was saved to "${name}"`, "Retry Passed")
      }
    }
    seen.current = events.length
  }, [events, scenarios, toastSuccess])

  const paused = useMemo(() => (isRunning ? pausedFrom(events, initial) : null), [events, initial, isRunning])

  const act = async (action: () => Promise<void>, failTitle: string) => {
    setBusy(true)
    try {
      await action()
      return true
    } catch (e) {
      toastError((e as Error).message, failTitle)
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    paused,
    busy,
    retrying,
    retry: async (step: ScenarioStep) => {
      const ok = await act(() => retryPausedStep(step), "Retry Refused")
      if (ok) setRetrying(true)
      return ok
    },
    continueRun: () => act(continuePausedRun, "Could Not Continue"),
    endScenario: () => act(endPausedScenario, "Could Not End Scenario"),
  }
}

export type Pause = ReturnType<typeof usePause>
