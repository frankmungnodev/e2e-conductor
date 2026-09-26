## AI Skills

- Use the Firecrawl MCP (`mcp__firecrawl__*`) for web work whenever it is available, instead of `WebFetch`/`WebSearch`: `firecrawl_search` to find docs, changelogs, and error fixes (add `categories: ["developer"]` for programming questions); `firecrawl_scrape` to read one known URL; `firecrawl_map` or `firecrawl_crawl` to discover or collect pages from one site; `firecrawl_agent` for multi-source research. Firecrawl cannot reach `localhost` or private URLs, so use local tools for the dev server. Never put secrets, tokens, API keys, or user data in Firecrawl queries or URLs.
- **Linting & Quality Checks**: After touching or modifying code, ALWAYS immediately run `pnpm exec biome check --write` followed by `pnpm run check` (or `pnpm run lint`). Resolve any lint errors, warnings, or formatting/import diagnostics immediately before proceeding to the next step, concluding, or committing. Never skip running Biome after file edits.
- `docs/solutions/` holds documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). It is relevant when implementing or debugging in a documented area.
- After a solved, verified problem, offer once to invoke the `ce-compound` skill at the completion checkpoint only when the work produced durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? If not, do not offer. Completion, effort, and diff size alone are not enough. Offer at the checkpoint so a qualifying learning can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.
- Write every report, summary, or handoff to the user through the `ce-noslop` skill. This applies when you are the top-level agent writing to the user, not when you are a subagent reporting to its caller. Do not apply it to code, config, verbatim quotes, or text the user asked to post as written.

---

## UI & Component Conventions

- **`Tabs` & `TabButton`**:
  - Segmented pill tabs (`variant="pills"`) for sub-resource navigation. All tabs MUST be combined and synchronized with URL query parameters (e.g. `?tab=...`).
- **Badges**:
  - Every badge text MUST be capitalized using Title Case (capitalize the first character of each word, e.g. `Passed`, `Failed`, `Running`, `Idle`, not all-caps) across all screens and components.

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