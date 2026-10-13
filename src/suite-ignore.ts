import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { SUITE_DIR } from "./project-layout.ts"

/** A shared suite path that a git ignore rule hides, with the rule that hides it. */
export type HiddenPath = { path: string; source: string; line: number; pattern: string }

/**
 * The suite folder, every file in it, and `extraPaths` (absolute; only those inside the suite count) that a
 * git ignore rule hides, asked of git itself so root and nested `.gitignore` files, `.git/info/exclude` and
 * the global excludes file all count. Tracked files are checked too (`--no-index`): a rule that matches them still hides new ones.
 * Empty outside a git repository or when `git` is not installed.
 */
export function hiddenSuitePaths(projectDir: string, extraPaths: string[] = []): HiddenPath[] {
  const suiteDir = join(projectDir, SUITE_DIR)
  // The trailing slash marks the folder as one, so a folder-only rule (`e2e-suite/`) matches before it exists.
  const candidates = [`${SUITE_DIR}/`, ...[...suiteFiles(suiteDir), ...extraPaths].map((path) => relative(projectDir, path))].filter(
    (path) => path.startsWith(`${SUITE_DIR}/`),
  )
  const result = spawnSync("git", ["-C", projectDir, "check-ignore", "-v", "-z", "--no-index", "--stdin"], {
    input: `${[...new Set(candidates)].join("\0")}\0`,
    encoding: "utf8",
  })
  // 0: something is ignored, 1: nothing is, 128 (or a spawn error): not a repo, or no git.
  if (result.status !== 0) return []
  const fields = result.stdout.split("\0")
  const hidden: HiddenPath[] = []
  for (let i = 0; i + 3 < fields.length; i += 4) {
    hidden.push({ source: fields[i], line: Number(fields[i + 1]), pattern: fields[i + 2], path: join(projectDir, fields[i + 3]) })
  }
  return hidden
}

/** One line per rule, naming where it lives and how many suite paths it hides. */
export function describeHiddenSuite(hidden: HiddenPath[]): string[] {
  const byRule = new Map<string, number>()
  for (const { source, line, pattern } of hidden) {
    const rule = `${source}:${line} "${pattern}"`
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1)
  }
  return [...byRule].map(
    ([rule, count]) => `${rule} hides ${count === 1 ? "a path" : `${count} paths`} in ${SUITE_DIR}/ from git. Remove or narrow it so the suite is committed.`,
  )
}

function suiteFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}
