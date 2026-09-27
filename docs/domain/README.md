# Domain Architecture

This directory documents the core domain models and business rules of `e2e-orchestrator`.

The orchestrator decouples **test declarations** (scenarios and steps) from **target infrastructure** (hostnames, devices, daemons) using three core pillars stored in SQLite (`.e2e/e2e.db`, managed via `src/db.ts`):

| Domain Entity | Scope & Purpose | Persistence | Documentation |
|---|---|---|---|
| **[Environments](./environments.md)** | Target deployment contexts (`dev`, `staging`, `prod`), variable injection (`${env.VAR}`), and path routing. | `environments` table & `settings` pointers | [`environments.md`](./environments.md) |
| **[Platforms](./platforms.md)** | Target surfaces (`web`, `android`, `api`) compiled into drivers and background services. | `platforms` & `env_platform` tables | [`platforms.md`](./platforms.md) |
| **[Fixtures](./fixtures.md)** | Deterministic pre-test setup hooks (database seeding, cache resets, auth setup). | `fixtures` table & TypeScript modules | [`fixtures.md`](./fixtures.md) |

---

## Relational Data Model

All configuration and run history live in SQLite (`src/db.ts`). Relationships:

- `environments` (1) ── (N) `env_platform` (N) ── (1) `platforms`
  - `env_platform` acts as a junction table storing per-environment overrides (sparse inheritance).
- `fixtures`: Independent setup commands referenced by name in `scenario.setup`.
- `settings`: Key-value store tracking `active_environment` and `default_environment`.
- `runs` (1) ── (N) `run_steps`: Historical execution logs and step outcomes.

---

## Execution Lifecycle

When running a scenario (`e2e run` or `POST /api/run`):

1. **Config Resolution** (`loadConfig` in `src/config.ts`): Resolves active environment, applies variable precedence, and compiles active platforms into executable `targets` and `services`.
2. **Preflight** (`src/preflight.ts`): Validates that required services are responsive and Android devices are connected. Starts offline services if configured.
3. **Fixture Setup** (`runFixture` in `src/runner.ts`): Executes hooks listed in `scenario.setup` sequentially. Halts immediately on failure.
4. **Step Execution**: Dispatches scenario steps to compiled target drivers (`web`, `mobile`, `http`, `shell`).
5. **Result Recording**: Logs status and duration to the `runs` and `run_steps` database tables and saves artifacts.

---

## Core Invariants

1. **Exactly One Active Environment**: One environment is always active. Deleting the active environment automatically promotes the default or first alphabetical environment.
2. **Reserved Target `"shell"`**: The name `"shell"` is strictly reserved for the host terminal runner; no platform may use this name.
3. **Sparse Overrides**: Unspecified fields in `env_platform` fall back directly to base `platforms` values.
4. **Fail-Fast Setup**: Any fixture failure immediately aborts the scenario before any test steps run.
5. **Decoupled Steps**: Scenario steps specify `target` (e.g. `"web"`), never raw URLs, ports, or device serials.
