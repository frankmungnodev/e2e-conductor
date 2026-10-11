import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { KIT_END, KIT_START, type KitFacts, renderInstructionBlock, renderKit, renderVocabulary } from "./agent-kit-text.ts"
import { withDb } from "./db/connection.ts"
import { getFixtures } from "./db/fixtures.ts"
import { findProjectDir, resolveDbPath } from "./db/paths.ts"
import { getStepGroups } from "./db/step-groups.ts"
import { getStepPresets } from "./db/step-presets.ts"
import { color } from "./logger.ts"
import { draftEnvironmentsToCheck } from "./strict-check.ts"

/** The root instruction files that get the kit block, when they exist. The kit never creates them. */
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"]

/** What `e2e kit` did to one root instruction file. */
export type InstructionFileOutcome = {
  /** Every name at the project root that resolves to this file, e.g. a `CLAUDE.md` symlinked to `AGENTS.md`. */
  names: string[]
  /** `added`: the block was appended; `updated`: the block was replaced; `unchanged`: it was already current. */
  outcome: "added" | "updated" | "unchanged"
}

export type KitReport = {
  project: string
  kitPath: string
  vocabularyPath: string
  checkedEnvironments: string[]
  /** Empty when the project root has neither `AGENTS.md` nor `CLAUDE.md`. */
  instructionFiles: InstructionFileOutcome[]
}

/**
 * Writes the agent kit for the nearest project from `cwd` upward, as `e2e save` finds it:
 * `.e2e/agent/kit.md`, `.e2e/agent/vocabulary.json`, and the marked block in the root `AGENTS.md`
 * and `CLAUDE.md` that exist. Only the block between the markers is rewritten; the files are written in
 * place, so a symlinked `CLAUDE.md` stays a symlink and its target gets one block.
 */
export function writeAgentKit(cwd: string): KitReport {
  const project = findProjectDir(cwd)
  if (!project) throw new Error(`No .e2e folder in ${cwd} or any folder above it. Run "e2e init" in the project first.`)
  const dbPath = resolveDbPath(project)
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath}. Run "e2e init" or "e2e ui" in ${project} first.`)

  // The same environments `e2e save` checks against: the ones that allow drafts, else the default one.
  const facts = withDb(dbPath, (db): KitFacts => {
    const { environments, notices } = draftEnvironmentsToCheck(db)
    return { environments, notices, fixtures: Object.keys(getFixtures(db)), presets: getStepPresets(db), stepGroups: getStepGroups(db) }
  })

  // Plan every instruction file first, so unmatched markers in one stop the command before anything is written.
  const block = renderInstructionBlock()
  const planned = instructionFiles(project).map((file) => ({ ...file, ...withBlock(readFileSync(file.path, "utf8"), block, file.names[0]) }))

  const agentDir = join(project, ".e2e", "agent")
  mkdirSync(agentDir, { recursive: true })
  const kitPath = join(agentDir, "kit.md")
  const vocabularyPath = join(agentDir, "vocabulary.json")
  writeFileSync(kitPath, renderKit(facts))
  writeFileSync(vocabularyPath, renderVocabulary())
  for (const file of planned) if (file.outcome !== "unchanged") writeFileSync(file.path, file.text)

  return {
    project,
    kitPath,
    vocabularyPath,
    checkedEnvironments: facts.environments.map((environment) => environment.name),
    instructionFiles: planned.map(({ names, outcome }) => ({ names, outcome })),
  }
}

/** The root instruction files that exist, one entry per real file, with every root name that resolves to it. */
function instructionFiles(project: string): { path: string; names: string[] }[] {
  const byPath = new Map<string, string[]>()
  for (const name of INSTRUCTION_FILES) {
    const path = join(project, name)
    if (!existsSync(path)) continue
    const real = realpathSync(path)
    byPath.set(real, [...(byPath.get(real) ?? []), name])
  }
  return [...byPath].map(([path, names]) => ({ path, names }))
}

/** `text` with `block` replacing the marked block, or appended when there is none. */
function withBlock(text: string, block: string, name: string): { text: string; outcome: InstructionFileOutcome["outcome"] } {
  const starts = text.split(KIT_START).length - 1
  const ends = text.split(KIT_END).length - 1
  if (starts === 0 && ends === 0) {
    const separator = text.trim() === "" ? "" : text.endsWith("\n") ? "\n" : "\n\n"
    return { text: `${text.trim() === "" ? "" : text}${separator}${block}\n`, outcome: "added" }
  }
  const from = text.indexOf(KIT_START)
  const to = text.indexOf(KIT_END)
  // Replacing between unmatched markers could delete the person's own text.
  if (starts !== 1 || ends !== 1 || to < from) {
    throw new Error(`${name} has unmatched ${KIT_START} / ${KIT_END} markers. Leave exactly one pair, or none, and run "e2e kit" again.`)
  }
  const next = `${text.slice(0, from)}${block}${text.slice(to + KIT_END.length)}`
  return { text: next, outcome: next === text ? "unchanged" : "updated" }
}

/** What `e2e kit` prints, with paths relative to `cwd`. */
export function renderKitReport(report: KitReport, cwd: string): string {
  const at = (path: string) => relative(cwd, path) || "."
  const lines = [
    color.dim(`project ${at(report.project)}  checked against: ${report.checkedEnvironments.join(", ")}`),
    `${color.green("wrote")}     ${at(report.kitPath)}`,
    `${color.green("wrote")}     ${at(report.vocabularyPath)}`,
  ]
  for (const { names, outcome } of report.instructionFiles) {
    const tint = outcome === "unchanged" ? color.dim : color.green
    lines.push(`${tint(outcome.padEnd(9))} ${names.map((name) => at(join(report.project, name))).join(" = ")} ${color.dim("(e2e kit block)")}`)
  }
  if (report.instructionFiles.length === 0) {
    lines.push(
      color.yellow(`No AGENTS.md or CLAUDE.md in ${at(report.project)}, so none was written. Create one and run "e2e kit" again to point agents at the kit.`),
    )
  }
  return lines.join("\n")
}
