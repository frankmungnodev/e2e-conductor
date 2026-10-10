import { useEffect, useState } from "react"
import { fetchStepHistory } from "../../api.ts"
import type { StepHistory } from "../../types.ts"

/** The scenario's step history keyed by step id, reloaded when the scenario changes. Empty until loaded or on error. */
export function useStepHistory(scenarioId: string | undefined): Record<string, StepHistory> {
  const [history, setHistory] = useState<Record<string, StepHistory>>({})
  useEffect(() => {
    setHistory({})
    if (!scenarioId) return
    let current = true
    fetchStepHistory(scenarioId)
      .then((loaded) => current && setHistory(loaded))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [scenarioId])
  return history
}
