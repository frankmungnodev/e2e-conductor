import type { DatabaseSync } from "node:sqlite"
import { type LoadedConfig, SHELL_TARGET, type TargetConfig } from "./config.ts"
import { PLACEHOLDER } from "./context.ts"
import { getPlatformsForEnv } from "./db/env-platforms.ts"
import { getDefaultEnvironment, getEnvironments } from "./db/environments.ts"
import { getPlatforms, platformsToTargetsAndServices } from "./db/platforms.ts"
import type { Scenario, Step } from "./db/scenarios.ts"
import { type Problem, problem } from "./problems.ts"
import { checkSteps } from "./scenario.ts"
import { findAction } from "./vocabulary.ts"

/** An environment the strict check holds a scenario to: the targets it runs and its configured env variable names. */
export type CheckedEnvironment = {
  name: string
  targets: Record<string, TargetConfig>
  envVars: string[]
}

/** The name used when the project has no environments and targets come from every platform, as in `loadConfig`. */
const NO_ENVIRONMENT = "(no environment)"

/**
 * The environments a strict check uses: every environment in `names`, or, with none, the default
 * environment and a `no-draft-environment` notice. `E2E_ENV` and the active environment play no part.
 */
export function environmentsToCheck(db: DatabaseSync, names: string[]): { environments: CheckedEnvironment[]; notices: Problem[] } {
  const configured = getEnvironments(db)
  const read = (name: string): CheckedEnvironment => ({
    name,
    targets: platformsToTargetsAndServices(getPlatformsForEnv(db, name)).targets,
    envVars: Object.keys(configured[name]?.env ?? {}),
  })
  if (names.length > 0) return { environments: names.map(read), notices: [] }
  const fallback = getDefaultEnvironment(db)
  const environment = fallback
    ? read(fallback)
    : { name: NO_ENVIRONMENT, targets: platformsToTargetsAndServices(getPlatforms(db)).targets, envVars: [] }
  const notice = problem("no-draft-environment", {
    pointer: "",
    message: `no environment allows drafts, so targets were checked against "${environment.name}"`,
    value: environment.name,
  })
  return { environments: [environment], notices: [notice] }
}

/**
 * The strict check `e2e save` runs: the base `checkSteps` with targets from `environments`, then
 * - `unknown-target` for a target one of the environments lacks,
 * - `ctx-not-produced` / `ctx-produced-later` for a `${ctx.*}` that no `vars` entry or earlier `extract` sets,
 * - `unknown-env-var` for a `${env.*}` name an environment does not configure (process env names do not count),
 * - `raw-url` for an absolute `http(s)://` URL where a step or action takes one.
 * Kept scenarios are held only to the base check, since process env names and absolute URLs are legal there.
 */
export function checkStrict(config: LoadedConfig, scenario: Scenario, environments: CheckedEnvironment[]): Problem[] {
  const allTargets: Record<string, TargetConfig> = Object.assign({}, ...environments.map((environment) => environment.targets))
  const problems = checkSteps({ ...config, targets: allTargets }, scenario)
  const vars = Object.keys(scenario.vars ?? {})
  const extractedAt = new Map<string, number>()
  scenario.steps.forEach((step, index) => {
    for (const name of Object.keys(step.extract ?? {})) if (!extractedAt.has(name)) extractedAt.set(name, index)
  })

  scenario.steps.forEach((step, stepIndex) => {
    const at = { stepIndex, stepName: step.name }
    if (allTargets[step.target]) {
      for (const environment of environments) {
        if (environment.targets[step.target]) continue
        const allowed = [...Object.keys(environment.targets), SHELL_TARGET]
        problems.push(
          problem("unknown-target", {
            ...at,
            pointer: `/steps/${stepIndex}/target`,
            message: `target "${step.target}" is not in environment "${environment.name}" (it has: ${allowed.join(", ")})`,
            value: step.target,
            allowed,
          }),
        )
      }
    }

    for (const { pointer, text } of strings(step, `/steps/${stepIndex}`)) {
      for (const [placeholder, root, path] of text.matchAll(PLACEHOLDER)) {
        const name = path.split(/[.[]/)[0]
        if (root === "ctx") problems.push(...checkCtx(name, placeholder, stepIndex, { ...at, pointer }))
        if (root === "env") {
          for (const environment of environments) {
            if (environment.envVars.includes(name)) continue
            problems.push(
              problem("unknown-env-var", {
                ...at,
                pointer,
                message: `${placeholder} is not an env variable of environment "${environment.name}"`,
                value: name,
                allowed: environment.envVars,
              }),
            )
          }
        }
      }
    }

    for (const { pointer, url } of urls(allTargets, step, stepIndex)) {
      problems.push(
        problem("raw-url", { ...at, pointer, message: `"${url}" is a full URL; use a path such as "/login"`, value: url }),
      )
    }
  })
  return problems

  function checkCtx(name: string, placeholder: string, stepIndex: number, at: Omit<Problem, "code" | "hint" | "message">): Problem[] {
    const producedBy = extractedAt.get(name)
    if (vars.includes(name) || (producedBy !== undefined && producedBy < stepIndex)) return []
    if (producedBy !== undefined) {
      const by = scenario.steps[producedBy]
      return [
        problem("ctx-produced-later", {
          ...at,
          message: `${placeholder} is extracted by steps[${producedBy}] "${by.name}", which runs after this use`,
          value: name,
        }),
      ]
    }
    const allowed = [...vars, ...[...extractedAt].filter(([, index]) => index < stepIndex).map(([extracted]) => extracted)]
    return [problem("ctx-not-produced", { ...at, message: `${placeholder} is set by no "vars" entry or earlier "extract"`, value: name, allowed })]
  }
}

/** Every string in a step, keys included, as the runner substitutes them, with its JSON pointer. */
function strings(value: unknown, pointer: string): { pointer: string; text: string }[] {
  if (typeof value === "string") return [{ pointer, text: value }]
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, item]) => {
    const at = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`
    return [...(Array.isArray(value) ? [] : [{ pointer: at, text: key }]), ...strings(item, at)]
  })
}

/** Absolute URLs in the fields a step or its actions read a URL from: `url`, and `value` for an action that reads a URL. */
function urls(targets: Record<string, TargetConfig>, step: Step, stepIndex: number): { pointer: string; url: string }[] {
  const driver = step.target === SHELL_TARGET ? SHELL_TARGET : targets[step.target]?.driver
  const found: { pointer: string; url: string }[] = []
  const look = (item: { action?: string; url?: string; value?: string }, pointer: string) => {
    if (isAbsolute(item.url)) found.push({ pointer: `${pointer}/url`, url: item.url })
    const readsUrl = driver && typeof item.action === "string" && findAction(driver, item.action)?.fields.includes("url")
    if (readsUrl && isAbsolute(item.value)) found.push({ pointer: `${pointer}/value`, url: item.value })
  }
  look(step, `/steps/${stepIndex}`)
  ;(Array.isArray(step.actions) ? step.actions : []).forEach((item, index) => {
    look(item ?? {}, `/steps/${stepIndex}/actions/${index}`)
  })
  return found
}

function isAbsolute(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}
