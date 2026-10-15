import assert from "node:assert/strict"
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { writeAgentKit } from "../src/agent-kit.ts"
import { initProject } from "../src/init.ts"
import { uninstall } from "../src/uninstall.ts"
import { tempDir } from "./temp-dir.ts"

const NOTES = "# Notes\n\nKeep tests small.\n"

/** A project after init and kit, with the person's own AGENTS.md notes and a scenario in e2e-suite. */
function project(): string {
  const dir = tempDir("uninstall")
  writeFileSync(join(dir, "AGENTS.md"), NOTES)
  initProject(dir)
  mkdirSync(join(dir, "e2e-suite/scenarios"), { recursive: true })
  writeFileSync(join(dir, "e2e-suite/scenarios/login.json"), "{}\n")
  writeAgentKit(dir)
  return dir
}

describe("e2e-conductor uninstall", () => {
  it("only reports without --yes", () => {
    const dir = project()
    const before = readFileSync(join(dir, "AGENTS.md"), "utf8")
    const report = uninstall({ cwd: dir })
    assert.equal(report.removed, false)
    assert.deepEqual(report.folders, [join(dir, ".e2e"), join(dir, "e2e-suite")])
    assert.deepEqual(report.instructionFiles, [["AGENTS.md"]])
    assert.ok(existsSync(join(dir, ".e2e/e2e.db")))
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), before)
  })

  it("removes both folders and the kit block, and leaves the person's notes byte-identical", () => {
    const dir = project()
    uninstall({ cwd: dir, yes: true })
    assert.ok(!existsSync(join(dir, ".e2e")))
    assert.ok(!existsSync(join(dir, "e2e-suite")))
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), NOTES)
  })

  it("keeps e2e-suite with --keep-suite", () => {
    const dir = project()
    const report = uninstall({ cwd: dir, yes: true, keepSuite: true })
    assert.ok(!existsSync(join(dir, ".e2e")))
    assert.ok(existsSync(join(dir, "e2e-suite/scenarios/login.json")))
    assert.equal(report.keptSuite, true)
  })

  it("removes the block once through a CLAUDE.md symlinked to AGENTS.md and keeps the symlink", () => {
    const dir = tempDir("uninstall-link")
    writeFileSync(join(dir, "AGENTS.md"), NOTES)
    symlinkSync("AGENTS.md", join(dir, "CLAUDE.md"))
    initProject(dir)
    writeAgentKit(dir)
    const report = uninstall({ cwd: dir, yes: true })
    assert.deepEqual(report.instructionFiles, [["AGENTS.md", "CLAUDE.md"]])
    assert.ok(lstatSync(join(dir, "CLAUDE.md")).isSymbolicLink())
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), NOTES)
  })

  it("removes an old 0.4.0 block and leaves a file that held only the block empty", () => {
    const dir = tempDir("uninstall-legacy")
    initProject(dir)
    writeFileSync(join(dir, "CLAUDE.md"), "<!-- e2e-kit:start -->\nold kit\n<!-- e2e-kit:end -->\n")
    uninstall({ cwd: dir, yes: true })
    assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf8"), "")
  })

  it("removes nothing when a file has unmatched markers", () => {
    const dir = project()
    writeFileSync(join(dir, "CLAUDE.md"), "<!-- e2e-conductor-kit:start -->\nno end\n")
    assert.throws(() => uninstall({ cwd: dir, yes: true }), /unmatched/)
    assert.ok(existsSync(join(dir, ".e2e/e2e.db")))
  })

  it("prints the project's own command to remove the package", () => {
    const dir = project()
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { "e2e-conductor": "^0.4.0" } }))
    writeFileSync(join(dir, "pnpm-lock.yaml"), "")
    assert.equal(uninstall({ cwd: dir }).packageCommand, "pnpm remove e2e-conductor")
  })

  it("fails when there is no project", () => {
    assert.throws(() => uninstall({ cwd: tempDir("uninstall-none") }), /nothing to remove/)
  })
})
