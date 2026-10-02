## AI Skills

- Use the `andrej-karpathy-skills:karpathy-guidelines` skill whenever it is available and relevant: writing, reviewing, or refactoring code, and planning non-trivial changes. Follow its principles: think before coding (state assumptions, surface tradeoffs), simplicity first, surgical changes, and goal-driven verification. Skip it for trivial tasks where it adds nothing.
- Use the Firecrawl MCP (`mcp__firecrawl__*`) for web work whenever it is available, instead of `WebFetch`/`WebSearch`: `firecrawl_search` to find docs, changelogs, and error fixes (add `categories: ["developer"]` for programming questions); `firecrawl_scrape` to read one known URL; `firecrawl_map` or `firecrawl_crawl` to discover or collect pages from one site; `firecrawl_agent` for multi-source research. Firecrawl cannot reach `localhost` or private URLs, so use local tools for the dev server. Never put secrets, tokens, API keys, or user data in Firecrawl queries or URLs.
- `docs/solutions/` holds documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). It is relevant when implementing or debugging in a documented area.
- After a solved, verified problem, offer once to invoke the `ce-compound` skill at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not offer. Completion, effort, and diff size alone are not enough. Offer at the checkpoint so a qualifying learning can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.
- Write every report, summary, or handoff to the user through the `ce-noslop` skill. This applies when you are the top-level agent writing to the user, not when you are a subagent reporting to its caller. Do not apply it to code, config, verbatim quotes, or text the user asked to post as written.

---

## Branching & Commit Workflow
- **Two Standard Branches**: This repository maintains two core branches:
  - `main`: Production-ready code.
  - `development`: Active integration and development baseline.
- **MANDATORY Feature & Bugfix Branching Rule**:
  - Whenever implementing a new feature, improvement, refactor, or bug fix, **NEVER commit directly to `development` or `main`**.
  - **ALWAYS create a new branch branching off `development`**:
    1. Update local `development`: `git checkout development && git pull origin development`
    2. Create a dedicated branch from local `development`: `git checkout -b feat/<name> development` or `git checkout -b fix/<name> development`
       Never branch straight from `origin/development` (e.g. `git checkout -b <branch> origin/development`): that skips updating local `development` and sets the new branch to track `origin/development`. Always check out local `development`, pull, then branch from it.
    3. Develop, test, and commit changes on this branch.
    4. Before merging, run the simplify review in [SIMPLIFY.md](SIMPLIFY.md).
    5. Once tested and complete, rebase the branch on `development` and merge it with `git merge --ff-only` (or open a PR for review).
  - **Promotion Pipeline**: `feature/fix branch` -> `development` -> `main`.
- **Fast-Forward Only (linear history)**: Every commit originates on a feature/fix branch and enters through `development`. `main` never gets commits of its own: no merge commits, version bumps, hotfixes, or CI tweaks made directly on it.
  - Promote with fast-forward only:
    ```bash
    git checkout main && git pull origin main && git merge --ff-only origin/development && git push origin main
    ```
  - Before promoting, check the target has nothing the source lacks: `git log --oneline origin/development..origin/main` must be empty. If not, stop: bring those commits into `development` through a branch first, then promote. Never create a merge commit to get past it.
  - Release prep (version bumps, changelogs) is a normal branch into `development` (e.g. `chore/release-<version>`), then promoted. Release tags go on the promoted commit.
  - If `--ff-only` fails, stop and report. Never fall back to a plain merge, rebase a shared branch, or force-push `development` or `main`.
- **Delete Merged Branches**: After a feature/fix branch is merged into `development` and pushed, delete it locally and on origin:
  ```bash
  git branch -d <branch> && git push origin --delete <branch>
  ```
  Use `-d`, not `-D`, so git refuses unmerged branches. Never delete `main` or `development`. A branch with no commits of its own shows as merged; check `git status` in its worktree for uncommitted work before deleting it.
- **Commit Workflow**:
  - When user says "commit", use `caveman:caveman-commit` skill to write the commit message.
  - **Do NOT add `Co-Authored-By` trailers**.
  - Keep subject lines concise (≤50 characters), Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.).

---

## Time Estimates

- You are an AI agent, not a human developer. Estimate the time you will actually spend: agent wall-clock time for edits, tool calls, builds, test runs and device runs. Never quote human coding hours or days.
- Name what takes the time, e.g. "about 5 minutes: 3 file edits, then `pnpm run check`", not "an afternoon". Builds, test suites, emulator runs and deploy waits usually dominate, not writing code.
- List time that needs the user (reviews, approvals, a physical device, store or console steps) separately, and say it is theirs.