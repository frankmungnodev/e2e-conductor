import type { ServerResponse } from "node:http"
import type { LoadedConfig } from "../config.ts"
import type { HoldController } from "../hold.ts"
import type { RunEvent, RunOptions, Summary } from "../runner.ts"

export type ActiveRun = {
  runId: string
  options: RunOptions
  startedAt: number
  controller: AbortController
  /** Set when the run was started with pause on failure. */
  hold?: HoldController
}

/**
 * Mutable state for one server instance, shared by reference with every route module.
 * Read and assign its properties directly; never copy them into locals, because
 * config reloads and the background run task replace them while requests are in flight.
 */
export type ServerState = {
  config: LoadedConfig
  sseClients: Set<ServerResponse>
  activeRun: ActiveRun | null
  lastSummary: Summary | null
  /** The last run that was not a draft run: what the header's last-run status reports. */
  lastSuiteSummary: Summary | null
  lastEvent: RunEvent | null
  broadcast: (event: RunEvent) => void
}

export function createServerState(config: LoadedConfig): ServerState {
  const state: ServerState = {
    config,
    sseClients: new Set<ServerResponse>(),
    activeRun: null,
    lastSummary: null,
    lastSuiteSummary: null,
    lastEvent: null,
    broadcast: (event: RunEvent) => {
      state.lastEvent = event
      const payload = `data: ${JSON.stringify(event)}\n\n`
      for (const client of state.sseClients) {
        try {
          client.write(payload)
        } catch {
          state.sseClients.delete(client)
        }
      }
    },
  }
  return state
}
