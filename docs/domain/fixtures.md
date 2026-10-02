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
