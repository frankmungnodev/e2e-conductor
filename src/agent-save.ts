import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative, resolve } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { LoadedConfig } from "./config.ts"
import { openDatabase } from "./db/connection.ts"
import { getDraft, getDraftGroup, REVISION_SUFFIX, revisionId, saveDraft, saveDraftGroup, saveRevision } from "./db/drafts.ts"
import { getFixtures } from "./db/fixtures.ts"
import { findProjectDir, resolveDbPath } from "./db/paths.ts"
import { getScenario, type Scenario } from "./db/scenarios.ts"
import { color } from "./logger.ts"
import { type Problem, problem } from "./problems.ts"
import { scenarioVersion } from "./scenario-version.ts"
import { describeErrors, validateScenario } from "./schema.ts"
import { checkStrict, draftEnvironmentsToCheck } from "./strict-check.ts"

export type SaveRequest = {
  /** The folder the command runs in: the project is the nearest one upward with a `.e2e` or `e2e-suite` folder. */
  cwd: string
  /** Scenario files or folders of them; none means `.e2e/drafts/<group>/*.json`. */
  inputs: string[]
  group?: string
  prompt?: string
  agent?: string
  /** Check only: store nothing. */
  check: boolean
}

/** What a save did, or would do with `--check`, to one file's scenario. */
export type SaveOutcome = "created" | "updated" | "unchanged" | "revision-of" | "matches-kept"

export type SaveResult = {
  /** The file, relative to the folder the command ran in. */
  file: string
  /** The stored id: the file name, or `<kept id>@draft` for a revision. */
  id: string
  outcome: SaveOutcome
  /** On a revision: the kept scenario it would replace. */
  revisionOf?: string
}

/** The one document `e2e save --json` prints. On failure `results` is empty. */
export type SaveReport = {
  ok: boolean
  mode: "save" | "check"
  project?: string
  dbPath?: string
  checkedEnvironments: string[]
  group?: string
  results: SaveResult[]
  problems: Problem[]
  notices: Problem[]
  /** A usage, project or database error, when the command stopped before checking the files. */
  error?: string
}

/** 0 stored or clean, 1 problems and nothing stored, 2 usage, 3 project or database error. */
export type SaveExitCode = 0 | 1 | 2 | 3

class SaveError extends Error {
  constructor(
    message: string,
    readonly exitCode: 2 | 3,
  ) {
    super(message)
  }
}

type CheckedFile = { file: string; scenario: Scenario }

/** A group key is a folder name under `.e2e/drafts`, so it may not climb out of it or hide. */
const GROUP_SLUG = /^[a-z0-9][a-z0-9_-]*$/

/**
 * The agent's write path. Every file is read and held to the strict check against the environments
 * that allow drafts, then classified against what is stored. Any problem stores nothing; otherwise,
 * unless `check` is set, the group and every draft and revision are written in one transaction.
 */
export function saveAgentDrafts(request: SaveRequest): { exitCode: SaveExitCode; report: SaveReport } {
  const report: SaveReport = {
    ok: false,
    mode: request.check ? "check" : "save",
    // Named up front, so the --json document keeps this key order once they are known.
    project: undefined,
    dbPath: undefined,
    checkedEnvironments: [],
    group: request.group?.trim() || undefined,
    results: [],
    problems: [],
    notices: [],
  }
  try {
    const exitCode = save(request, report)
    report.ok = exitCode === 0
    if (!report.ok) report.results = []
    return { exitCode, report }
  } catch (error) {
    report.error = (error as Error).message
    report.results = []
    return { exitCode: error instanceof SaveError ? error.exitCode : 3, report }
  }
}

function save(request: SaveRequest, report: SaveReport): SaveExitCode {
  const project = findProjectDir(request.cwd)
  if (!project) {
    throw new SaveError(`No .e2e or e2e-suite folder in ${request.cwd} or any folder above it. Run "e2e init" in the project first.`, 3)
  }
  report.project = project
  const dbPath = resolveDbPath(project)
  report.dbPath = dbPath
  const group = request.group?.trim()
  if (!group) throw new SaveError('--group <slug> is required: the drafts are stored under that group.', 2)
  if (!GROUP_SLUG.test(group)) {
    throw new SaveError(
      `--group "${group}" is not a slug: use lowercase letters, digits, "-" and "_", starting with a letter or digit.`,
      2,
    )
  }
  if (!existsSync(dbPath)) throw new SaveError(`No database at ${dbPath}. Run "e2e init" or "e2e ui" in ${project} first.`, 3)

  const db = openDatabaseOrFail(dbPath)
  try {
    if (!getDraftGroup(db, group) && !request.prompt?.trim()) {
      throw new SaveError(`Group "${group}" is new, so it needs --prompt "<the prompt the drafts came from>".`, 2)
    }
    const files = inputFiles(request, project, group)
    const { environments, notices } = draftEnvironmentsToCheck(db)
    report.checkedEnvironments = environments.map((environment) => environment.name)
    report.notices = notices
    const config: LoadedConfig = {
      configDir: project,
      dbPath,
      env: {},
      scenarios: ".e2e/scenarios",
      results: ".e2e/results",
      services: {},
      targets: {},
      fixtures: getFixtures(db),
    }

    const checked: CheckedFile[] = []
    const firstFileOf = new Map<string, string>()
    for (const path of files) {
      const file = relative(request.cwd, path) || path
      const found = readScenario(path, file)
      if ("problems" in found) {
        report.problems.push(...found.problems)
        continue
      }
      const firstFile = firstFileOf.get(found.scenario.id)
      if (firstFile) {
        report.problems.push(
          problem("duplicate-id", {
            file,
            pointer: "",
            message: `"${found.scenario.id}" is also the id of ${firstFile}: a scenario's id is its file name`,
            value: found.scenario.id,
          }),
        )
        continue
      }
      firstFileOf.set(found.scenario.id, file)
      const problems = checkStrict(config, found.scenario, environments).map((each) => ({ ...each, file }))
      report.problems.push(...problems)
      if (problems.length === 0) checked.push({ file, scenario: found.scenario })
    }
    if (report.problems.length > 0) return 1

    // The writes happen under the lock taken before classifying, so nothing changes in between.
    if (!request.check) db.exec("BEGIN IMMEDIATE")
    try {
      const planned = checked.map((each) => classify(db, group, each))
      report.problems.push(...planned.flatMap((each) => ("problem" in each ? [each.problem] : [])))
      if (report.problems.length > 0) {
        if (db.isTransaction) db.exec("ROLLBACK")
        return 1
      }
      if (!request.check) {
        saveDraftGroup(db, { key: group, prompt: request.prompt?.trim(), agent: request.agent?.trim() })
        for (const each of planned) each.write?.()
        db.exec("COMMIT")
      }
      report.results = planned.flatMap((each) => ("result" in each ? [each.result] : []))
      return 0
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK")
      throw new SaveError(`Nothing was stored: ${(error as Error).message}`, 3)
    }
  } finally {
    db.close()
  }
}

function openDatabaseOrFail(dbPath: string): DatabaseSync {
  try {
    return openDatabase(dbPath)
  } catch (error) {
    throw new SaveError(`Could not open ${dbPath}: ${(error as Error).message}. Close anything holding it and try again.`, 3)
  }
}

/** The `.json` files the inputs name: a file as is, a folder's `*.json` files, and with no inputs the group's drafts folder. */
function inputFiles(request: SaveRequest, project: string, group: string): string[] {
  const inputs = request.inputs.length > 0 ? request.inputs.map((input) => resolve(request.cwd, input)) : [join(project, ".e2e", "drafts", group)]
  const files: string[] = []
  for (const input of inputs) {
    const stat = statSync(input, { throwIfNoEntry: false })
    if (!stat) throw new SaveError(`${relative(request.cwd, input) || input} does not exist.`, 2)
    if (!stat.isDirectory()) {
      files.push(input)
      continue
    }
    for (const name of readdirSync(input).sort()) if (name.endsWith(".json")) files.push(join(input, name))
  }
  if (files.length === 0) throw new SaveError(`No scenario .json files in ${inputs.map((input) => relative(request.cwd, input) || input).join(", ")}.`, 2)
  return files
}

/** The file's scenario, with its id from the file name, or the JSON and schema problems that stop it. */
function readScenario(path: string, file: string): { scenario: Scenario } | { problems: Problem[] } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    return { problems: [problem("json-parse", { file, pointer: "", message: `not valid JSON: ${(error as Error).message}` })] }
  }
  if (!validateScenario(raw)) {
    const errors = validateScenario.errors ?? []
    const messages = describeErrors(errors)
    return {
      problems: errors.map((error, index) => problem("schema", { file, pointer: error.instancePath, message: messages[index] })),
    }
  }
  const id = basename(path, ".json")
  if (id.endsWith(REVISION_SUFFIX)) {
    return { problems: [reservedId(file, id, `"${id}" ends in "${REVISION_SUFFIX}", which marks a revision e2e save makes`)] }
  }
  return { scenario: { ...(raw as Omit<Scenario, "id">), id } as Scenario }
}

type Planned = { result: SaveResult; write?: () => void } | { problem: Problem; write?: never }

/**
 * What saving the scenario does: a new id is created, an existing draft is updated, an id that is a kept
 * scenario gets a revision unless the file matches it, and a Bug found draft is refused unless the file
 * matches it. A draft whose content is unchanged is left alone, so its pass holds.
 */
function classify(db: DatabaseSync, group: string, { file, scenario }: CheckedFile): Planned {
  const draft = getDraft(db, scenario.id)
  const stored = getScenario(db, scenario.id)
  if (stored && !draft) {
    if (sameContent(stored, scenario)) return { result: { file, id: scenario.id, outcome: "matches-kept" } }
    const id = revisionId(scenario.id)
    const revision = getDraft(db, id)
    const storedRevision = getScenario(db, id)
    if (storedRevision && !revision) {
      return { problem: reservedId(file, id, `"${id}" is a kept scenario, so "${scenario.id}" has no room for a revision`) }
    }
    const result = { file, id, revisionOf: scenario.id }
    const unchanged = revision !== undefined && storedRevision !== undefined && sameContent(storedRevision, scenario)
    if (unchanged && (revision.state === "bug_found" || revision.group === group)) return { result: { ...result, outcome: "unchanged" } }
    if (revision?.state === "bug_found") return { problem: bugFound(file, id) }
    return { result: { ...result, outcome: "revision-of" }, write: () => saveRevision(db, scenario.id, scenario, group) }
  }
  if (draft && stored) {
    const unchanged = sameContent(stored, scenario)
    if (draft.state === "bug_found") {
      return unchanged ? { result: { file, id: scenario.id, outcome: "unchanged" } } : { problem: bugFound(file, scenario.id) }
    }
    if (unchanged && draft.group === group) return { result: { file, id: scenario.id, outcome: "unchanged" } }
    // Unchanged content saved under another group moves the draft there; its pass holds, as the content is the same.
    return { result: { file, id: scenario.id, outcome: "updated" }, write: () => saveDraft(db, scenario, group) }
  }
  return { result: { file, id: scenario.id, outcome: "created" }, write: () => saveDraft(db, scenario, group) }
}

function reservedId(file: string, id: string, message: string): Problem {
  return problem("reserved-id", { file, pointer: "", message, value: id })
}

function bugFound(file: string, id: string): Problem {
  return problem("draft-bug-found", {
    file,
    pointer: "",
    message: `"${id}" is marked Bug found, so this save would change a draft the person set aside; drop this file from the batch`,
    value: id,
  })
}

/** Name, description and everything that runs; step and action ids do not count, since a draft save drops them. */
function sameContent(stored: Scenario, file: Scenario): boolean {
  return (
    stored.name === file.name &&
    (stored.description ?? "") === (file.description ?? "") &&
    scenarioVersion(stored).fingerprint === scenarioVersion(file).fingerprint
  )
}

/** The report as `--json` prints it or as text for a person, with paths relative to `cwd`. */
export function renderSaveReport(report: SaveReport, cwd: string, json: boolean): string {
  if (json) return JSON.stringify(report, null, 2)
  const lines: string[] = []
  const at = (path: string | undefined) => (path ? relative(cwd, path) || "." : "(none)")
  lines.push(color.dim(`project ${at(report.project)}  db ${at(report.dbPath)}  group ${report.group ?? "(none)"}`))
  if (report.checkedEnvironments.length > 0) lines.push(color.dim(`checked against: ${report.checkedEnvironments.join(", ")}`))
  for (const notice of report.notices) lines.push(`${color.yellow("notice")} ${notice.message}`)
  if (report.error) {
    lines.push(color.red(report.error))
    return lines.join("\n")
  }
  for (const found of report.problems) {
    const where = found.stepIndex !== undefined ? ` steps[${found.stepIndex}] "${found.stepName}"` : ""
    lines.push(`${color.red(found.code)} ${found.file ?? ""}${where}${found.pointer ? ` ${color.dim(found.pointer)}` : ""}: ${found.message}`)
    if (found.allowed) lines.push(color.dim(`  allowed: ${found.allowed.join(", ") || "(none)"}`))
    lines.push(color.dim(`  hint: ${found.hint}`))
  }
  if (report.problems.length > 0) {
    lines.push(color.red(`${report.problems.length} problem(s); nothing was stored`))
    return lines.join("\n")
  }
  for (const result of report.results) {
    const outcome = result.outcome === "revision-of" ? `revision-of ${result.revisionOf}` : result.outcome
    const tint = result.outcome === "unchanged" || result.outcome === "matches-kept" ? color.dim : color.green
    lines.push(`${tint(outcome.padEnd(12))} ${result.id} ${color.dim(result.file)}`)
  }
  const counts = new Map<string, number>()
  for (const result of report.results) counts.set(result.outcome, (counts.get(result.outcome) ?? 0) + 1)
  const summary = [...counts].map(([outcome, count]) => `${count} ${outcome}`).join(", ")
  lines.push(
    report.mode === "check"
      ? `${color.green("✓")} check passed, nothing stored (would be: ${summary})`
      : `${color.green("✓")} saved: ${summary}`,
  )
  return lines.join("\n")
}
