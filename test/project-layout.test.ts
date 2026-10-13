import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { openDatabase } from "../src/db/connection.ts"
import { findProjectDir } from "../src/db/paths.ts"
import { tempDir } from "./temp-dir.ts"

describe("local state folder", () => {
  it("writes a .gitignore that ignores everything when the database opens in .e2e", () => {
    const dir = tempDir("layout-ignore")
    openDatabase(join(dir, ".e2e", "e2e.db")).close()
    assert.equal(readFileSync(join(dir, ".e2e", ".gitignore"), "utf8"), "*\n")
  })

  it("keeps a .gitignore the person already has in .e2e", () => {
    const dir = tempDir("layout-keep")
    mkdirSync(join(dir, ".e2e"))
    writeFileSync(join(dir, ".e2e", ".gitignore"), "e2e.db\n")
    openDatabase(join(dir, ".e2e", "e2e.db")).close()
    assert.equal(readFileSync(join(dir, ".e2e", ".gitignore"), "utf8"), "e2e.db\n")
  })

  it("writes no .gitignore next to a database outside .e2e", () => {
    const dir = tempDir("layout-custom")
    openDatabase(join(dir, "custom", "e2e.db")).close()
    assert.throws(() => readFileSync(join(dir, "custom", ".gitignore"), "utf8"))
  })

  it("keeps .e2e out of git status", () => {
    const dir = tempDir("layout-git")
    assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0)
    openDatabase(join(dir, ".e2e", "e2e.db")).close()
    const status = spawnSync("git", ["-C", dir, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" })
    assert.equal(status.stdout, "")
  })
})

describe("findProjectDir", () => {
  it("finds a project that has only the shared suite folder, as a fresh clone does", () => {
    const dir = tempDir("layout-clone")
    mkdirSync(join(dir, "e2e-suite", "scenarios"), { recursive: true })
    mkdirSync(join(dir, "app", "src"), { recursive: true })
    assert.equal(findProjectDir(join(dir, "app", "src")), dir)
  })

  it("finds a project that has only the local state folder", () => {
    const dir = tempDir("layout-local")
    mkdirSync(join(dir, ".e2e"))
    mkdirSync(join(dir, "app"))
    assert.equal(findProjectDir(join(dir, "app")), dir)
  })

  it("finds nothing when no folder up to the root has either", () => {
    const dir = tempDir("layout-none")
    assert.equal(findProjectDir(dir), undefined)
  })
})
