---
title: Shared Suite Folder and Local State Split - Plan
type: feat
date: 2026-10-12
topic: e2e-suite-layout
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Shared Suite Folder and Local State Split - Plan

## Goal Capsule

- **Objective:** A team that adopts the open-source tool can commit its test suite and review every scenario change in a pull request, while the database, run results and secrets never reach git, without anyone writing gitignore rules by hand.
- **Means:** Split the tool's files by owner: a visible, tracked `e2e-suite/` folder for what the team shares, and a self-ignoring `.e2e/` folder for what belongs to one machine.
- **Product authority:** This plan covers the file layout and git behavior only. Exporting environment, platform and fixture definitions to files is not active scope.
- **Open blockers:** None.
- **Stop conditions:** Stop and ask if a change would alter an existing exit code other than `export --check`'s new ignore failure, or would make any command read or move files from the old layout (R8).
- **Execution profile:** One feature branch off `development`, five units, merged locally with fast-forward only per `CLAUDE.md`.

---

## Product Contract

### Summary

The tool writes everything a team shares (scenarios, presets, fixture scripts, the agent kit) to a visible `e2e-suite/` folder, and keeps the database, results, env files and snapshots in `.e2e/`, which ignores itself. `e2e export --check` fails when an ignore rule hides the shared folder.

### Problem Frame

The tool is going open source, so many teams will add it to their own repos. Today the suite and the machine-local state share one hidden `.e2e/` folder. The shared part holds the scenario JSON files. The local part holds `e2e.db`, run results, and secrets such as `backend.e2e.env` and `d1-snapshot.key` in zomilabu.

The rule people write by instinct, `.e2e` in the root `.gitignore`, hides the whole suite from git. That happened in zomilabu: its 15 scenario files in `.e2e/scenarios/` became invisible to review. The opposite mistake, leaving `.e2e/` unignored, commits the database and the secrets. Nothing in the tool writes, checks or documents the right rules, so each adopter has to work out the split alone.

`docs/ideation/2026-10-03-open-ideation.html` idea 3 already named the review gap, and `e2e export --check` closed the drift half of it (SQLite vs JSON files). The layout half stayed open.

### Key Decisions

- **Two folders split by owner, not one folder with a nested allow-list.** With the split, the instinctive root rule `.e2e` is the correct rule, so the mistake cannot happen instead of being caught after it does. Governs R1, R2, R3. (session-settled: user-directed — chosen over keeping everything in `.e2e/` with a tool-written allow-list `.e2e/.gitignore`: a root `.e2e` rule would still hide the suite in every adopter that writes it.)
- **The shared folder is named `e2e-suite/`.** `e2e/` is the default test folder for Playwright, Angular and Detox, so many adopters already have one. Governs R1. (session-settled: user-directed — chosen over `e2e/` and `orchestrator/`: no known collision, and the name says what the folder holds.)
- **Presets live with the rest of the shared files.** Export currently writes them to `<project root>/presets/`, a generic folder name in the adopter's repo. Governs R1. (session-settled: user-directed — chosen over keeping root `presets/`: no consumer has that folder yet, so moving it now costs nothing.)
- **The tool never edits the adopter's root `.gitignore`; it warns, and `--check` fails.** The root file belongs to the adopter, and the rule may sit in a global gitignore or `.git/info/exclude` that the tool cannot see to fix. Governs R4, R5. (session-settled: user-directed — chosen over warn-only and over rewriting the root rule: warn-only lets a hook pass while the suite is hidden.)
- **No migration from the old layout.** The tool is pre-release; zomilabu, the only consumer, will be recreated from a clean state. Governs R8. (session-settled: user-directed — chosen over an explicit migrate command, automatic moves, and supporting both layouts.)

### Requirements

**Layout**

- R1. The shared folder `e2e-suite/` at the project root holds scenarios, presets, fixture scripts and the agent kit, and is the default location every command reads and writes them.
- R2. `.e2e/` holds only machine-local state: the database, run results, env files, snapshots and any other file a person or fixture puts there.
- R3. `.e2e/` contains a `.gitignore` that ignores the whole folder, including itself, so a project needs no root rule to keep local state out of git. The tool writes this file whenever it creates `.e2e/` or finds the file missing.

**Guarding the shared folder**

- R4. When an ignore rule hides `e2e-suite/` or anything in it, `e2e init`, `e2e export` and `e2e kit` print a warning that names the matching rule, the file it lives in, and the fix.
- R5. `e2e export --check` exits 1 when an ignore rule hides `e2e-suite/` or anything in it, listing the rule as it lists drifted files.
- R6. Outside a git repository, the tool writes `.e2e/.gitignore` as usual and skips the ignore checks in R4 and R5 without a warning.

**Fresh clones**

- R7. In a clone that has `e2e-suite/` but no `.e2e/`, every command, including an agent's `e2e save` run from a subfolder, finds the project and loads the suite from the shared files.
- R8. The tool does not detect, move or read the old layout (`.e2e/scenarios/`, `.e2e/agent/`, root `presets/`).

**Docs**

- R9. `docs/domain/` describes the new layout, the self-ignoring `.e2e/`, and the `--check` ignore failure, and states that secrets belong in `.e2e/` env files, never in fixture scripts.

### Acceptance Examples

- AE1. **Covers R1, R2, R3.** Given a git repo with no gitignore rules for the tool, when a person runs `e2e init`, adds a scenario and runs `e2e export`, then `git status` lists files under `e2e-suite/` and nothing under `.e2e/`.
- AE2. **Covers R4, R5.** Given a root `.gitignore` with the line `e2e-suite`, when a person runs `e2e export`, then it prints a warning naming `.gitignore` and the `e2e-suite` rule, and `e2e export --check` exits 1 even when no file has drifted.
- AE3. **Covers R3.** Given a project whose `.e2e/.gitignore` was deleted, when any command that writes to `.e2e/` runs, then the file is back and `.e2e/` is ignored again.
- AE4. **Covers R7.** Given a fresh clone with `e2e-suite/scenarios/` and no `.e2e/`, when an agent runs `e2e save` from a subfolder, then the command finds the project root and creates `.e2e/` with its database there.
- AE5. **Covers R6.** Given a folder that is not a git repository, when a person runs `e2e export --check` with no drift, then it exits 0 and prints no ignore warning.

### Scope Boundaries

- Exporting environments, platforms and fixture definitions to tracked files, so a clone runs without manual setup. That is a separate brainstorm; environment values can hold secrets and per-machine URLs.
- Migrating existing projects to the new layout (R8).
- Detecting files under `.e2e/` that a repo already tracks. A self-ignoring folder does not untrack them.
- Agent drafts stay in the database only, as today; nothing about drafts changes.
- Editing the adopter's root `.gitignore` in any form.

### Dependencies / Assumptions

- Zomilabu will be recreated by hand: a fresh `e2e init`, its 15 scenario files placed in `e2e-suite/scenarios/`, and its two fixture commands (stored in the database as `sh ../.e2e/fixtures/reset-db.sh` and `node ../.e2e/fixtures/seed-admin.mjs`) rewritten to point at `e2e-suite/fixtures/`.
- Fixture scripts in `e2e-suite/` are committed. A secret written inside one reaches git; R9 documents where secrets go instead.

### Sources / Research

- `docs/domain/scenarios.md` section 4: storage, one-time import, export and `export --check` behavior.
- `docs/ideation/2026-10-03-open-ideation.html` idea 3: the original review-in-git gap.
- `src/db/paths.ts`: `DEFAULT_DB_DIR = ".e2e"` and `findProjectDir`, which today finds a project only by its `.e2e/` folder (affects R7).
- `src/export.ts` and `src/scenario.ts`: presets written to and read from `<project root>/presets/`.
- `src/agent-kit-text.ts`: kit paths `.e2e/agent/kit.md` and `.e2e/agent/vocabulary.json`.
- `src/config.ts`: default `scenarios` `.e2e/scenarios` and `results` `.e2e/results`.

Product Contract preservation: Product Contract unchanged; its three Deferred-to-Planning questions are answered by KTD1, KTD5 and U2.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **`.e2e/.gitignore` is written where the database opens.** `openDatabase` in `src/db/connection.ts` is the one path every command takes before writing local state (`init`, `ui`, `run`, `save`, `export`). When the database folder is named `.e2e` and holds no `.gitignore`, it writes one containing `*`. A single choke point beats a call in each command, and the existence check costs one `stat`. Covers R3.
- KTD2. **Ignore detection asks git itself.** The check runs `git check-ignore -v --no-index --stdin` in the project, feeding the suite folder and every file under it. Git's own answer covers root rules, nested `.gitignore` files, `.git/info/exclude` and the global excludes file, which no hand-written matcher would. `--no-index` reports a rule even for files already tracked, since that rule still hides new files. Exit 128 (not a repo) or a missing `git` binary means "no check" (R6). This mirrors the existing `spawnSync("git", ...)` use in `unfinishedGitOperation` (`src/preflight.ts`).
- KTD3. **Ignored paths travel in `checkExport`'s result.** `ExportDrift` gains an `ignored` list next to `missing`, `changed` and `stale`, so the CLI's exit-1 rule stays one sum and tests assert on data rather than console output. Covers R5.
- KTD4. **A project is found by either folder.** `findProjectDir` (`src/db/paths.ts`) accepts a folder holding `.e2e/` or `e2e-suite/`, so a fresh clone works before any database exists. Covers R7.
- KTD5. **Folder names live in one module.** A new `src/project-layout.ts` exports the two folder names and the subfolder paths (`scenarios`, `presets`, `agent`). Every default in `src/` imports from it. The UI cannot import from `src/`, so its two default strings are written out and covered by the UI smoke test.
- KTD6. **Legacy `modules`, `flows` and agent drafts stay in `.e2e/`.** Nothing runs modules or flows any more (`docs/domain/platforms.md`), and drafts are working files that reach `e2e-suite/` only through export. Moving them would widen the diff with no user-visible gain.

### Considered and Not Built

- **Writing `.e2e/.gitignore` from every folder-creation site** (run results, preflight logs, the logger). Those sites only create `.e2e/` without the file when `--db` points outside `.e2e/`, which a person sets on purpose. Revisit if an adopter reports results committed to git.

### Output Structure

What an adopter's project looks like after `e2e init`, export and kit:

```text
<project>/
  e2e-suite/              tracked
    scenarios/<id>.json
    presets/<id>.json
    fixtures/             convention only; nothing scaffolds it
    agent/kit.md
    agent/vocabulary.json
  .e2e/                   ignored by its own .gitignore
    .gitignore            contains: *
    e2e.db
    results/
    drafts/<group>/
    flows/ modules/       legacy, unchanged
    *.env, snapshots      whatever fixtures put here
```

### Sequencing

U1 first: it holds the names every other unit imports. U2 and U3 depend on U1 and not on each other. U4 depends on U2's default value. U5 goes last so the docs describe what landed.

---

## Implementation Units

### U1. Layout module, self-ignoring local folder, project detection

**Goal:** One place names the two folders, `.e2e/` ignores itself, and a clone with only `e2e-suite/` is still found as a project.

**Requirements:** R2, R3, R7. KTD1, KTD4, KTD5.

**Dependencies:** None.

**Files:**
- Create `src/project-layout.ts`
- Modify `src/db/connection.ts`, `src/db/paths.ts`
- Create `test/project-layout.test.ts`
- Modify `test/db.test.ts`

**Approach:**
1. `src/project-layout.ts` exports the folder names (`e2e-suite`, `.e2e`), the shared subfolder names, and a helper that writes `.gitignore` with `*` into a given `.e2e` folder when the file is missing.
2. `openDatabase` calls the helper after creating or finding the folder, only when the folder's basename is `.e2e`. A custom `--db` path elsewhere is left alone.
3. `src/db/paths.ts` takes `DEFAULT_DB_DIR` from the new module, and `findProjectDir` stops at the first folder holding either `.e2e/` or `e2e-suite/`.

**Patterns to follow:** `writeDbPointer` in `src/db/paths.ts` for a small best-effort file write.

**Test scenarios:**
- Covers AE3. Opening a database in a fresh `.e2e/` folder creates `.e2e/.gitignore` with content `*`.
- Opening a database when `.e2e/.gitignore` already exists with other content leaves the file unchanged.
- Opening a database at a `--db` path in a folder not named `.e2e` writes no `.gitignore`.
- Covers AE4. `findProjectDir` from a nested subfolder returns the root when the root holds only `e2e-suite/`.
- `findProjectDir` still returns the root when it holds only `.e2e/`, and returns undefined when neither folder exists up to the filesystem root.
- Integration: in a temp git repo, after a database opens in `.e2e/`, `git status --porcelain` lists nothing under `.e2e/`.

**Verification:** A new project's `.e2e/` never appears in `git status`.

### U2. Move shared defaults to `e2e-suite/`

**Goal:** Every command reads and writes scenarios, presets and the agent kit under `e2e-suite/` by default.

**Requirements:** R1, R8. Key Decisions on the shared folder, the folder name and presets.

**Dependencies:** U1.

**Files:**
- Modify `src/config.ts` (default `scenarios`, in both `loadConfig` and `starterConfig`)
- Modify `src/init.ts` (seeded `dev` environment `scenarios` value, smoke file path, doc comments)
- Modify `src/wizard.ts` (environment defaults, smoke scaffold path)
- Modify `src/agent-save.ts` (the in-memory config's `scenarios`)
- Modify `src/scenario.ts`, `src/export.ts` (presets folder becomes `<project>/e2e-suite/presets`)
- Modify `src/agent-kit.ts`, `src/agent-kit-text.ts` (kit folder becomes `e2e-suite/agent`)
- Modify `src/cli.ts` (help text for `init` and `kit`)
- Modify `test/init.test.ts`, `test/wizard.test.ts`, `test/export.test.ts`, `test/agent-kit.test.ts`, `test/config.test.ts`

**Approach:**
1. Replace each shared default with a path built from U1's module. `results`, `flows`, `modules`, drafts and the database stay on `.e2e` (KTD6).
2. Remove the root `presets/` path entirely; per R8 nothing reads the old location.
3. Leave the `FORBIDDEN` text in `src/agent-kit-text.ts` naming `.e2e/e2e.db` as is: it is still where the database lives.

**Patterns to follow:** Existing `resolveFromConfig(config, config.scenarios)` resolution; keep paths relative to `configDir`.

**Test scenarios:**
- Covers AE1. `initProject` in an empty folder creates `e2e-suite/scenarios/smoke.json` and stores `scenarios: "e2e-suite/scenarios"` on the `dev` environment.
- `exportToJson` writes scenarios to `e2e-suite/scenarios/<id>.json` and presets to `e2e-suite/presets/<id>.json`.
- `checkExport` reports a preset file in `e2e-suite/presets/` with an unknown id as stale.
- The one-time preset import reads `e2e-suite/presets/*.json`, and a `presets/` folder at the project root is ignored.
- `writeAgentKit` writes `e2e-suite/agent/kit.md` and `e2e-suite/agent/vocabulary.json`, and the root `AGENTS.md` block names those paths.
- `loadConfig` with an environment that sets no `scenarios` value resolves to `e2e-suite/scenarios`.

**Verification:** No default for a shared file in `src/` still points under `.e2e/`.

### U3. Detect ignore rules that hide the suite

**Goal:** `init`, `export` and `kit` warn, and `export --check` fails, when any git ignore rule hides `e2e-suite/` or a file in it.

**Requirements:** R4, R5, R6. KTD2, KTD3.

**Dependencies:** U1.

**Files:**
- Create `src/suite-ignore.ts`
- Modify `src/export.ts` (`ExportDrift.ignored`)
- Modify `src/cli.ts` (warning output for `init`, `export`, `kit`; `ignored` lines and exit code for `export --check`)
- Create `test/suite-ignore.test.ts`
- Modify `test/export.test.ts`

**Approach:**
1. `src/suite-ignore.ts` exports one function: given a project folder and optional extra paths, it lists the suite folder (passed with a trailing slash, so directory-only rules such as `e2e-suite/` match before the folder exists), every file under it, and the extra paths, asks git per KTD2, and returns each hidden path with the rule, its source file and line. It returns an empty list outside a repo or without `git`.
2. `checkExport` fills `ignored` from that function, passing the files an export would write as extra paths, so a rule like `*.json` is caught even before any file exists.
3. The CLI prints one warning per rule (not per file), naming `source:line`, the pattern, and the fix: remove or narrow the rule. `export --check` prints the same lines as `ignored` entries and counts them toward exit 1.

**Execution note:** Tests run real `git` in a temp folder (`git init`); do not mock `spawnSync`.

**Patterns to follow:** `unfinishedGitOperation` in `src/preflight.ts` for `spawnSync("git", ...)` and its not-a-repo handling; `staleFiles` in `src/export.ts` for walking a folder.

**Test scenarios:**
- A root rule `e2e-suite/` (directory-only) is reported even when `e2e-suite/` does not exist yet.
- Covers AE2. In a temp repo whose root `.gitignore` has `e2e-suite`, the function returns the folder with source `.gitignore`, line 1 and pattern `e2e-suite`.
- Covers AE2. `checkExport` in that repo returns a non-empty `ignored` list while `missing`, `changed` and `stale` are empty.
- A root rule `*.json` hides the scenario files but not the folder; the function returns those files under the `*.json` rule.
- A rule in `.git/info/exclude` is reported with that file as its source.
- A repo with no matching rule returns an empty list.
- Covers AE5. A folder outside any git repo returns an empty list and raises no error.
- Zomilabu's old rule `.e2e` does not hide `e2e-suite/` and yields no warning.

**Verification:** In zomilabu's setup with the new layout and its current `.e2e` rule, `e2e export --check` passes; adding an `e2e-suite` rule makes it exit 1 naming the rule.

### U4. UI defaults for the scenarios folder

**Goal:** Environment forms in the UI suggest `e2e-suite/scenarios`.

**Requirements:** R1.

**Dependencies:** U2.

**Files:**
- Modify `ui/src/components/EnvironmentModal.tsx` (default and placeholder for scenarios)
- Modify `ui/src/views/config/useEnvironmentProfile.ts` (fallback scenarios path)
- Modify `test/ui/config.test.ts`

**Approach:** Change only the scenarios defaults and placeholders. Results, flows, modules and database fields keep `.e2e` values (KTD6).

**Test scenarios:**
- Opening the new-environment form shows `e2e-suite/scenarios` as the scenarios default.
- Saving an environment without editing that field stores `e2e-suite/scenarios`.

**Verification:** The UI smoke test passes with the new default.

### U5. Domain docs

**Goal:** `docs/domain/` describes the new layout, the self-ignoring local folder and the ignore check.

**Requirements:** R9.

**Dependencies:** U2, U3.

**Files:**
- Modify `docs/domain/scenarios.md` (section 3 presets path; section 4 export, drift check with `ignored`, import paths; the kit paragraph that says agents read root files "even when `.e2e/` is gitignored")
- Modify `docs/domain/environments.md` (defaults table)
- Modify `docs/domain/README.md` (storage overview naming `.e2e/` vs `e2e-suite/`)
- Modify `docs/domain/fixtures.md` (scripts live in `e2e-suite/fixtures/`; secrets go in `.e2e/` env files)

**Approach:** Describe current behavior only; no migration notes (R8).

**Test expectation:** none -- documentation only.

**Verification:** No doc under `docs/domain/` names `.e2e/scenarios`, `.e2e/agent` or a root `presets/` folder as current behavior.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Format and lint | `pnpm exec biome check --write`, then `pnpm run lint` | every unit with code |
| Types, size budget, boundary, unit tests | `pnpm run check` | U1, U2, U3 |
| UI smoke tests | `pnpm run test:ui` | U4 |
| Consumer check | In zomilabu, after its clean re-init: `git status` shows `e2e-suite/` files and nothing under `.e2e/`; `e2e export --check` exits 0 | after U3 |

Do not run `opennextjs-cloudflare` builds; they do not apply to this repo.

---

## Definition of Done

- R1 through R9 hold, and AE1 through AE5 each have a passing test or a recorded consumer check.
- `pnpm run check` and `pnpm run test:ui` pass.
- `grep -rn '\.e2e/\(scenarios\|agent\|presets\)' src ui/src` returns nothing.
- `docs/domain/` matches the shipped layout (U5).
- No dead code from abandoned approaches remains in the diff.
