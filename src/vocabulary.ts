/**
 * The scenario vocabulary: every step field, action, alias, assertion operator, placeholder namespace,
 * removed field and problem code. The step checker reads it, and tests hold the hand-written schema
 * (`schema/v1/scenario.schema.json`) and the drivers' action switches to it.
 */

export type DriverName = "http" | "web" | "mobile" | "shell"

/** Step fields every driver accepts. */
export const COMMON_STEP_FIELDS = ["id", "name", "target", "extract", "assert", "timeout_ms", "retry"]

/** Step fields each driver accepts on top of the common ones. */
export const DRIVER_STEP_FIELDS: Record<DriverName, string[]> = {
  http: ["actions", "method", "url", "headers", "body"],
  web: ["actions", "action", "selector", "target_selector", "value", "key", "url", "ms", "width", "height"],
  mobile: ["actions", "action", "selector", "value", "key", "ms", "launch"],
  shell: ["actions", "command", "cwd"],
}

/** What a step of each driver must have, as told to the author. */
export const STEP_NEEDS: Record<DriverName, string> = {
  http: '"actions" or "url"',
  web: '"actions" or "action"',
  mobile: '"actions", "action", or "launch"',
  shell: '"actions" or "command"',
}

/** Fields older versions ran and the drivers no longer do: a step that has one would fail at run time. */
export const REMOVED_FIELDS: Record<string, string> = {
  run: 'web modules are no longer run; write the step as "actions"',
  flow: 'YAML flows are no longer run; write the step as "actions"',
  params: '"params" only fed web modules and YAML flows, which are no longer run',
}

/** Fields every action accepts. */
export const COMMON_ACTION_FIELDS = ["id", "name", "action"]

/**
 * Action fields that are accepted and have no effect: the scenario builder writes them, but no
 * driver reads them. Assertions read only the step's `assert`.
 */
export const NO_EFFECT_ACTION_FIELDS: Record<string, string> = {
  status: 'no driver reads it; set the step\'s "assert.status" instead',
  exit_code: 'no driver reads it; set the step\'s "assert.exit_code" instead',
}

export type ActionSpec = {
  /** The name the kit teaches. */
  name: string
  /** Other names the driver runs the same way. */
  aliases: string[]
  /** Fields the action reads, besides `COMMON_ACTION_FIELDS`, then any no-effect fields it accepts. */
  fields: string[]
}

const SELECTOR = ["selector", "value", "timeout_ms"]
const action = (name: string, fields: string[], aliases: string[] = []): ActionSpec => ({ name, aliases, fields })

/** Every action each driver runs, in the order the kit lists them. */
export const ACTIONS: Record<DriverName, ActionSpec[]> = {
  web: [
    action("navigate", ["url", "value", "timeout_ms"], ["goto"]),
    action("reload", ["timeout_ms"]),
    action("go_back", ["timeout_ms"]),
    action("go_forward", ["timeout_ms"]),
    action("click", SELECTOR),
    action("dblclick", SELECTOR),
    action("hover", SELECTOR),
    action("focus", SELECTOR),
    action("clear", SELECTOR),
    action("fill", SELECTOR),
    action("type", SELECTOR),
    action("press", ["key", "value", "selector", "timeout_ms"]),
    action("check", SELECTOR),
    action("uncheck", SELECTOR),
    action("select", SELECTOR, ["select_option"]),
    action("drag_and_drop", ["selector", "target_selector", "value", "timeout_ms"]),
    action("upload_file", SELECTOR, ["set_input_files"]),
    action("scroll_into_view", SELECTOR),
    action("wait_for", ["selector", "ms", "timeout_ms"], ["wait"]),
    action("wait_for_url", ["url", "value", "timeout_ms"]),
    action("wait_for_load_state", ["value", "timeout_ms"]),
    action("assert_visible", SELECTOR),
    action("assert_not_visible", SELECTOR, ["assert_hidden"]),
    action("assert_text", SELECTOR),
    action("assert_not_text", SELECTOR),
    action("assert_value", SELECTOR),
    action("assert_checked", SELECTOR),
    action("assert_not_checked", SELECTOR),
    action("assert_disabled", SELECTOR),
    action("assert_enabled", SELECTOR),
    action("assert_url", ["url", "value", "timeout_ms"]),
    action("assert_title", ["value", "timeout_ms"]),
    action("set_viewport", ["width", "height", "value"]),
    action("screenshot", ["value"]),
    action("eval", ["value"], ["script"]),
  ],
  mobile: [
    action("tap", ["selector", "value"], ["tapon", "click"]),
    action("type", ["selector", "value"], ["input", "inputtext", "fill"]),
    action("erase", ["ms"], ["erasetext", "clear"]),
    action("press", ["key", "value"], ["presskey"]),
    action("back", []),
    action("hidekeyboard", []),
    action("assert_visible", SELECTOR, ["assertvisible"]),
    action("assert_not_visible", SELECTOR, ["assertnotvisible"]),
    action("wait_for", ["selector", "ms", "timeout_ms"], ["wait"]),
    action("scroll_to", ["selector", "value", "key", "timeout_ms"]),
    action("swipe", ["selector", "value", "key"]),
    action("launch", [], ["launchapp"]),
    action("stop", [], ["stopapp"]),
  ],
  http: ["http_get", "http_post", "http_put", "http_patch", "http_delete"].map((name) =>
    action(name, ["method", "url", "headers", "body", "status"]),
  ),
  shell: [action("shell", ["command", "value", "cwd", "exit_code"])],
}

/** Drivers that lower-case an action name before matching it, so `tapOn` runs as `tapon`. */
const IGNORES_CASE: DriverName[] = ["web", "mobile"]

/** The action `name` runs as on `driver`, by its name or an alias, or undefined when the driver has none. */
export function findAction(driver: DriverName, name: string): ActionSpec | undefined {
  const key = IGNORES_CASE.includes(driver) ? name.toLowerCase() : name
  return ACTIONS[driver].find((spec) => spec.name === key || spec.aliases.includes(key))
}

/** Every field an action of `driver` may carry, whichever action it is. */
export function actionFields(driver: DriverName): string[] {
  return [...new Set([...COMMON_ACTION_FIELDS, ...ACTIONS[driver].flatMap((spec) => spec.fields)])]
}

/** `assert.json_match` operators. */
export const JSON_MATCH_OPERATORS = ["$exists", "$contains", "$notContains", "$gt", "$gte"] as const

export type JsonMatchOperator = (typeof JSON_MATCH_OPERATORS)[number]

/** `${<namespace>.<name>}` placeholders and what each reads. */
export const PLACEHOLDER_NAMESPACES: Record<string, string> = {
  ctx: "the scenario's vars and every value an earlier step extracted",
  env: "environment variables",
  run: "the run: id and iteration",
}

/** Every problem a check can report, with the fix hint it carries. */
export const PROBLEM_CODES = {
  "json-parse": "The file is not valid JSON. Fix the syntax and check again.",
  schema: "The scenario does not match schema/v1/scenario.schema.json. Fix the field the pointer names.",
  "unknown-target": "Use a target name from the config, or \"shell\".",
  "unknown-fixture": "Use a fixture name from the config in \"setup\".",
  "unknown-action": "Use an action this target's driver runs.",
  "field-not-allowed": "Remove the field, or move the step to a target whose driver reads it.",
  "field-removed": 'Remove the field and write the step as "actions".',
  "step-needs-action": "Give the step the field its driver needs to do something.",
  "ctx-not-produced": 'Extract the value in an earlier step with "extract", or set it in the scenario\'s "vars".',
  "ctx-produced-later": "Move the step that extracts the value before the step that uses it.",
  "unknown-env-var": "Use an env variable name configured for the environment.",
  "raw-url": "Use a path relative to the target's service URL instead of a full URL.",
  "duplicate-id": "Give every scenario in the batch its own file name.",
  "draft-bug-found": "The person marked this draft Bug found, so it cannot be changed. Save it under another file name.",
  "no-draft-environment":
    "No environment is marked as allowed for drafts, so targets were checked against the default environment.",
} as const

export type ProblemCode = keyof typeof PROBLEM_CODES
