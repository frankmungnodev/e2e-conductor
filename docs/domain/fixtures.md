# Fixtures & Lifecycle Hooks Domain & Business Logic

A **Fixture** is a deterministic pre-condition setup hook executed before scenario steps run. Fixtures reset and seed external systems (databases, caches, mock authentication) into known states.

---

## 1. Storage & Schema

Shell fixtures are stored in SQLite (`src/db/fixtures.ts`):

```sql
CREATE TABLE IF NOT EXISTS fixtures (
  name TEXT PRIMARY KEY,           -- Identifier referenced in scenario.setup
  cmd TEXT NOT NULL,               -- Shell command to execute
  cwd TEXT,                        -- Working directory relative to configDir
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## 2. Fixture Implementations

### Shell Command Fixtures
- Stored in SQLite or returned from `config.fixtures`.
- Executed in a child process via `runShell(fixture.cmd, { cwd, log })` in `src/runner.ts`.
- Inherits active environment variables (`config.env`).
- Any non-zero exit code throws an error and fails the scenario.

### TypeScript Function Fixtures (`FixtureFn`)
Programmatic fixtures defined in TypeScript (`src/config.ts`):

```typescript
export type FixtureContext = {
  configDir: string
  env: Record<string, string>
  log: (message: string) => void
}

export type FixtureFn = (ctx: FixtureContext) => Promise<void>
```

Directly runs in-process with programmatic access to database connections, API clients, or token generators.

---

## 3. Scenario Integration & Lifecycle

Scenarios list required fixtures in their `setup` array:

```json
{
  "name": "Checkout Flow",
  "setup": ["reset_database", "seed_catalog"],
  "steps": [ ... ]
}
```

### Execution Lifecycle (`src/runner.ts`)

1. **Pre-Step Execution**: Fixtures run before step index 0.
2. **Strict Sequential Order**: Executed one-by-one in array order.
3. **Fail-Fast Semantics**: If any fixture fails:
   - Execution halts immediately.
   - All subsequent fixtures in `setup` are skipped.
   - All scenario steps are aborted.
   - Step is recorded as `setup: <fixture_name>` with status `FAILED`.

### Skipping a Setup That Still Holds (`read_only`)

A scenario marked `read_only: true` promises that its steps never change anything its setup fixtures reset: database rows, app data, browser storage, files. The runner trusts this promise and does not check it.

The runner (`src/setup-reuse.ts`, called from the scenario loop in `src/runner.ts`) skips a scenario's setup fixtures when all of these are true:

1. The scenario's `setup` list is not empty and is exactly the same list, in the same order, as a setup that already ran and passed in this run.
2. Every scenario that ran after that setup, in any iteration, is `read_only`, has that same `setup`, and never paused. A scenario that is not read-only, a scenario with an empty or different `setup`, a failed setup fixture, or a pause on a failed step (the user can change the app or its data by hand while paused) ends it.

The scenario being started does not have to be read-only itself: its own steps run after the skipped setup, and only the next scenario cares whether they changed anything. A skipped setup prints `↷ setup <fixtures> skipped: same setup as <scenario>, and only read-only scenarios ran since` and records no fixture result. With `--repeat`, a read-only scenario runs its setup in the first iteration only.

The tradeoff: a scenario marked read-only that does change state makes the next scenario start from dirty data, and that scenario fails for a reason outside itself. Mark a scenario read-only only when its steps only read. Turn the flag off to find out whether a failure comes from skipped setup.

The GUI sets the flag with the **Read-only** checkbox in Scenario Settings, which is disabled until the scenario has a setup fixture. It is part of the scenario's fingerprint when true (`runs.md`, section 5).

---

## 4. Interactive Diagnostic Execution

Test authors can test fixtures in isolation via the Web GUI or API:

- **Endpoint**: `POST /api/fixtures/run`
- **Payload**: `{ "name": "seed_catalog" }`
- **Output**: Returns real-time stdout, stderr, exit code, and execution duration in milliseconds.

---

## 5. Invariants & Best Practices

- **Idempotence**: Fixtures must safely run repeatedly without failing if previous runs aborted mid-stream.
- **Preflight Validation**: `validateScenario()` in `src/scenario.ts` validates that all fixtures listed in `setup` exist in the configuration before any run starts.
- **Fail-Fast**: Fixture failures are fatal to the scenario run.
