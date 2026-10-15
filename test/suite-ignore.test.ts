import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { describeHiddenSuite, hiddenSuitePaths } from "../src/suite-ignore.ts"
import { tempDir } from "./temp-dir.ts"

/** A git repo with one scenario file in the shared suite folder and the given root .gitignore. */
function repo(gitignore?: string): string {
  const dir = tempDir("suite-ignore")
  assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0)
  mkdirSync(join(dir, "e2e-suite", "scenarios"), { recursive: true })
  writeFileSync(join(dir, "e2e-suite", "scenarios", "smoke.json"), "{}\n")
  if (gitignore !== undefined) writeFileSync(join(dir, ".gitignore"), gitignore)
  return dir
}

describe("hiddenSuitePaths", () => {
  it("names the rule, its file and line when a root rule hides the suite folder", () => {
    const dir = repo("node_modules\ne2e-suite\n")
    const hidden = hiddenSuitePaths(dir)
    assert.ok(hidden.length > 0)
    assert.deepEqual(
      new Set(hidden.map(({ source, line, pattern }) => `${source}:${line}:${pattern}`)),
      new Set([".gitignore:2:e2e-suite"]),
    )
  })

  it("reports a folder-only rule before the suite folder exists", () => {
    const dir = tempDir("suite-ignore-empty")
    assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0)
    writeFileSync(join(dir, ".gitignore"), "e2e-suite/\n")
    assert.deepEqual(new Set(hiddenSuitePaths(dir).map(({ pattern }) => pattern)), new Set(["e2e-suite/"]))
  })

  it("reports scenario files a pattern hides while the folder stays visible", () => {
    const dir = repo("*.json\n")
    const hidden = hiddenSuitePaths(dir)
    assert.deepEqual(
      hidden.map(({ path, pattern }) => [path, pattern]),
      [[join(dir, "e2e-suite", "scenarios", "smoke.json"), "*.json"]],
    )
  })

  it("checks the extra paths a caller passes, such as files an export has not written yet", () => {
    const dir = repo("*.preset.json\n")
    const planned = join(dir, "e2e-suite", "presets", "echo.preset.json")
    assert.deepEqual(
      hiddenSuitePaths(dir, [planned]).map(({ path }) => path),
      [planned],
    )
  })

  it("leaves out extra paths outside the suite folder, such as a custom scenarios folder", () => {
    const dir = repo("custom\n")
    assert.deepEqual(hiddenSuitePaths(dir, [join(dir, "custom", "smoke.json")]), [])
  })

  it("reports a rule in .git/info/exclude with that file as its source", () => {
    const dir = repo()
    writeFileSync(join(dir, ".git", "info", "exclude"), "e2e-suite\n")
    assert.deepEqual(
      new Set(hiddenSuitePaths(dir).map(({ source, line, pattern }) => `${source}:${line}:${pattern}`)),
      new Set([".git/info/exclude:1:e2e-suite"]),
    )
  })

  it("reports nothing when no rule matches, including a rule for the local .e2e folder", () => {
    assert.deepEqual(hiddenSuitePaths(repo(".e2e\nnode_modules\n")), [])
  })

  it("ignores junk a project already keeps out of git, such as .DS_Store and node_modules in the suite", () => {
    const dir = repo(".DS_Store\nnode_modules\n")
    writeFileSync(join(dir, "e2e-suite", ".DS_Store"), "")
    writeFileSync(join(dir, "e2e-suite", "scenarios", ".DS_Store"), "")
    mkdirSync(join(dir, "e2e-suite", "fixtures", "node_modules", "pkg"), { recursive: true })
    writeFileSync(join(dir, "e2e-suite", "fixtures", "node_modules", "pkg", "index.js"), "")
    assert.deepEqual(hiddenSuitePaths(dir), [])
  })

  it("still reports a rule that hides fixture scripts", () => {
    const dir = repo("*.sh\n")
    mkdirSync(join(dir, "e2e-suite", "fixtures"))
    writeFileSync(join(dir, "e2e-suite", "fixtures", "reset-db.sh"), "")
    assert.deepEqual(
      hiddenSuitePaths(dir).map(({ path, pattern }) => [path, pattern]),
      [[join(dir, "e2e-suite", "fixtures", "reset-db.sh"), "*.sh"]],
    )
  })

  it("reports nothing when a negated rule re-includes the suite", () => {
    assert.deepEqual(hiddenSuitePaths(repo("*.json\n!e2e-suite/**/*.json\n")), [])
    assert.deepEqual(hiddenSuitePaths(repo("*\n!*/\n!e2e-suite/**\n")), [])
  })

  it("reports nothing outside a git repository", () => {
    const dir = tempDir("suite-ignore-no-git")
    mkdirSync(join(dir, "e2e-suite"))
    assert.deepEqual(hiddenSuitePaths(dir), [])
  })
})

describe("describeHiddenSuite", () => {
  it("writes one line per rule, counting the paths it hides", () => {
    const hidden = [
      { path: "/p/e2e-suite/", source: ".gitignore", line: 2, pattern: "e2e-suite" },
      { path: "/p/e2e-suite/scenarios/a.json", source: ".gitignore", line: 2, pattern: "e2e-suite" },
      { path: "/p/e2e-suite/presets/b.json", source: ".git/info/exclude", line: 1, pattern: "*.json" },
    ]
    assert.deepEqual(describeHiddenSuite(hidden), [
      '.gitignore:2 "e2e-suite" hides 2 paths in e2e-suite/ from git. Remove or narrow it so the suite is committed.',
      '.git/info/exclude:1 "*.json" hides a path in e2e-suite/ from git. Remove or narrow it so the suite is committed.',
    ])
  })
})
