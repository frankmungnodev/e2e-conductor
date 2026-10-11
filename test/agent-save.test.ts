import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { type SaveReport, type SaveRequest, saveAgentDrafts } from "../src/agent-save.ts"
import { withDb } from "../src/db/connection.ts"
import { getDraft, getDraftGroup, markBugFound } from "../src/db/drafts.ts"
import { saveEnvironment, setAllowDrafts } from "../src/db/environments.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { savePlatform } from "../src/db/platforms.ts"
import { passedOnContent, saveScenarioRun } from "../src/db/scenario-runs.ts"
import { getScenario, getScenarios, type Scenario, saveScenario } from "../src/db/scenarios.ts"
import { scenarioVersion } from "../src/scenario-version.ts"
import { PROBLEM_CODES } from "../src/vocabulary.ts"
import { tempDir } from "./temp-dir.ts"

const CLI = resolve(import.meta.dirname, "..", "bin", "e2e.mjs")

/** A project with an `api` target, a default `dev` environment, and the draft mark on `allowDrafts`. */
function project({ allowDrafts = ["dev"] }: { allowDrafts?: string[] } = {}): string {
  const dir = tempDir("agent-save")
  withDb(resolveDbPath(dir), (db) => {
    saveEnvironment(db, "dev", { env: { USER_EMAIL: "dev@example.com" } }, { isDefault: true })
    savePlatform(db, { id: "plat-api", name: "api", type: "api", url: "http://localhost:4000" })
    for (const name of allowDrafts) setAllowDrafts(db, name, true)
  })
  return dir
}

const health = (name: string, url = "/health") => ({ name, steps: [{ name: "Health", target: "api", url }] })

/** Writes `files` into `.e2e/drafts/<group>/`, the folder `e2e save` reads with no file arguments. */
function writeDrafts(dir: string, group: string, files: Record<string, unknown>): string {
  const folder = join(dir, ".e2e", "drafts", group)
  mkdirSync(folder, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(folder, name), typeof content === "string" ? content : JSON.stringify(content, null, 2))
  }
  return folder
}

const emitted = new Set<string>()

/** Saves from the project folder with group `login` and a prompt, recording every code it reports. */
function save(dir: string, request: Partial<SaveRequest> = {}): { exitCode: number; report: SaveReport } {
  const outcome = saveAgentDrafts({ cwd: dir, inputs: [], group: "login", prompt: "test login", check: false, ...request })
  for (const found of [...outcome.report.problems, ...outcome.report.notices]) emitted.add(found.code)
  return outcome
}

const outcomes = (report: SaveReport) => report.results.map((result) => [result.id, result.outcome])
const stored = (dir: string, id: string) => withDb(resolveDbPath(dir), (db) => getScenario(db, id))
const draftOf = (dir: string, id: string) => withDb(resolveDbPath(dir), (db) => getDraft(db, id))
const ids = (dir: string) => withDb(resolveDbPath(dir), (db) => getScenarios(db).map((scenario) => scenario.id))

/** Records a passing run of `id` on its stored content. */
function recordPass(dir: string, id: string) {
  withDb(resolveDbPath(dir), (db) => {
    const scenario = getScenario(db, id)
    assert.ok(scenario)
    saveScenarioRun(db, { runId: `run-${id}`, scenarioId: id, iteration: 1, fingerprint: scenarioVersion(scenario).fingerprint, status: "PASSED", startedAt: 1 })
  })
}

const passed = (dir: string, id: string) =>
  withDb(resolveDbPath(dir), (db) => {
    const scenario = getScenario(db, id)
    return scenario ? passedOnContent(db, id, scenarioVersion(scenario).fingerprint) : false
  })

function keep(dir: string, scenario: Scenario) {
  withDb(resolveDbPath(dir), (db) => saveScenario(db, scenario))
}

describe("e2e save", () => {
  it("AE1: stores nothing when one of 30 files uses an unknown target, naming the file, the step and the targets", () => {
    const dir = project()
    const files: Record<string, unknown> = {}
    for (let index = 1; index <= 30; index++) files[`feature-${String(index).padStart(2, "0")}.json`] = health(`Feature ${index}`)
    files["feature-17.json"] = { name: "Feature 17", steps: [{ name: "Ping", target: "ghost", url: "/ping" }] }
    writeDrafts(dir, "login", files)
    const before = readFileSync(resolveDbPath(dir))

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 1)
    assert.equal(report.ok, false)
    assert.deepEqual(report.results, [])
    const [found, ...rest] = report.problems
    assert.deepEqual(rest, [])
    assert.equal(found.code, "unknown-target")
    assert.equal(found.file, join(".e2e", "drafts", "login", "feature-17.json"))
    assert.equal(found.stepIndex, 0)
    assert.equal(found.stepName, "Ping")
    assert.deepEqual(found.allowed, ["api", "shell"])
    assert.ok(readFileSync(resolveDbPath(dir)).equals(before), "the database file is byte-identical")
  })

  it("creates a draft per file in a new group that stores the prompt and the agent", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A"), "b.json": health("B"), "c.json": health("C") })

    const { exitCode, report } = save(dir, { agent: "claude" })

    assert.equal(exitCode, 0)
    assert.equal(report.ok, true)
    assert.equal(report.mode, "save")
    assert.equal(report.dbPath, resolveDbPath(dir))
    assert.equal(report.group, "login")
    assert.deepEqual(report.checkedEnvironments, ["dev"])
    assert.deepEqual(outcomes(report), [
      ["a", "created"],
      ["b", "created"],
      ["c", "created"],
    ])
    assert.deepEqual(draftOf(dir, "b"), { id: "b", state: "draft", group: "login" })
    const group = withDb(resolveDbPath(dir), (db) => getDraftGroup(db, "login"))
    assert.equal(group?.prompt, "test login")
    assert.equal(group?.agent, "claude")
  })

  it("reports an unchanged re-save and keeps the pass, while a changed file updates its draft and clears its pass", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A"), "b.json": health("B") })
    save(dir)
    recordPass(dir, "a")
    recordPass(dir, "b")

    const again = save(dir, { prompt: undefined })
    assert.equal(again.exitCode, 0)
    assert.deepEqual(outcomes(again.report), [
      ["a", "unchanged"],
      ["b", "unchanged"],
    ])
    assert.equal(passed(dir, "a"), true)

    writeDrafts(dir, "login", { "b.json": health("B", "/health/deep") })
    const changed = save(dir)
    assert.deepEqual(outcomes(changed.report), [
      ["a", "unchanged"],
      ["b", "updated"],
    ])
    assert.equal(stored(dir, "b")?.steps[0].url, "/health/deep")
    assert.equal(passed(dir, "a"), true)
    assert.equal(passed(dir, "b"), false)
  })

  it("AE6: saves a file named after a kept scenario as a linked revision and leaves the kept one alone", () => {
    const dir = project()
    keep(dir, { id: "login", ...health("Login") })
    const kept = stored(dir, "login")
    writeDrafts(dir, "login", { "login.json": health("Login", "/login") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 0)
    assert.deepEqual(report.results, [{ file: join(".e2e", "drafts", "login", "login.json"), id: "login@draft", outcome: "revision-of", revisionOf: "login" }])
    assert.deepEqual(stored(dir, "login"), kept)
    assert.equal(draftOf(dir, "login"), undefined, "the kept scenario stays kept")
    assert.equal(draftOf(dir, "login@draft")?.revisionOf, "login")
    assert.equal(stored(dir, "login@draft")?.steps[0].url, "/login")
  })

  it("refuses a file whose id ends in @draft as reserved-id and stores nothing", () => {
    const dir = project()
    writeDrafts(dir, "login", { "x@draft.json": health("X"), "a.json": health("A") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 1)
    assert.deepEqual(
      report.problems.map((found) => [found.code, found.file]),
      [["reserved-id", join(".e2e", "drafts", "login", "x@draft.json")]],
    )
    assert.deepEqual(ids(dir), [])
  })

  it("refuses a revision whose id is already a kept scenario and leaves that scenario unchanged", () => {
    const dir = project()
    keep(dir, { id: "x", ...health("X") })
    keep(dir, { id: "x@draft", ...health("Kept X draft", "/kept") })
    const kept = stored(dir, "x@draft")
    writeDrafts(dir, "login", { "x.json": health("X", "/changed") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 1)
    assert.deepEqual(
      report.problems.map((found) => [found.code, found.file]),
      [["reserved-id", join(".e2e", "drafts", "login", "x.json")]],
    )
    assert.match(report.problems[0].message, /"x@draft"/)
    assert.deepEqual(stored(dir, "x@draft"), kept)
    assert.equal(draftOf(dir, "x@draft"), undefined)
  })

  it("exits 2 for a --group that is not a slug", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A") })

    for (const group of ["../x", "Login", "-x", "a/b", "a b"]) {
      const { exitCode, report } = save(dir, { group })
      assert.equal(exitCode, 2, group)
      assert.match(report.error ?? "", /--group/, group)
    }
    assert.deepEqual(ids(dir), [])
  })

  it("reports a file identical to its kept scenario as matches-kept and stores no revision", () => {
    const dir = project()
    keep(dir, { id: "login", ...health("Login") })
    writeDrafts(dir, "login", { "login.json": health("Login") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 0)
    assert.deepEqual(outcomes(report), [["login", "matches-kept"]])
    assert.deepEqual(ids(dir), ["login"])
  })

  it("AE3: refuses a batch with a changed Bug found draft and stores nothing in it", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A"), "b.json": health("B") })
    save(dir)
    withDb(resolveDbPath(dir), (db) => markBugFound(db, "a"))
    writeDrafts(dir, "login", { "a.json": health("A", "/loosened"), "b.json": health("B", "/changed"), "c.json": health("C") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 1)
    assert.deepEqual(
      report.problems.map((found) => [found.code, found.file]),
      [["draft-bug-found", join(".e2e", "drafts", "login", "a.json")]],
    )
    assert.equal(stored(dir, "a")?.steps[0].url, "/health")
    assert.equal(stored(dir, "b")?.steps[0].url, "/health")
    assert.deepEqual(ids(dir), ["a", "b"])
  })

  it("passes an unchanged Bug found file as unchanged and saves the rest", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A"), "b.json": health("B") })
    save(dir)
    withDb(resolveDbPath(dir), (db) => markBugFound(db, "a"))
    writeDrafts(dir, "login", { "b.json": health("B", "/changed") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 0)
    assert.deepEqual(outcomes(report), [
      ["a", "unchanged"],
      ["b", "updated"],
    ])
    assert.equal(draftOf(dir, "a")?.state, "bug_found")
  })

  it("with --check reports the planned outcomes and stores nothing", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A") })

    const { exitCode, report } = save(dir, { check: true })

    assert.equal(exitCode, 0)
    assert.equal(report.mode, "check")
    assert.deepEqual(outcomes(report), [["a", "created"]])
    assert.deepEqual(ids(dir), [])
    assert.equal(
      withDb(resolveDbPath(dir), (db) => getDraftGroup(db, "login")),
      undefined,
    )
  })

  it("exits 2 without --group, and for a new group without --prompt", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A") })

    const noGroup = save(dir, { group: undefined })
    assert.equal(noGroup.exitCode, 2)
    assert.match(noGroup.report.error ?? "", /--group/)

    const noPrompt = save(dir, { prompt: undefined })
    assert.equal(noPrompt.exitCode, 2)
    assert.match(noPrompt.report.error ?? "", /--prompt/)
    assert.deepEqual(ids(dir), [])
  })

  it("exits 3 with a hint when the project has no database", () => {
    const dir = project()
    rmSync(resolveDbPath(dir))

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 3)
    assert.match(report.error ?? "", /No database at .*e2e init/)
  })

  it("saves a file with step and action ids copied from an export under new ids", () => {
    const dir = project()
    keep(dir, {
      id: "exported",
      name: "Exported",
      steps: [{ id: "step-1", name: "Call", target: "api", actions: [{ id: "action-1", action: "http_get", url: "/x" }] }],
    })
    writeDrafts(dir, "login", {
      "copy.json": { name: "Copy", steps: [{ id: "step-1", name: "Call", target: "api", actions: [{ id: "action-1", action: "http_get", url: "/y" }] }] },
    })

    assert.equal(save(dir).exitCode, 0)
    const copy = stored(dir, "copy")
    assert.notEqual(copy?.steps[0].id, "step-1")
    assert.equal(copy?.steps[0].actions?.[0].id, undefined)
    assert.equal(stored(dir, "exported")?.steps[0].id, "step-1")
  })

  it("reports two files with the same name in one batch as duplicate-id", () => {
    const dir = project()
    const first = writeDrafts(dir, "login", { "a.json": health("A") })
    const second = writeDrafts(dir, "other", { "a.json": health("Other A") })

    const { exitCode, report } = save(dir, { inputs: [first, second] })

    assert.equal(exitCode, 1)
    assert.deepEqual(
      report.problems.map((found) => [found.code, found.file]),
      [["duplicate-id", join(".e2e", "drafts", "other", "a.json")]],
    )
    assert.deepEqual(ids(dir), [])
  })

  it("saves with the no-draft-environment notice when no environment allows drafts", () => {
    const dir = project({ allowDrafts: [] })
    writeDrafts(dir, "login", { "a.json": health("A") })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 0)
    assert.deepEqual(
      report.notices.map((notice) => notice.code),
      ["no-draft-environment"],
    )
    assert.deepEqual(report.checkedEnvironments, ["dev"])
    assert.deepEqual(outcomes(report), [["a", "created"]])
  })

  it("reports json-parse and schema problems per file", () => {
    const dir = project()
    writeDrafts(dir, "login", { "broken.json": "{ not json", "shape.json": { name: "Shape" } })

    const { exitCode, report } = save(dir)

    assert.equal(exitCode, 1)
    assert.deepEqual(
      report.problems.map((found) => found.code),
      ["json-parse", "schema"],
    )
  })

  it("runs from a subfolder of the project and prints one JSON document with no color codes", () => {
    const dir = project()
    writeDrafts(dir, "login", { "a.json": health("A"), "bad.json": { name: "Bad", steps: [{ name: "Ping", target: "ghost", url: "/ping" }] } })
    const nested = join(dir, "app", "src")
    mkdirSync(nested, { recursive: true })
    const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, "save", ...args], { cwd: nested, encoding: "utf8" })

    const failed = cli("--group", "login", "--prompt", "test login", "--json")
    assert.equal(failed.status, 1)
    assert.doesNotMatch(failed.stdout, /\x1b\[/)
    const failure = JSON.parse(failed.stdout) as SaveReport
    assert.equal(failure.ok, false)
    assert.equal(failure.project, realpathSync(dir))
    assert.deepEqual(
      failure.problems.map((found) => found.code),
      ["unknown-target"],
    )

    rmSync(join(dir, ".e2e", "drafts", "login", "bad.json"))
    const done = cli("--group", "login", "--prompt", "test login", "--agent", "codex", "--json")
    assert.equal(done.status, 0, done.stderr)
    assert.doesNotMatch(done.stdout, /\x1b\[/)
    const success = JSON.parse(done.stdout) as SaveReport
    assert.deepEqual(Object.keys(success), ["ok", "mode", "project", "dbPath", "checkedEnvironments", "group", "results", "problems", "notices"])
    assert.deepEqual(outcomes(success), [["a", "created"]])
  })

  it("exits 2 from the CLI without --group", () => {
    const dir = project()
    const result = spawnSync(process.execPath, [CLI, "save", "--json"], { cwd: dir, encoding: "utf8" })
    assert.equal(result.status, 2)
    assert.match((JSON.parse(result.stdout) as SaveReport).error ?? "", /--group/)
  })

  it("F1 dry run: planted mistakes are fixed from the --json output alone", () => {
    const dir = project()
    const folder = writeDrafts(dir, "features", {
      "profile.json": {
        name: "Profile",
        steps: [
          { name: "Me", target: "backend", url: "/me", headers: { authorization: "Bearer ${ctx.token}" } },
          { name: "Log in", target: "api", url: "http://localhost:4000/login", body: { email: "${env.USER_MAIL}" }, extract: { token: "body.token" } },
        ],
      },
    })
    const cli = () =>
      spawnSync(process.execPath, [CLI, "save", "--group", "features", "--prompt", "test all the features", "--json"], { cwd: dir, encoding: "utf8" })

    const first = JSON.parse(cli().stdout) as SaveReport
    assert.deepEqual(first.problems.map((found) => found.code).sort(), ["ctx-produced-later", "raw-url", "unknown-env-var", "unknown-target"])
    for (const found of first.problems) emitted.add(found.code)

    // Fix each problem using only what the report says: the file, the pointer, the allowed values and the message.
    const file = first.problems[0]?.file
    assert.ok(file)
    const scenario = JSON.parse(readFileSync(join(dir, file), "utf8"))
    for (const found of first.problems) {
      const at = found.pointer.split("/").slice(1)
      const parent = at.slice(0, -1).reduce((value, key) => value[key], scenario)
      const key = at[at.length - 1]
      if (found.code === "raw-url") parent[key] = new URL(String(found.value)).pathname
      if (found.code === "unknown-target") parent[key] = found.allowed?.find((name) => name !== "shell")
      if (found.code === "unknown-env-var") parent[key] = parent[key].replace(`env.${found.value}`, `env.${found.allowed?.[0]}`)
    }
    for (const found of first.problems.filter((each) => each.code === "ctx-produced-later")) {
      const producer = Number(/steps\[(\d+)\]/.exec(found.message)?.[1])
      const [moved] = scenario.steps.splice(producer, 1)
      scenario.steps.splice(found.stepIndex, 0, moved)
    }
    writeFileSync(join(folder, "profile.json"), JSON.stringify(scenario))

    const second = cli()
    assert.equal(second.status, 0, second.stdout)
    assert.deepEqual(outcomes(JSON.parse(second.stdout) as SaveReport), [["profile", "created"]])
  })

  it("emits only codes in the vocabulary catalogue", () => {
    assert.ok(emitted.size >= 8, `saw ${[...emitted].join(", ")}`)
    for (const code of emitted) assert.ok(code in PROBLEM_CODES, code)
  })
})
