## AI Skills

- Use the `andrej-karpathy-skills:karpathy-guidelines` skill whenever it is available and relevant: writing, reviewing, or refactoring code, and planning non-trivial changes. Follow its principles: think before coding (state assumptions, surface tradeoffs), simplicity first, surgical changes, and goal-driven verification. Skip it for trivial tasks where it adds nothing.
- Use the Firecrawl MCP (`mcp__firecrawl__*`) for web work whenever it is available, instead of `WebFetch`/`WebSearch`: `firecrawl_search` to find docs, changelogs, and error fixes (add `categories: ["developer"]` for programming questions); `firecrawl_scrape` to read one known URL; `firecrawl_map` or `firecrawl_crawl` to discover or collect pages from one site; `firecrawl_agent` for multi-source research. Typical uses: current Jetpack Compose, Material 3, Hilt, Room, AGP/Gradle, and Fastlane docs, release notes, and the public Play Store listing. Firecrawl cannot reach `localhost` or private URLs, so use local tools for the dev server. Never put secrets, tokens, API keys, or user data in Firecrawl queries or URLs.

## Git
- **Commit Workflow**:
  - When user says "commit", use `caveman:caveman-commit` skill to write the commit message.
  - **Do NOT add `Co-Authored-By` trailers**.
  - Keep subject lines concise (≤50 characters), Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.).
  
- **Pre-Merge Simplify Review**: Whenever you are about to merge a feature or fix branch into `development`, first remind the user to run the prompt in [SIMPLIFY.md](SIMPLIFY.md), then run it. Present findings and a cleanup plan. Delete nothing without the user's approval.

- **Delete Merged Branches**: After a feature/fix branch is merged into `development` and pushed, delete it locally and on origin:
  ```bash
  git branch -d <branch> && git push origin --delete <branch>
  ```
  Use `-d`, not `-D`, so git refuses unmerged branches. Never delete `main`, `staging`, or `development`. A branch with no commits of its own shows as merged; check `git status` in its worktree for uncommitted work before deleting it.


## Time Estimates

- You are an AI agent, not a human developer. Estimate the time you will actually spend: agent wall-clock time for edits, tool calls, builds, test runs and device runs. Never quote human coding hours or days.
- Name what takes the time, e.g. "about 5 minutes: 3 file edits, then `pnpm run check`", not "an afternoon". Builds, test suites, emulator runs and deploy waits usually dominate, not writing code.
- List time that needs the user (reviews, approvals, a physical device, store or console steps) separately, and say it is theirs.