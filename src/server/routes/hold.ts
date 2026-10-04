import { type HoldController, HoldError } from "../../hold.ts"
import { checkSteps, type Step } from "../../scenario.ts"
import { describeErrors, validateScenario } from "../../schema.ts"
import { readBody, sendJson } from "../http.ts"
import type { Route, RouteContext } from "../route.ts"
import type { ServerState } from "../state.ts"

/** Runs one hold action, answering 409 when the run is not paused or the action is refused. */
function act(ctx: RouteContext, action: (hold: HoldController) => void) {
  const hold = ctx.state.activeRun?.hold
  if (!hold?.paused) return sendJson(ctx.res, 409, { error: "The run is not paused" })
  try {
    action(hold)
  } catch (error) {
    if (error instanceof HoldError) return sendJson(ctx.res, 409, { error: error.message })
    throw error
  }
  return sendJson(ctx.res, 200, { ok: true })
}

/** Problems that would stop a step from running, found before it is retried. */
function stepProblems(state: ServerState, step: Step): string[] {
  const scenario = { id: "retry", name: "retry", steps: [step] }
  const problems = validateScenario(scenario) ? [] : describeErrors(validateScenario.errors)
  return [...problems, ...checkSteps(state.config, scenario, new Set())]
}

export const holdRoutes: Route[] = [
  // POST /api/run/hold/retry
  {
    match: ({ req, pathname }) => pathname === "/api/run/hold/retry" && req.method === "POST",
    handle: async (ctx) => {
      const body = (await readBody(ctx.req)) as { step?: Step }
      if (!body?.step) return sendJson(ctx.res, 400, { error: "Missing 'step' in payload" })
      const step = body.step
      const problems = stepProblems(ctx.state, step)
      if (problems.length > 0) return sendJson(ctx.res, 400, { error: "The step is not valid", errors: problems })
      const targets = ctx.state.activeRun?.hold?.paused?.targets
      if (targets && !targets.includes(step.target)) {
        return sendJson(ctx.res, 400, { error: `Target "${step.target}" was not prepared for this run`, errors: [`use one of: ${targets.join(", ")}`] })
      }
      return act(ctx, (hold) => hold.retry(step))
    },
  },
  // POST /api/run/hold/continue
  {
    match: ({ req, pathname }) => pathname === "/api/run/hold/continue" && req.method === "POST",
    handle: async (ctx) => act(ctx, (hold) => hold.continue()),
  },
  // POST /api/run/hold/end-scenario
  {
    match: ({ req, pathname }) => pathname === "/api/run/hold/end-scenario" && req.method === "POST",
    handle: async (ctx) => act(ctx, (hold) => hold.endScenario()),
  },
]
