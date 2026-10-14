import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { SUITE_AGENT, SUITE_DIR, SUITE_FIXTURES, SUITE_PRESETS, SUITE_SCENARIOS } from "./project-layout.ts"

/** A shared suite path that a git ignore rule hides, with the rule that hides it. */
export type HiddenPath = { path: string; source: string; line: number; pattern: string }

/** The suite folders the tool writes to or documents. Only these, and the files directly in them, are checked. */
const SUITE_FOLDERS = [SUITE_SCENARIOS, SUITE_PRESETS, SUITE_AGENT, SUITE_FIXTURES]

/**
 * The suite folder, its known folders and the files directly in them, and `extraPaths` (absolute; only those
 * inside the suite count) that a git ignore rule hides, asked of git itself so root and nested `.gitignore`
 * files, `.git/info/exclude` and the global excludes file all count. Tracked files are checked too
 * (`--no-index`): a rule that matches them still hides new ones. Dotfiles and nested folders are left out, so
 * junk a project keeps out of git on purpose (`.DS_Store`, a fixture's `node_modules`) is not reported. A
 * negated rule (`!e2e-suite/**`) re-includes a path, so it hides nothing.
 * Empty outside a git repository or when `git` is not installed.
 */
export function hiddenSuitePaths(projectDir: string, extraPaths: string[] = []): HiddenPath[] {
  // A trailing slash marks a folder as one, so a folder-only rule (`e2e-suite/`) matches before it exists.
  const folders = [SUITE_DIR, ...SUITE_FOLDERS].map((folder) => `${folder}/`)
  const files = [...SUITE_FOLDERS.flatMap((folder) => folderFiles(join(projectDir, folder))), ...extraPaths]
    .map((path) => relative(projectDir, path))
    .filter((path) => path.startsWith(`${SUITE_DIR}/`))
  const result = spawnSync("git", ["-C", projectDir, "check-ignore", "-v", "-z", "--no-index", "--stdin"], {
    input: `${[...new Set([...folders, ...files])].join("\0")}\0`,
    encoding: "utf8",
  })
  // 0: something matched a rule, 1: nothing did, 128 (or a spawn error): not a repo, or no git.
  if (result.status !== 0) return []
  const fields = result.stdout.split("\0")
  const hidden: HiddenPath[] = []
  for (let i = 0; i + 3 < fields.length; i += 4) {
    if (fields[i + 2].startsWith("!")) continue
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

function folderFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => join(dir, entry.name))
}
