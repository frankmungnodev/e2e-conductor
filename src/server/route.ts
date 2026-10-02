import type { IncomingMessage, ServerResponse } from "node:http"
import type { ServerState } from "./state.ts"

export type RouteContext = {
  state: ServerState
  req: IncomingMessage
  res: ServerResponse
  url: URL
  pathname: string
}

/**
 * One `/api/*` endpoint. `match` is the endpoint's request test and `handle` writes the response.
 * The server tries routes in order and runs the first match, like an `if` chain.
 */
export type Route = {
  match: (ctx: RouteContext) => boolean
  handle: (ctx: RouteContext) => Promise<unknown>
}
