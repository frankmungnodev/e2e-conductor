## AI Skills

- Use the Firecrawl MCP (`mcp__firecrawl__*`) for web work whenever it is available, instead of `WebFetch`/`WebSearch`: `firecrawl_search` to find docs, changelogs, and error fixes (add `categories: ["developer"]` for programming questions); `firecrawl_scrape` to read one known URL; `firecrawl_map` or `firecrawl_crawl` to discover or collect pages from one site; `firecrawl_agent` for multi-source research. Firecrawl cannot reach `localhost` or private URLs, so use local tools for the dev server. Never put secrets, tokens, API keys, or user data in Firecrawl queries or URLs.
- **Linting & Quality Checks**: After touching or modifying code, ALWAYS immediately run `pnpm exec biome check --write` followed by `pnpm run check` (or `pnpm run lint`). Resolve any lint errors, warnings, or formatting/import diagnostics immediately before proceeding to the next step, concluding, or committing. Never skip running Biome after file edits.
- `docs/solutions/` holds documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). It is relevant when implementing or debugging in a documented area.
- After a solved, verified problem, offer once to invoke the `ce-compound` skill at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not offer. Completion, effort, and diff size alone are not enough. Offer at the checkpoint so a qualifying learning can ship in the merge that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.
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

## Code Organization

- **One concept per file**: Split code by domain concept (environments, platforms, scenarios, runs), not by layer. An agent working on one concept should only need to open that concept's files.
- **~500-line budget**: Keep source files under about 500 lines. `pnpm run check:size` (part of `pnpm run check`) warns about files over the budget under `src/` and `ui/src/`. It never fails the check, but treat a warning as a prompt to split before adding more.
- **UI smoke tests**: After changing anything under `ui/src/`, run `pnpm run test:ui`. It builds the UI and drives the main flows of each view in headless Chromium against a seeded temp project. It is not part of `pnpm run check`, but the pre-push hook in `.githooks/pre-push` runs it before every push (`pnpm install` enables the hook).
- **Where things live**:
  - `src/db/<concept>.ts`: SQLite access; the schema is in `src/db/connection.ts`.
  - `src/server/routes/<resource>.ts`: HTTP endpoints; `src/server.ts` only starts the server and dispatches.
  - `ui/src/views/<view>/`: one folder per screen, holding its parent component, child components, hooks, and helpers.
  - `ui/src/components/`: shared primitives only (`Button`, `Modal`, `Select`, ...).
- **Direct imports**: Import from the module that defines a symbol. Do not add index or re-export files.
- **New endpoints**: Add a `{ match, handle }` entry to the resource's route module. Do not add routes in `src/server.ts`.
- **Server state**: Read and assign `state.config`, `state.activeRun`, and the other `ServerState` fields directly in route handlers. Never copy them into locals, because config reloads and the background run task replace them while requests are in flight.
- **UI logic**: Put a view's state and handlers in hooks, and its computations in pure helpers, inside the view's folder. Give each pure helper unit tests under `test/` so they run in `pnpm run check`.
- **Smoke-test locators**: Find elements by role, label, or visible text, and find a dialog by its heading (`getByRole("dialog").filter({ has: heading })`). A closing dialog can still be on screen when the next one opens.

---

## UI & Component Conventions

- **Respect `DESIGN.md`**: All UI and design conventions, component rules, layout hierarchy, forms, modals, and typography guidelines are documented in [DESIGN.md](DESIGN.md). When designing or implementing UI components, forms, views, or copy, always consult and strictly adhere to [DESIGN.md](DESIGN.md).

---

## Branching & Commit Workflow

- **Two Standard Branches**: This repository maintains two core branches:
  - `main`: Production-ready code.
  - `development`: Active integration and development baseline, and the GitHub default branch. Feature and fix branches start from it.
- **Never commit directly to `development` or `main`**: Every change goes through a feature or fix branch, merged locally into its target (see Local Merge below).
- **Promotion Pipeline**: `feature/fix branch` -> `development` -> `main`.
- **Local Merge, No PR by Default**: Do not open a pull request, and do not push a feature or fix branch, unless the user asks for one in the current request. This is the project's shipping process: it replaces `ce-commit-push-pr` and the PR/babysit tail of `ce-work`, `lfg`, and other CE skills. When the work on a branch is done and verified:
  1. Commit on the feature branch.
  2. Switch to the target branch (the branch the feature branch was cut from, usually `development`) and merge fast-forward only: `git switch <target> && git merge --ff-only <branch>`. If that fails, rebase the feature branch onto the target first (`git rebase <target> <branch>`), rerun the checks, and merge again. Never create a merge commit.
  3. Delete the local feature branch: `git branch -d <branch>`.
  4. Do not push the target branch unless the user asks. Say in one line that the merge is local and unpushed.
  - A code review (`ce-code-review`) still runs before the merge when a CE skill calls for one; it reviews the local branch against its target.
  - When the user does ask for a PR, push the branch and open the PR against its target, as before.
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