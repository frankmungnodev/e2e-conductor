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
const kit = (dir: string) => read(dir, ".e2e/agent/kit.md")
const blocks = (text: string) => text.split("<!-- e2e-kit:start -->").length - 1

describe("e2e kit", () => {
  it("lists the configured target and fixture names", () => {
    const dir = project()
    writeAgentKit(dir)
    const text = kit(dir)
    for (const name of ["api", "shop", "reset-db", "seed-admin", "API_TOKEN", "Health check", "Sign in"]) {
      assert.ok(text.includes(name), `kit names ${name}`)
    }
  })

  it("writes env variable names but no env or fixture command values", () => {
    const dir = project()
    writeAgentKit(dir)
    for (const file of [".e2e/agent/kit.md", ".e2e/agent/vocabulary.json"]) {
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
    const start = text.indexOf("<!-- e2e-kit:start -->")
    const end = text.indexOf("<!-- e2e-kit:end -->") + "<!-- e2e-kit:end -->".length
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
    assert.ok(existsSync(join(dir, ".e2e/agent/kit.md")))
  })

  it("appends the block once to an AGENTS.md without markers, and a second run does not duplicate it", () => {
    const dir = project()
    writeFileSync(join(dir, "AGENTS.md"), "# Agents")
    assert.equal(writeAgentKit(dir).instructionFiles[0].outcome, "added")
    const first = read(dir, "AGENTS.md")
    assert.equal(blocks(first), 1)
    assert.ok(first.startsWith("# Agents\n\n<!-- e2e-kit:start -->"))
    assert.ok(first.includes(".e2e/agent/kit.md"))

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

  it("writes the block into both files when AGENTS.md and CLAUDE.md are separate", () => {
    const dir = project()
    writeFileSync(join(dir, "AGENTS.md"), "# Agents\n")
    writeFileSync(join(dir, "CLAUDE.md"), "# Claude\n")
    writeAgentKit(dir)
    assert.equal(blocks(read(dir, "AGENTS.md")), 1)
    assert.equal(blocks(read(dir, "CLAUDE.md")), 1)
  })

  for (const [label, text] of [
    ["only a start marker", "# Agents\n\n<!-- e2e-kit:start -->\nMy own notes.\n"],
    ["the end marker before the start marker", "# Agents\n\n<!-- e2e-kit:end -->\nMy own notes.\n<!-- e2e-kit:start -->\n"],
  ]) {
    it(`fails on an AGENTS.md with ${label} and writes nothing`, () => {
      const dir = project()
      writeFileSync(join(dir, "AGENTS.md"), text)

      assert.throws(() => writeAgentKit(dir), /AGENTS\.md has unmatched/)

      assert.equal(read(dir, "AGENTS.md"), text)
      assert.equal(existsSync(join(dir, ".e2e/agent/kit.md")), false)
    })
  }

  it("lists every action and problem code of the vocabulary in vocabulary.json, without no-effect fields", () => {
    const dir = project()
    writeAgentKit(dir)
    const vocabulary = JSON.parse(read(dir, ".e2e/agent/vocabulary.json"))
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

  it("gives examples that pass the strict check e2e save runs, on the environment that allows drafts", () => {
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

  it("fails when no folder from the current one upward has .e2e", () => {
    const dir = tempDir("agent-kit-none")
    mkdirSync(join(dir, "sub"))
    assert.throws(() => writeAgentKit(join(dir, "sub")), /No \.e2e folder/)
  })
})
