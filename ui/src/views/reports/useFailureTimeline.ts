import { useEffect, useState } from "react"
import { fetchFailureTimeline } from "../../api.ts"
import type { FailureTimeline } from "../../types.ts"

type State = { timeline?: FailureTimeline; error?: string }

/** A scenario-iteration's failure timeline, reloaded when the scenario-iteration changes. */
export function useFailureTimeline(runId: string, scenarioId: string, iteration: number): State {
  const [state, setState] = useState<State>({})
  useEffect(() => {
    setState({})
    let current = true
    fetchFailureTimeline(runId, scenarioId, iteration)
      .then((timeline) => current && setState({ timeline }))
      .catch((error: Error) => current && setState({ error: error.message }))
    return () => {
      current = false
    }
  }, [runId, scenarioId, iteration])
  return state
}
