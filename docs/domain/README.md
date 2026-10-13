# Domain Architecture

This directory documents the core domain models and business rules of `e2e-orchestrator`.

The orchestrator decouples **test declarations** (scenarios and steps) from **target infrastructure** (hostnames, devices, daemons) and records granular execution telemetry using core pillars stored in SQLite (`.e2e/e2e.db`, managed via the `src/db/` modules, one per entity, with the schema in `src/db/connection.ts`):

| Domain Entity | Scope & Purpose | Persistence | Documentation |
|---|---|---|---|
| **[Environments](./environments.md)** | Target deployment contexts (`dev`, `staging`, `prod`), variable injection (`${env.VAR}`), and path routing. | `environments` table & `settings` pointers | [`environments.md`](./environments.md) |
| **[Platforms](./platforms.md)** | Target surfaces (`web`, `android`, `api`) compiled into drivers and background services. | `platforms` & `env_platform` tables | [`platforms.md`](./platforms.md) |
| **[Fixtures](./fixtures.md)** | Deterministic pre-test setup hooks (database seeding, cache resets, auth setup). | `fixtures` table & TypeScript modules | [`fixtures.md`](./fixtures.md) |
| **[Scenarios & Steps](./scenarios.md)** | Test specifications, declarative execution steps, assertions, extraction rules, and target driver bindings. | `scenarios`, `scenario_steps`, & `step_groups` tables | [`scenarios.md`](./scenarios.md) |
| **[Runs & Step Runs](./runs.md)** | Test execution sessions, per-step timing, attempts/retries, status outcomes, and telemetry. | `runs` & `step_runs` tables | [`runs.md`](./runs.md) |

---

## Project Layout: Shared Suite and Local State

A project keeps its files in two folders at its root, split by who owns them (`src/project-layout.ts`):

- **`e2e-suite/` (tracked in git)**: what the team shares and reviews in pull requests. `scenarios/<id>.json` and `presets/<id>.json` (written by an export), `agent/` (written by `e2e kit`), and `fixtures/` for fixture scripts, by convention only: nothing scaffolds it.
- **`.e2e/` (ignored by git)**: what belongs to one machine. The database `e2e.db`, run results, agent draft files in `drafts/<group>/`, env files and snapshots that fixtures write, and the legacy `flows/` and `modules/` folders. Opening a database in a folder named `.e2e` writes `.e2e/.gitignore` with `*` when the file is missing (`openDatabase` in `src/db/connection.ts`), so git ignores the folder and that file without any rule in the project's own `.gitignore`. A `.gitignore` the person already has there is kept. A `--db` file outside a `.e2e` folder gets no `.gitignore`.

A project is the nearest folder upward that holds either folder (`findProjectDir` in `src/db/paths.ts`), so a fresh clone with only `e2e-suite/` works before any database exists. Older locations (`.e2e/scenarios/`, `.e2e/agent/`, a `presets/` folder at the project root) are not read.

When a git ignore rule hides `e2e-suite/` or a file in it, `e2e init`, `e2e export` and `e2e kit` warn once per rule, and `e2e export --check` fails (`scenarios.md`, section 4). Secrets belong in `.e2e/` env files, never in `e2e-suite/fixtures/` scripts, which are committed.

---

## Relational Data Model

All configuration and execution entities live in SQLite (`src/db/`, one module per entity; schema in `src/db/connection.ts`). Relationships:

- `environments` (1) ── (N) `env_platform` (N) ── (1) `platforms`
  - `env_platform` acts as a junction table storing per-environment overrides (sparse inheritance).
- `fixtures`: Independent setup commands referenced by name in `scenario.setup`.
- `scenarios` (1) ── (N) `scenario_steps`
  - `scenario_steps` belongs to a scenario with cascading deletion (`ON DELETE CASCADE`) and explicit `order_num` sequencing.
- `step_groups`: Reusable modular step sequences saved in SQLite for instant composition across scenarios.
- `runs` (1) ── (N) `step_runs`
  - `step_runs` records per-attempt results for each step with cascading deletion (`ON DELETE CASCADE`).
- `settings`: Key-value store tracking `active_environment` and `default_environment`.

Run history and test outcomes are persisted both in SQLite tables (`runs`, `step_runs`) for instant querying and as execution artifacts under the results directory (`.e2e/results/artifacts/<runId>`, `summary.json`, and `run.log`).

---

## Execution Lifecycle

When running a scenario (`e2e run` or `POST /api/run`):

1. **Config Resolution** (`loadConfig` in `src/config.ts`): Resolves active environment, applies variable precedence, and compiles active platforms into executable `targets` and `services`.
2. **Preflight** (`src/preflight.ts`): Validates that required services are responsive and Android devices are connected. Starts offline services if configured.
3. **Run Initialization** (`src/runner.ts`): Inserts a `runs` row with `status = "RUNNING"` in SQLite.
4. **Fixture Setup** (`runFixture` in `src/scenario-run.ts`): Executes hooks listed in `scenario.setup` sequentially. Halts immediately on failure.
5. **Step Execution** (`runScenario` in `src/scenario-run.ts`): Dispatches scenario steps in `order_num` sequence to compiled target drivers (`web`, `mobile`, `http`, `shell`). Records each execution attempt into `step_runs`. A GUI run started with **Pause on Failure** holds a failed step open for the user to fix and retry (see `runs.md`).
6. **Result Recording**: Labels each final failure (`Environment down`, `Assertion failed`, `Step error`) after re-checking services and devices, stops the run when the environment is down, finalizes the `runs` record with outcome (`PASSED`, `FAILED`, or `CANCELLED`) plus stop reason and recovered, fixed and not-run counts (see `runs.md`), writes structured summary to `summary.json`, streams execution logs to `run.log`, and saves failure evidence (web traces, HTTP requests and responses, Android screenshots, device logs and view hierarchies) under `.e2e/results/artifacts/<runId>/`, which Reports lines up with the step attempts on one failure timeline, plus one `step-<n>.png` per web and Android step when the run has **Screenshot Every Step** on (see `runs.md`).

---

## Core Invariants

1. **Exactly One Active Environment**: One environment is always active. Deleting the active environment automatically promotes the default or first alphabetical environment.
2. **Reserved Target `"shell"`**: The name `"shell"` is strictly reserved for the host terminal runner; no platform may use this name.
3. **Sparse Overrides**: Unspecified fields in `env_platform` fall back directly to base `platforms` values.
4. **Cascading Child Records**: Deleting a scenario cascades to its `scenario_steps`; deleting a run cascades to its `step_runs`.
5. **Fail-Fast Setup**: Any fixture failure immediately aborts the scenario before any test steps run.
6. **Decoupled Steps**: Scenario steps specify `target` (e.g. `"web"`), never raw URLs, ports, or device serials.
