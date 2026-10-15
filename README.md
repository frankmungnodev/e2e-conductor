# e2e-conductor

Run one JSON scenario across HTTP APIs, web apps (Playwright) and Android apps (adb).

A scenario is a list of steps. Each step names a target, such as `api`, `web` or `mobile`, never a URL, port or device serial. The active environment (`dev`, `staging`, `prod`) decides where each target points, so the same scenario runs against any environment.

Before a run, e2e-conductor checks that the services each scenario needs are up and that Android devices are connected. It can start services that are down and run fixtures that seed data. Every step attempt is recorded, and failures keep their evidence: web traces, HTTP requests and responses, and Android screenshots, logs and view hierarchies.

## Requirements

- Node.js 22.13 or later (the tool uses the built-in `node:sqlite`)
- For web steps: a Playwright browser. Install it once with `npx playwright install chromium`
- For Android steps: `adb` on your `PATH` and a connected device or emulator

## Install

```bash
npm install --save-dev e2e-conductor
```

## Quick start

```bash
npx e2e-conductor init  # local database in .e2e/ and a starter scenario in e2e-suite/scenarios/smoke.json
npx e2e-conductor ui    # open the web dashboard to set up environments and platforms, and build scenarios
npx e2e-conductor run   # run every scenario against the active environment
```

### Upgrading from 0.3.0

The command is now `e2e-conductor`, not `e2e`. A different npm package is named `e2e`, so `npx e2e` without a local install ran that package instead of this one. Replace `e2e` with `e2e-conductor` in your scripts and CI, then run `npx e2e-conductor kit` to update the agent kit and the block in `AGENTS.md` and `CLAUDE.md`.

`e2e-conductor init -i` asks about your services step by step instead of writing a default setup with one `api` service at `http://localhost:3000`. `e2e-conductor check` confirms that services are up and devices are connected without running anything.

## Commands

| Command | What it does |
|---|---|
| `e2e-conductor run` | Run scenarios (the default command) |
| `e2e-conductor check` | Preflight only: services, devices, installed apps |
| `e2e-conductor list` | List scenarios and validate them |
| `e2e-conductor export` | Write scenarios and step presets from the database to JSON files in `e2e-suite/` |
| `e2e-conductor import` | Save scenario JSON files into the database, replacing changed ones |
| `e2e-conductor init` | Create the local database and a starter scenario |
| `e2e-conductor save` | Check scenario files written by a coding agent and store them as drafts |
| `e2e-conductor kit` | Write the agent kit to `e2e-suite/agent/` and its block in `AGENTS.md` and `CLAUDE.md` |
| `e2e-conductor ui` | Start the web dashboard (default `http://127.0.0.1:4173`) |

Common options: `-e, --env <name>` picks the environment, `-s, --scenario <text>` filters scenarios by file name, `-r, --repeat <n>` repeats each scenario to find flaky steps, `--start` starts services that are down, and `--headless` hides the browser. Run `e2e-conductor --help` for the full list.

## Project layout

- `e2e-suite/` is tracked in git: scenarios, step presets, the agent kit, and fixture scripts. This is what your team reviews.
- `.e2e/` stays on one machine and is ignored by git: the SQLite database, run results and artifacts, agent drafts, and env files. Environments and platforms live in the database, so keep secrets in `.e2e/` env files, never in `e2e-suite/`.

## Scenario schema

Scenario files can point at the bundled JSON Schema for editor validation and completion:

```json
{ "$schema": "../../node_modules/e2e-conductor/schema/v1/scenario.schema.json" }
```

`e2e-conductor init` writes this path for you.

## License

MIT
