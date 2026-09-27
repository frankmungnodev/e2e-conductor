## AI Skills

- Use the Firecrawl MCP (`mcp__firecrawl__*`) for web work whenever it is available, instead of `WebFetch`/`WebSearch`: `firecrawl_search` to find docs, changelogs, and error fixes (add `categories: ["developer"]` for programming questions); `firecrawl_scrape` to read one known URL; `firecrawl_map` or `firecrawl_crawl` to discover or collect pages from one site; `firecrawl_agent` for multi-source research. Firecrawl cannot reach `localhost` or private URLs, so use local tools for the dev server. Never put secrets, tokens, API keys, or user data in Firecrawl queries or URLs.
- **Linting & Quality Checks**: After touching or modifying code, ALWAYS immediately run `pnpm exec biome check --write` followed by `pnpm run check` (or `pnpm run lint`). Resolve any lint errors, warnings, or formatting/import diagnostics immediately before proceeding to the next step, concluding, or committing. Never skip running Biome after file edits.
- `docs/solutions/` holds documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). It is relevant when implementing or debugging in a documented area.
- After a solved, verified problem, offer once to invoke the `ce-compound` skill at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not offer. Completion, effort, and diff size alone are not enough. Offer at the checkpoint so a qualifying learning can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.
- Write every report, summary, or handoff to the user through the `ce-noslop` skill. This applies when you are the top-level agent writing to the user, not when you are a subagent reporting to its caller. Do not apply it to code, config, verbatim quotes, or text the user asked to post as written.

---

## Domain & Business Logic

- **Consult Domain Docs First**: Whenever the user discusses, plans, or requests changes relating to domain entities or business logic (environments, platforms, targets, services, fixtures, execution lifecycle):
  - Always read the relevant documentation in `docs/domain/` (`README.md`, `environments.md`, `platforms.md`, `fixtures.md`) before writing or suggesting changes.
- **Challenge Assumptions & Debate Tradeoffs**: Check requested changes against existing domain models, schemas, and invariants. Do not blindly implement modifications—surface tradeoffs, highlight constraints or potential conflicts, and debate architectural edge cases with the user.
- **Sync Documentation on Evolution**: Whenever domain business logic, SQLite schemas, or lifecycle semantics evolve or change, you MUST synchronously update the corresponding documentation under `docs/domain/` in the same turn/commit. Never leave domain docs outdated.

---

## Path & File References

- **Never Use Absolute System Paths or URIs**: NEVER output absolute paths or file URIs (such as `file:///Users/...`, `/Users/...`, or machine-specific paths) in documentation, commit messages, code comments, or conversational responses.
- **Always Use Relative Workspace Paths**: Always refer to project files and links using clean workspace-relative paths (e.g. `docs/domain/README.md`, `src/config.ts`, `ui/src/App.tsx`).

---

## UI & Component Conventions

- **`Tabs` & `TabButton`**:
  - Segmented pill tabs (`variant="pills"`) for sub-resource navigation. All tabs MUST be combined and synchronized with URL query parameters (e.g. `?tab=...`).
  - **Tab Icon Color Compatibility**: If a tab uses an icon, ensure the icon color is compatible with the tab's selected/active state. For `variant="pills"` tabs, the active state uses `bg-primary text-white`. Never hardcode `text-primary` or colors matching the active background without handling the active state (e.g. use conditional classes like `active ? "text-white" : "text-primary"` or omit explicit text color classes so the icon inherits `currentColor`/`text-white` when selected). An icon must never become invisible or blend into the active tab background.
- **Badges**:
  - Every badge text MUST be capitalized using Title Case (capitalize the first character of each word, e.g. `Passed`, `Failed`, `Running`, `Idle`, not all-caps) across all screens and components.
- **Typography & Accessible Font Sizes**:
  - **Minimum Font Size (12px / `text-xs`)**: In accordance with WCAG and global accessibility standards, the absolute minimum font size anywhere in the UI is **12px (`text-xs`)**. NEVER use arbitrary sub-12px classes (such as `text-[9px]`, `text-[10px]`, or `text-[11px]`) for labels, helper text, captions, or descriptions. Secondary/meta text must be at least `text-xs` (12px) with compliant contrast (`text-fg-muted` or `text-fg`).
- **Layout Hierarchy: Titles & Descriptions**:
  - Whenever a section, card, form control, or header includes both a title/label and a description/hint, they **MUST be stacked vertically in a column** (e.g. `flex flex-col gap-0.5` or `flex flex-col gap-1`), **NEVER placed side-by-side in a horizontal row** (`flex-row` / `justify-between`).
  - Side-by-side placement causes awkward line wraps, horizontal collisions, and weak visual hierarchy. Supporting descriptions belong directly underneath their respective titles. Any associated action buttons (e.g. "Manage", "Add") should be aligned to the right of the header container while keeping the title and description vertically grouped together on the left.
- **Clean, Human-Centric Copy (No Internal Jargon)**:
  - NEVER expose internal runtime implementation details, scoping namespaces, or compiler prefixes (such as `ctx.`, `scope.`, `raw.`, `vars.`, or `json_match`) in user-facing UI labels, descriptions, subtitles, or placeholders (e.g. NEVER write "Reference in steps as ${ctx.varName}" or "Bearer ${ctx.token}"). Always use plain, natural, user-centric terminology (e.g. "Scenario Variables", "Default values and variables used throughout this scenario").
- **Forms & Modals**:
  - Prefer NOT to use modals for forms. Use in-page forms, inline panels, split-pane detail views, inline card expansions, or direct in-place editing instead of popping up modals.
  - If a modal and form combined is strictly necessary (e.g. initial setup onboarding or critical blocking dialogs), the maximum number of columns for form inputs inside the modal MUST be 2 (NEVER 3 or more text inputs horizontally side-by-side; 3 horizontal text inputs look cramped and ugly).

---

## Branching & Commit Workflow

- **Two Standard Branches**: This repository maintains two core branches:
  - `main`: Production-ready code.
  - `development`: Active integration and development baseline, and the GitHub default branch. CE skills (`ce-work`, `ce-worktree`, `ce-commit`, `ce-commit-push-pr`, `lfg`) branch from it and open PRs against it.
- **Never commit directly to `development` or `main`**: Every change goes through a feature or fix branch and a PR into `development`.
- **Promotion Pipeline**: `feature/fix branch` -> `development` -> `main`.
- **Fast-Forward Only (linear history)**: `main` never gets commits of its own: no merge commits, version bumps, hotfixes, or CI tweaks made directly on it.
  - Promote with fast-forward only:
    ```bash
    git checkout main && git pull origin main && git merge --ff-only origin/development && git push origin main
    ```
  - Before promoting, check the target has nothing the source lacks: `git log --oneline origin/development..origin/main` must be empty. If not, stop: bring those commits into `development` through a branch first, then promote. Never create a merge commit to get past it.
  - Release prep (version bumps, changelogs) is a normal branch into `development` (e.g. `chore/release-<version>`), then promoted. Release tags go on the promoted commit.
  - If `--ff-only` fails, stop and report. Never fall back to a plain merge or force-push `development` or `main`.
- **Commits**: **Do NOT add `Co-Authored-By` trailers**.

---

## Time Estimates

- You are an AI agent, not a human developer. Estimate the time you will actually spend: agent wall-clock time for edits, tool calls, builds, test runs and device runs. Never quote human coding hours or days.
- Name what takes the time, e.g. "about 5 minutes: 3 file edits, then `pnpm run check`", not "an afternoon". Builds, test suites, emulator runs and deploy waits usually dominate, not writing code.
- List time that needs the user (reviews, approvals, a physical device, store or console steps) separately, and say it is theirs.