# Changelog

All notable changes to this project are listed here. The project follows [Semantic Versioning](https://semver.org/). Before 1.0.0, a minor version can contain breaking changes.

## [Unreleased]

### Added

- `e2e-conductor platform add <name> --type api|web|android --url <url>` (or `--app-id` for Android) adds a platform to every environment and refreshes the agent kit. It never changes an existing platform. The agent kit tells agents to use it, after confirming the URL with the person, when a scenario needs a target the project does not have.

### Changed

- `e2e-conductor init` creates only the `dev` environment, and marks it as allowing drafts, so an agent's first drafts can run without a trip to the UI. It no longer adds an `api` platform at `http://localhost:3000` or a smoke scenario in `e2e-suite/scenarios/smoke.json`, since neither matches most apps. Existing projects are not affected: `init` still skips a database that already has an environment. `e2e-conductor init -i` is unchanged.
- The Drafts tab is a compact list. Each draft is one line with its status, targets and step count; click it to read its steps. A failed draft shows the failing step and message on its line. Run controls appear once, at the top, and Edit in Builder and Discard moved into a menu on each draft. With no drafts, the tab shows short steps to the first one.
- The agent kit block in `AGENTS.md` and `CLAUDE.md` now sits between `<!-- e2e-conductor-kit:start -->` and `<!-- e2e-conductor-kit:end -->`.
- `GET /api/drafts` adds `lastRun.failure` (step, name and message) for a draft whose last run failed, and `GET /api/run/status` adds `lastSuiteSummary`.

### Fixed

- The header showed `v0.2.0` whatever the installed version. It now shows the package version.
- The header's scenario count included drafts. It now counts kept scenarios only.
- A failing draft batch turned the header to "Last Run Failed". The header now reports only runs that are not draft runs.

### Upgrading from 0.4.0

Run `npx e2e-conductor kit` once. It replaces the block between the old `e2e-kit:` markers with one between the new markers, in place. If a file already has both, the old block is removed.

## [0.4.0] - 2026-10-15

### Breaking changes

- The command is now `e2e-conductor`, not `e2e`. A different npm package is named `e2e`, so `npx e2e` without a local install ran that package instead of this one.

### Upgrading from 0.3.0

1. Replace `e2e` with `e2e-conductor` in your scripts, CI and package.json `scripts`.
2. Run `npx e2e-conductor kit` to update the agent kit in `e2e-suite/agent/` and the block in `AGENTS.md` and `CLAUDE.md`. The old block is replaced in place.

## [0.3.0] - 2026-10-15

First release on npm.

- Run one JSON scenario across HTTP APIs, web apps (Playwright) and Android apps (adb). Steps name targets, and the active environment decides where each target points.
- Web dashboard (`e2e ui`) to set up environments and platforms, build scenarios and read reports.
- Preflight checks for services and devices, with `--start` to start services that are down.
- Failure evidence: web traces, HTTP requests and responses, Android screenshots, device logs and view hierarchies, lined up on one timeline in Reports.
- Step run history and flaky step marks in the builder, `--repeat` to find flaky steps and `--strict` to fail on recovered steps.
- Agent-written scenarios: `e2e kit` writes the agent kit, `e2e save` stores agent files as drafts, and the Drafts tab reviews, runs and keeps them.
- `e2e export` and `e2e import` move scenarios between SQLite and JSON files in `e2e-suite/`; `export --check` catches drift.

[0.4.0]: https://github.com/frankmungnodev/e2e-conductor/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/frankmungnodev/e2e-conductor/releases/tag/v0.3.0
