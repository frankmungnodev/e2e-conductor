import { useEffect, useState } from "react"
import { fetchRunDetails, fetchRuns } from "../../api.ts"
import type { RunDetails, RunHistoryItem } from "../../types.ts"

/** Past runs, the selected one (newest by default), and its details. */
export function useRunHistory() {
  const [runs, setRuns] = useState<RunHistoryItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [details, setDetails] = useState<RunDetails | null>(null)

  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    void refreshTick
    void fetchRuns()
      .then((data) => {
        setRuns(data.runs)
        setSelectedRunId((current) => current ?? data.runs[0]?.runId ?? null)
      })
      .catch((error) => console.error(error))
      .finally(() => setLoaded(true))
  }, [refreshTick])

  // A switch of run clears the old run's details; a refresh of the same run keeps them on screen.
  const [shownRunId, setShownRunId] = useState<string | null>(null)
  useEffect(() => {
    void refreshTick
    if (!selectedRunId) return
    let cancelled = false
    if (selectedRunId !== shownRunId) setDetails(null)
    void fetchRunDetails(selectedRunId)
      .then((data) => {
        if (cancelled) return
        setDetails(data)
        setShownRunId(selectedRunId)
      })
      .catch((error) => console.error(error))
    return () => {
      cancelled = true
    }
  }, [selectedRunId, refreshTick])

  const selectedRun = runs.find((run) => run.runId === selectedRunId)
  const anyRunning = runs.some((run) => run.status === "RUNNING")
  // While a run is going, keep its progress and the list current.
  useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), 2000)
    return () => clearInterval(timer)
  }, [anyRunning])
  return { runs, loaded, selectedRun, selectRun: setSelectedRunId, details }
}
