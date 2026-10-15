import assert from "node:assert/strict"
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { renderKitReport, writeAgentKit } from "../src/agent-kit.ts"
import { withDb } from "../src/db/connection.ts"
import { saveEnvironment, setAllowDrafts } from "../src/db/environments.ts"
import { saveFixture } from "../src/db/fixtures.ts"
import { resolveDbPath } from "../src/db/paths.ts"
import { savePlatform } from "../src/db/platforms.ts"
import type { Scenario } from "../src/db/scenarios.ts"
import { saveStepGroup } from "../src/db/step-groups.ts"
import { saveStepPreset } from "../src/db/step-presets.ts"
import { checkStrict, environmentsToCheck } from "../src/strict-check.ts"
import { ACTIONS, PROBLEM_CODES } from "../src/vocabulary.ts"
import { tempDir } from "./temp-dir.ts"

const ENV_SECRET = "env-secret-value-9f3a"
const FIXTURE_SECRET = "fixture-token-77c1"

/** A project with `api` and `shop` targets, a default `dev` environment with an env variable, two fixtures, a preset and a step group. */
function project(): string {
  const dir = tempDir("agent-kit")
  withDb(resolveDbPath(dir), (db) => {
    saveEnvironment(db, "dev", { env: { API_TOKEN: ENV_SECRET } }, { isDefault: true })
    savePlatform(db, { id: "plat-api", name: "api", type: "api", url: "http://localhost:4000" })
    savePlatform(db, { id: "plat-shop", name: "shop", type: "web", url: "http://localhost:5173" })
    saveFixture(db, "reset-db", { cmd: `node reset.js --token=${FIXTURE_SECRET}` })
    saveFixture(db, "seed-admin", { cmd: "node seed.js" })
    saveStepPreset(db, { id: "preset-health", name: "Health check", target: "api", step: { name: "Health", target: "api", url: "/health" } })
    saveStepGroup(db, { id: "group-signin", name: "Sign in", target: "shop", steps: [{ name: "Open", target: "shop", action: "navigate", url: "/" }] })
  })
  return dir
}

const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8")
const kit = (dir: string) => read(dir, "e2e-suite/agent/kit.md")
const NEW_START = "<!-- e2e-conductor-kit:start -->"
const NEW_END = "<!-- e2e-conductor-kit:end -->"
const OLD_START = "<!-- e2e-kit:start -->"
const OLD_END = "<!-- e2e-kit:end -->"
const blocks = (text: string) => text.split(NEW_START).length - 1

describe("e2e-conductor kit", () => {
  it("lists the configured target and fixture names", () => {
    const dir = project()
    writeAgentKit(dir)
    const text = kit(dir)
    for (const name of ["api", "shop", "reset-db", "seed-admin", "API_TOKEN", "Health check", "Sign in"]) {
      assert.ok(text.includes(name), `kit names ${name}`)
    }
    assert.ok(!text.includes("No platforms yet"))
    assert.ok(text.includes("e2e-conductor platform add <name>"))
  })

  it("tells agents to add a platform first when the environment has none, as after e2e-conductor init", () => {
    const dir = tempDir("agent-kit-bare")
    withDb(resolveDbPath(dir), (db) => saveEnvironment(db, "dev", {}, { isDefault: true }))
    writeAgentKit(dir)
    assert.ok(kit(dir).includes("No platforms yet: add the one the scenario needs first"))
  })

  it("writes env variable names but no env or fixture command values", () => {
    const dir = project()
    writeAgentKit(dir)
    for (const file of ["e2e-suite/agent/kit.md", "e2e-suite/agent/vocabulary.json"]) {
      assert.ok(!read(dir, file).includes(ENV_SECRET), `${file} has no env value`)
      assert.ok(!read(dir, file).includes(FIXTURE_SECRET), `${file} has no fixture command`)
    }
  })

  it("updates the kit after a target is added and leaves AGENTS.md outside the markers byte-identical", () => {
    const dir = project()
    const before = "# Agents\n\nHouse rules.\n"
    const after = "\n## Later\n\nMore rules.  \n"
    writeFileSync(join(dir, "AGENTS.md"), before)
    writeAgentKit(dir)
    // The person edits around the block.
    writeFileSync(join(dir, "AGENTS.md"), `${read(dir, "AGENTS.md")}${after}`)
    withDb(resolveDbPath(dir), (db) => savePlatform(db, { id: "plat-admin", name: "admin-web", type: "web", url: "http://localhost:5174" }))

    const report = writeAgentKit(dir)

    assert.ok(kit(dir).includes("admin-web"))
    const text = read(dir, "AGENTS.md")
    const start = text.indexOf(NEW_START)
    const end = text.indexOf(NEW_END) + NEW_END.length
    assert.equal(text.slice(0, start), `${before}\n`)
    assert.equal(text.slice(end), `\n${after}`)
    assert.deepEqual(
      report.instructionFiles.map((each) => [each.names, each.outcome]),
      [[["AGENTS.md"], "unchanged"]],
    )
  })

  it("writes neither AGENTS.md nor CLAUDE.md when the root has none, and says so", () => {
    const dir = project()
    const report = writeAgentKit(dir)
    assert.equal(existsSync(join(dir, "AGENTS.md")), false)
    assert.equal(existsSync(join(dir, "CLAUDE.md")), false)
    assert.deepEqual(report.instructionFiles, [])
    assert.match(renderKitReport(report, dir), /No AGENTS\.md or CLAUDE\.md in \., so none was written/)
    assert.ok(existsSync(join(dir, "e2e-suite/agent/kit.md")))
  })

  it("appends the block once to an AGENTS.md without markers, and a second run does not duplicate it", () => {
    const dir = project()
    writeFileSync(join(dir, "AGENTS.md"), "# Agents")
    assert.equal(writeAgentKit(dir).instructionFiles[0].outcome, "added")
    const first = read(dir, "AGENTS.md")
    assert.equal(blocks(first), 1)
    assert.ok(first.startsWith(`# Agents\n\n${NEW_START}`))
    assert.ok(first.includes("e2e-suite/agent/kit.md"))

    assert.equal(writeAgentKit(dir).instructionFiles[0].outcome, "unchanged")
    assert.equal(read(dir, "AGENTS.md"), first)
  })

  it("writes one block through a CLAUDE.md symlinked to AGENTS.md and keeps the symlink", () => {
    const dir = project()
    writeFileSync(join(dir, "AGENTS.md"), "# Agents\n")
    symlinkSync("AGENTS.md", join(dir, "CLAUDE.md"))

    const report = writeAgentKit(dir)

    assert.equal(blocks(read(dir, "AGENTS.md")), 1)
    assert.ok(lstatSync(join(dir, "CLAUDE.md")).isSymbolicLink())
    assert.equal(readlinkSync(join(dir, "CLAUDE.md")), "AGENTS.md")
    assert.deepEqual(
      report.instructionFiles.map((each) => each.names),
      [["AGENTS.md", "CLAUDE.md"]],
    )
  })

  it("replaces a 0.4.0 block between the old markers in place and leaves the notes around it unchanged (AE5)", () => {
    const dir = project()
    const before = "# Agents\n\nHouse rules.\n\n"
    const after = "\n\n## Later\n\nMore rules.\n"
    writeFileSync(join(dir, "AGENTS.md"), `${before}${OLD_START}\nOld kit text.\n${OLD_END}${after}`)

    const report = writeAgentKit(dir)

    const text = read(dir, "AGENTS.md")
    assert.equal(report.instructionFiles[0].outcome, "updated")
    assert.equal(blocks(text), 1)
    assert.ok(!text.includes(OLD_START) && !text.includes(OLD_END) && !text.includes("Old kit text."))
    assert.equal(text.slice(0, text.indexOf(NEW_START)), before)
    assert.equal(text.slice(text.indexOf(NEW_END) + NEW_END.length), after)
    assert.equal(writeAgentKit(dir).instructionFiles[0].outcome, "unchanged")
  })

  it("deletes an old block and rewrites the new block in place when a file has both (AE6)", () => {
    const dir = project()
    const top = "# Agents\n\n"
    const middle = "\n\nNotes between the blocks.\n\n"
    const bottom = "\n\nNotes at the end.\n"
    writeFileSync(join(dir, "AGENTS.md"), `${top}${OLD_START}\nOld kit text.\n${OLD_END}${middle}${NEW_START}\nStale new block.\n${NEW_END}${bottom}`)

    const report = writeAgentKit(dir)

    const text = read(dir, "AGENTS.md")
    assert.equal(report.instructionFiles[0].outcome, "updated")
    assert.equal(blocks(text), 1)
    assert.ok(!text.includes(OLD_START) && !text.includes("Old kit text.") && !text.includes("Stale new block."))
    assert.equal(text.slice(0, text.indexOf(NEW_START)), `${top}${middle}`)
    assert.equal(text.slice(text.indexOf(NEW_END) + NEW_END.length), bottom)
    assert.ok(text.includes("e2e-suite/agent/kit.md"))
    assert.equal(writeAgentKit(dir).instructionFiles[0].outcome, "unchanged")
  })

  it("repairs an old block through a CLAUDE.md symlinked to AGENTS.md and keeps the symlink", () => {
    const dir = project()
    writeFileSync(join(dir, "AGENTS.md"), `# Agents\n\n${OLD_START}\nOld.\n${OLD_END}\n`)
    symlinkSync("AGENTS.md", join(dir, "CLAUDE.md"))

    writeAgentKit(dir)

    const text = read(dir, "AGENTS.md")
    assert.equal(blocks(text), 1)
    assert.ok(!text.includes(OLD_START))
    assert.ok(lstatSync(join(dir, "CLAUDE.md")).isSymbolicLink())
  })

  it("writes the block into both files when AGENTS.md and CLAUDE.md are separate", () => {
    const dir = project()
    writeFileSync(join(dir, "AGENTS.md"), "# Agents\n")
    writeFileSync(join(dir, "CLAUDE.md"), "# Claude\n")
    writeAgentKit(dir)
    assert.equal(blocks(read(dir, "AGENTS.md")), 1)
    assert.equal(blocks(read(dir, "CLAUDE.md")), 1)
  })

  for (const [label, text] of [
    ["only a start marker", `# Agents\n\n${NEW_START}\nMy own notes.\n`],
    ["the end marker before the start marker", `# Agents\n\n${NEW_END}\nMy own notes.\n${NEW_START}\n`],
    ["only an old start marker", `# Agents\n\n${OLD_START}\nMy own notes.\n`],
    ["two old blocks", `${OLD_START}\nA\n${OLD_END}\nNotes.\n${OLD_START}\nB\n${OLD_END}\n`],
    ["an old block and a current block that overlap", `${OLD_START}\nA\n${NEW_START}\nB\n${OLD_END}\nC\n${NEW_END}\n`],
  ]) {
    it(`fails on an AGENTS.md with ${label} and writes nothing`, () => {
      const dir = project()
      writeFileSync(join(dir, "AGENTS.md"), text)

      assert.throws(() => writeAgentKit(dir), /AGENTS\.md has (unmatched|a .* that overlap)/)

      assert.equal(read(dir, "AGENTS.md"), text)
      assert.equal(existsSync(join(dir, "e2e-suite/agent/kit.md")), false)
    })
  }

  it("lists every action and problem code of the vocabulary in vocabulary.json, without no-effect fields", () => {
    const dir = project()
    writeAgentKit(dir)
    const vocabulary = JSON.parse(read(dir, "e2e-suite/agent/vocabulary.json"))
    for (const [driver, specs] of Object.entries(ACTIONS)) {
      const listed = vocabulary.drivers[driver].actions
      assert.deepEqual(
        listed.map((each: { name: string; aliases: string[] }) => [each.name, each.aliases]),
        specs.map((spec) => [spec.name, spec.aliases]),
      )
    }
    assert.deepEqual(Object.keys(vocabulary.problemCodes).sort(), Object.keys(PROBLEM_CODES).sort())
    const fields = Object.values(vocabulary.drivers).flatMap((each) => (each as { actions: { fields: string[] }[] }).actions.flatMap((action) => action.fields))
    assert.ok(!fields.includes("status") && !fields.includes("exit_code"))
  })

  it("gives examples that pass the strict check e2e-conductor save runs, on the environment that allows drafts", () => {
    const dir = project()
    withDb(resolveDbPath(dir), (db) => {
      saveEnvironment(db, "staging", { env: {} })
      setAllowDrafts(db, "staging", true)
    })
    writeAgentKit(dir)
    const text = kit(dir)
    assert.ok(text.includes("staging"))
    const examples = [...text.matchAll(/```json\n(\{\n {2}"name"[\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]) as Omit<Scenario, "id">)
    assert.ok(examples.length >= 2, `found ${examples.length} examples`)
    withDb(resolveDbPath(dir), (db) => {
      const { environments } = environmentsToCheck(db, ["staging"])
      const config = { configDir: dir, dbPath: resolveDbPath(dir), env: {}, scenarios: ".e2e/scenarios", results: ".e2e/results", services: {}, targets: {}, fixtures: { "reset-db": { cmd: "x" }, "seed-admin": { cmd: "x" } } }
      for (const [index, example] of examples.entries()) {
        assert.deepEqual(checkStrict(config, { ...example, id: `example-${index}` }, environments), [], example.name)
      }
    })
  })

  it("fails when no folder from the current one upward has .e2e or e2e-suite", () => {
    const dir = tempDir("agent-kit-none")
    mkdirSync(join(dir, "sub"))
    assert.throws(() => writeAgentKit(join(dir, "sub")), /No \.e2e or e2e-suite folder/)
  })
})
