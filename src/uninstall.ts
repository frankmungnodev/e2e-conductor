import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { instructionFiles, withoutBlock } from "./agent-kit.ts"
import { findProjectDir } from "./db/paths.ts"
import { color } from "./logger.ts"
import { LOCAL_DIR, SUITE_DIR } from "./project-layout.ts"

export type UninstallRequest = {
  cwd: string
  /** Remove for real. Without it, the command only reports what it would remove. */
  yes?: boolean
  /** Keep `e2e-suite/`, the scenarios, presets and fixtures the team tracks in git. */
  keepSuite?: boolean
}

export type UninstallReport = {
  project: string
  removed: boolean
  /** Folders deleted whole. */
  folders: string[]
  /** Files that lose the kit block; every root name that resolves to one file. */
  instructionFiles: string[][]
  keptSuite: boolean
  /** The command that removes the package, when package.json lists it. */
  packageCommand?: string
}

/**
 * `e2e-conductor uninstall`: everything e2e-conductor wrote into the nearest project, which is
 * `.e2e/` (database, results, drafts, env files), `e2e-suite/` (unless kept), and the kit block in
 * the root `AGENTS.md` and `CLAUDE.md`. It reports only, unless `yes` is set. It never runs the
 * package manager: the package is removed by the command it prints.
 */
export function uninstall(request: UninstallRequest): UninstallReport {
  const project = findProjectDir(request.cwd)
  if (!project) throw new Error(`No .e2e or e2e-suite folder in ${request.cwd} or any folder above it, so there is nothing to remove.`)

  const folders = [LOCAL_DIR, ...(request.keepSuite ? [] : [SUITE_DIR])].map((folder) => join(project, folder)).filter((path) => existsSync(path))
  // Plan every file first, so unmatched markers in one stop the command before anything is removed.
  const edits = instructionFiles(project).flatMap(({ path, names }) => {
    const text = withoutBlock(readFileSync(path, "utf8"), names[0])
    return text === undefined ? [] : [{ path, names, text }]
  })

  if (request.yes) {
    for (const edit of edits) writeFileSync(edit.path, edit.text)
    for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  }

  return {
    project,
    removed: Boolean(request.yes),
    folders,
    instructionFiles: edits.map((edit) => edit.names),
    keptSuite: Boolean(request.keepSuite) && existsSync(join(project, SUITE_DIR)),
    packageCommand: packageCommand(project),
  }
}

/** The project's own remove command for the package, picked by lockfile, or undefined when package.json does not list it. */
function packageCommand(project: string): string | undefined {
  const manifest = join(project, "package.json")
  if (!existsSync(manifest)) return undefined
  let listed = false
  try {
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, Record<string, string> | undefined>
    listed = ["dependencies", "devDependencies", "optionalDependencies"].some((field) => pkg[field]?.["e2e-conductor"])
  } catch {
    return undefined
  }
  if (!listed) return undefined
  if (existsSync(join(project, "pnpm-lock.yaml"))) return "pnpm remove e2e-conductor"
  if (existsSync(join(project, "yarn.lock"))) return "yarn remove e2e-conductor"
  if (existsSync(join(project, "bun.lock")) || existsSync(join(project, "bun.lockb"))) return "bun remove e2e-conductor"
  return "npm uninstall e2e-conductor"
}

/** What `e2e-conductor uninstall` prints, with paths relative to `cwd`. */
export function renderUninstallReport(report: UninstallReport, cwd: string): string {
  const at = (path: string) => relative(cwd, path) || "."
  const verb = report.removed ? color.green("removed") : color.yellow("would remove")
  const lines: string[] = [color.dim(`project ${at(report.project)}`)]
  for (const folder of report.folders) lines.push(`${verb} ${at(folder)}/`)
  for (const names of report.instructionFiles) {
    lines.push(`${verb} the e2e-conductor kit block from ${names.map((name) => at(join(report.project, name))).join(" = ")}`)
  }
  if (report.folders.length + report.instructionFiles.length === 0) lines.push(color.dim("Nothing of e2e-conductor's is left in this project."))
  if (report.keptSuite) lines.push(color.dim(`kept     ${at(join(report.project, SUITE_DIR))}/ (--keep-suite)`))
  if (!report.removed && report.folders.length + report.instructionFiles.length > 0) {
    lines.push(
      "",
      `Nothing was removed. Run "e2e-conductor uninstall --yes" to remove it. ${LOCAL_DIR}/ is not in git, so its database, environments, platforms and run history cannot be recovered.`,
    )
    if (!report.keptSuite && report.folders.some((folder) => folder.endsWith(SUITE_DIR))) {
      lines.push(`Add --keep-suite to keep ${SUITE_DIR}/, your scenarios, presets and fixtures.`)
    }
  }
  if (report.packageCommand) lines.push("", `Then remove the package: ${report.packageCommand}`)
  return lines.join("\n")
}
