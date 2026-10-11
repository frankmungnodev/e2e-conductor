import type { LoadedConfig } from "./config.ts"
import type { StepAction } from "./db/scenarios.ts"
import { type Assert, driverOf, type Scenario, type Step, targetsUsed } from "./scenario.ts"
import { ACTIONS, type DriverName, findAction, type JsonMatchOperator } from "./vocabulary.ts"

/**
 * A scenario's steps as plain sentences, for a person deciding whether to keep a draft. It names no
 * runtime internals: placeholders read as `{name}`, and vars and setup reuse as plain phrases. Shell
 * commands and absolute URLs are the only raw content, shown verbatim and listed again on their own.
 */
export type Readback = {
  steps: Array<{ name: string; target: string; sentences: string[] }>
  targets: string[]
  fixtures: string[]
  /** What the scenario starts from, in plain words. */
  notes: string[]
  /** Every shell command, verbatim. */
  commands: string[]
  /** Every absolute URL, verbatim. */
  urls: string[]
}

type ActionFields = Partial<StepAction>
type Sentence = (a: ActionFields) => string

/** `${ctx.x}`, `${env.X}` and `${run.x}` placeholders in words a person reads. */
function plain(text: string): string {
  return text.replace(/\$\{(\w+)\.([\w.-]+)\}/g, (whole, namespace: string, name: string) => {
    if (namespace === "ctx") return `{${name}}`
    if (namespace === "env") return `{${name} from the environment}`
    if (namespace === "run") return name === "iteration" ? "{iteration}" : `{run ${name}}`
    return whole
  })
}

const text = (value: unknown) => plain(typeof value === "string" ? value : JSON.stringify(value))
const quoted = (value: unknown) => `"${text(value ?? "")}"`
const selectorOf = (a: ActionFields) => quoted(a.selector ?? a.value)
const urlOf = (a: ActionFields) => text(a.url ?? a.value ?? "")
const keyOf = (a: ActionFields) => text(a.key ?? a.value ?? "")
const waitFor = (a: ActionFields) => (a.selector ? `Waits for ${quoted(a.selector)} to appear` : `Waits ${a.ms ?? 0} ms`)

const httpSentence =
  (method: string): Sentence =>
  (a) =>
    `Sends ${method} ${urlOf(a)}${a.body !== undefined ? " with a body" : ""}`

/** One sentence per vocabulary action, keyed by driver and the action's name (not its aliases). */
export const ACTION_SENTENCES: Record<DriverName, Record<string, Sentence>> = {
  web: {
    navigate: (a) => `Opens ${urlOf(a)}`,
    reload: () => "Reloads the page",
    go_back: () => "Goes back a page",
    go_forward: () => "Goes forward a page",
    click: (a) => `Clicks ${selectorOf(a)}`,
    dblclick: (a) => `Double-clicks ${selectorOf(a)}`,
    hover: (a) => `Hovers over ${selectorOf(a)}`,
    focus: (a) => `Focuses ${selectorOf(a)}`,
    clear: (a) => `Clears ${selectorOf(a)}`,
    fill: (a) => `Fills ${quoted(a.selector)} with ${quoted(a.value)}`,
    type: (a) => `Types ${quoted(a.value)} into ${quoted(a.selector)}`,
    press: (a) => `Presses ${keyOf(a)}${a.selector ? ` in ${quoted(a.selector)}` : ""}`,
    check: (a) => `Ticks ${selectorOf(a)}`,
    uncheck: (a) => `Unticks ${selectorOf(a)}`,
    select: (a) => `Selects ${quoted(a.value)} in ${quoted(a.selector)}`,
    drag_and_drop: (a) => `Drags ${quoted(a.selector)} onto ${quoted(a.target_selector ?? a.value)}`,
    upload_file: (a) => `Uploads ${quoted(a.value)} to ${quoted(a.selector)}`,
    scroll_into_view: (a) => `Scrolls to ${selectorOf(a)}`,
    wait_for: waitFor,
    wait_for_url: (a) => `Waits for the page address to match ${urlOf(a)}`,
    wait_for_load_state: () => "Waits for the page to finish loading",
    assert_visible: (a) => `Checks that ${selectorOf(a)} is visible`,
    assert_not_visible: (a) => `Checks that ${selectorOf(a)} is not visible`,
    assert_text: (a) => `Checks that ${quoted(a.selector)} shows ${quoted(a.value)}`,
    assert_not_text: (a) => `Checks that ${quoted(a.selector)} does not show ${quoted(a.value)}`,
    assert_value: (a) => `Checks that ${quoted(a.selector)} holds ${quoted(a.value)}`,
    assert_checked: (a) => `Checks that ${selectorOf(a)} is ticked`,
    assert_not_checked: (a) => `Checks that ${selectorOf(a)} is not ticked`,
    assert_disabled: (a) => `Checks that ${selectorOf(a)} is disabled`,
    assert_enabled: (a) => `Checks that ${selectorOf(a)} is enabled`,
    assert_url: (a) => `Checks that the page address matches ${urlOf(a)}`,
    assert_title: (a) => `Checks that the page title is ${quoted(a.value)}`,
    set_viewport: (a) => `Sets the window size to ${a.width ?? "?"} by ${a.height ?? "?"}`,
    screenshot: () => "Takes a screenshot",
    eval: () => "Runs a script in the page",
  },
  mobile: {
    tap: (a) => `Taps ${selectorOf(a)}`,
    type: (a) => `Types ${quoted(a.value)}${a.selector ? ` into ${quoted(a.selector)}` : ""}`,
    erase: (a) => `Erases ${a.ms ?? 50} characters`,
    press: (a) => `Presses ${a.key || a.value ? keyOf(a) : "BACK"}`,
    back: () => "Presses Back",
    hidekeyboard: () => "Hides the keyboard",
    assert_visible: (a) => `Checks that ${selectorOf(a)} is visible`,
    assert_not_visible: (a) => `Checks that ${selectorOf(a)} is not visible`,
    wait_for: waitFor,
    scroll_to: (a) => `Scrolls ${text(a.key ?? "down").toLowerCase()} to ${selectorOf(a)}`,
    swipe: (a) => `Swipes ${text(a.key ?? "right").toLowerCase()}${a.selector || a.value ? ` from ${selectorOf(a)}` : ""}`,
    launch: () => "Launches the app",
    stop: () => "Stops the app",
  },
  http: Object.fromEntries(
    ACTIONS.http.map((spec) => [spec.name, httpSentence(spec.name.replace("http_", "").toUpperCase())]),
  ),
  shell: { shell: (a) => `Runs the shell command: ${a.command ?? a.value ?? ""}` },
}

function actionSentence(driver: DriverName | undefined, target: string, a: ActionFields): string {
  const spec = driver && a.action ? findAction(driver, a.action) : undefined
  const sentence = driver && spec ? ACTION_SENTENCES[driver][spec.name] : undefined
  return sentence ? sentence(a) : `${a.action ?? "(no action)"} on ${target}`
}

/** The sentences a step's own fields give, besides its checks and remembered values. */
function doSentences(driver: DriverName | undefined, step: Step): string[] {
  if (step.actions) return step.actions.map((a) => actionSentence(driver, step.target, a))
  if (step.action) return [actionSentence(driver, step.target, step)]
  if (step.launch) return [step.launch === "fresh" ? "Launches the app fresh" : "Restarts the app"]
  if (step.command !== undefined) return [ACTION_SENTENCES.shell.shell(step)]
  if (step.url !== undefined) return [httpSentence((step.method ?? "GET").toUpperCase())(step)]
  return []
}

/** How each `json_match` operator reads, given the path and the operator's argument. */
const MATCH_PHRASES: Record<JsonMatchOperator, (path: string, arg: unknown) => string> = {
  $exists: (path, arg) => (arg ? `to have ${path}` : `to have no ${path}`),
  $contains: (path, arg) => `${path} containing ${quoted(arg)}`,
  $notContains: (path, arg) => `${path} not containing ${quoted(arg)}`,
  $gt: (path, arg) => `${path} above ${text(arg)}`,
  $gte: (path, arg) => `${path} at least ${text(arg)}`,
}

function matchPhrase(path: string, expected: unknown): string {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const ops = Object.entries(expected as Record<string, unknown>)
    if (ops.length > 0 && ops.every(([op]) => op.startsWith("$"))) {
      return ops
        .map(([op, arg]) => {
          // Every op starts with `$`, so no Object.prototype key is ever looked up.
          const phrase = MATCH_PHRASES[op as JsonMatchOperator] as ((path: string, arg: unknown) => string) | undefined
          return phrase ? phrase(path, arg) : `${path} matching ${text(arg)}`
        })
        .join(" and ")
    }
  }
  return `${path} equal to ${text(expected)}`
}

function checkSentences(check: Assert | undefined): string[] {
  if (!check) return []
  const sentences: string[] = []
  if (check.status !== undefined) sentences.push(`Expects status ${check.status}`)
  if (check.exit_code !== undefined) sentences.push(`Expects exit code ${check.exit_code}`)
  if (check.output_contains !== undefined) sentences.push(`Expects the output to contain ${quoted(check.output_contains)}`)
  const matches = Object.entries(check.json_match ?? {})
  if (matches.length > 0) {
    sentences.push(`Expects the response to have ${matches.map(([path, expected]) => matchPhrase(path, expected)).join(" and ")}`)
  }
  return sentences
}

/** Every absolute URL and shell command the step carries, verbatim. */
function rawParts(step: Step): { commands: string[]; urls: string[] } {
  const parts = [step, ...(step.actions ?? [])] as ActionFields[]
  const isShell = (part: ActionFields) => part === step ? step.target === "shell" : part.action === "shell"
  return {
    commands: parts.flatMap((part) => (typeof part.command === "string" ? [part.command] : isShell(part) && typeof part.value === "string" ? [part.value] : [])),
    urls: parts.flatMap((part) => [part.url, part.value].filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value))),
  }
}

export function readback(config: LoadedConfig, scenario: Scenario): Readback {
  const steps = scenario.steps.map((step) => {
    const sentences = [...doSentences(driverOf(config.targets, step.target), step), ...checkSentences(step.assert)]
    const remembered = Object.keys(step.extract ?? {})
    if (remembered.length > 0) sentences.push(`Remembers ${remembered.join(", ")} from the response`)
    if (step.retry) sentences.push(`Tries again up to ${step.retry.times} times`)
    return { name: step.name, target: step.target, sentences }
  })

  const notes: string[] = []
  const values = Object.entries(scenario.vars ?? {})
  if (values.length > 0) notes.push(`Starts with values: ${values.map(([name, value]) => `${name} = ${JSON.stringify(value)}`).join(", ")}`)
  if (scenario.read_only) notes.push("Reuses the setup (read-only)")

  const raw = scenario.steps.map(rawParts)
  return {
    steps,
    targets: [...targetsUsed([scenario])],
    fixtures: scenario.setup ?? [],
    notes,
    commands: raw.flatMap((parts) => parts.commands),
    urls: [...new Set(raw.flatMap((parts) => parts.urls))],
  }
}
