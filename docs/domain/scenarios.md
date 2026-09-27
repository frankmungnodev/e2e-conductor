# Scenarios & Steps Domain & Business Logic

A **Scenario** represents an executable end-to-end test specification consisting of sequential **Steps**, setup fixtures, and scoped variables.

Scenarios define *what* to test across decoupled platform targets (e.g. `web`, `android`, `api`, `shell`) without hardcoding infrastructure configurations.

---

## 1. Storage & Schema

Scenarios and their steps are stored in SQLite (`src/db.ts`) with a 1-to-many relationship and cascading deletion:

```sql
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  setup_fixtures TEXT,             -- Serialized JSON array: string[]
  vars TEXT,                       -- Serialized JSON object: Record<string, unknown>
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS scenario_steps (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  order_num INTEGER NOT NULL,      -- 0-indexed execution order
  name TEXT NOT NULL,
  target TEXT NOT NULL,            -- Target platform or driver identifier (e.g. "web", "shell")
  timeout_ms INTEGER,
  retry_times INTEGER,
  retry_delay_ms INTEGER,
  assert_json TEXT,                -- Serialized JSON: Assert[] or Record<string, unknown>
  extract_json TEXT,               -- Serialized JSON: Record<string, string>
  driver_config TEXT,              -- Serialized JSON containing target-specific driver fields
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS step_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target TEXT,                     -- Optional platform affinity ("web", "mobile", etc.)
  steps TEXT NOT NULL,             -- Serialized JSON array: Step[]
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_scenario_steps_scenario ON scenario_steps(scenario_id, order_num);
```

---

## 2. Step Fields & Declarative Actions

Each scenario step consists of common orchestration fields and target-specific driver configurations. The orchestrator employs a **Zero-Code Declarative Model** where standard browser and mobile interactions execute natively without requiring helper files.

### Common Fields
- `id`: Optional unique identifier for the step (auto-generated if omitted upon persistence).
- `name`: Human-readable label displayed in test execution runners and logs.
- `target`: The platform or driver to execute against (e.g. `web`, `http`, `shell`, `android`). Must match a compiled target in configuration.
- `timeout_ms`: Maximum step duration in milliseconds.
- `retry`: Retry policy specifying `times` and `delay_ms`.
- `assert`: Assertions to evaluate against the driver outcome (`assert_json`).
- `extract`: Map of variable names to JSON path expressions extracted from step results into the execution context (`extract_json`).

### Target Driver Fields (`driver_config`)
- **Web driver (`target: "web"`)**:
  - `action`: Declarative action (`navigate`, `click`, `fill`, `press`, `wait_for`, `assert_visible`, `assert_text`, `hover`, `select`, `check`, `uncheck`, `screenshot`, `eval`).
  - `url`: Destination URL or relative path for `navigate`.
  - `selector`: CSS selector or locator for target DOM elements.
  - `value`: Input text for `fill`, expected text for `assert_text`, or JavaScript code for `eval`.
  - `key`: Keyboard key for `press` (e.g. `Enter`, `Tab`, `Escape`).
  - `ms`: Delay duration in milliseconds for `wait_for`.
  - *Escape Hatch (`run`)*: Optional TypeScript module name in `.e2e/modules` for complex script execution.
- **Mobile driver (`target: "mobile"`)**:
  - `action`: Declarative action (`tap`, `type`, `press`, `swipe`, `assert_visible`, `assert_not_visible`, `wait`, `back`, `hidekeyboard`, `launch`).
  - `selector`: Target element text, accessibility label, or resource ID.
  - `value`: Text input content for `type`.
  - `key`: Key name for `press` (`BACK`, `ENTER`, `HOME`, `TAB`) or swipe direction (`RIGHT`, `LEFT`, `UP`, `DOWN`).
  - `ms`: Delay duration in milliseconds.
  - `launch`: App lifecycle behavior (`restart` or `fresh` to wipe state).
  - *Legacy Fallback (`flow`)*: Optional YAML flow file in `.e2e/flows`.
- **HTTP driver (`target: "http"`)**: `url`, `method`, `headers`, `body`.
- **Shell driver (`target: "shell"`)**: `command`, `cwd`.

---

## 3. Reusable Step Presets (`step_groups`)

The `step_groups` table stores modular, reusable step sequences (e.g., *Admin Login*, *Seed Test Database*, *Verify Cart Total*).
- Presets can be inserted directly into any scenario at any position from the Scenario Studio UI.
- Test authors can save any scenario's step sequence as a new reusable preset in SQLite.
- Presets eliminate boilerplate repetition across test suites without needing code-based helper functions.

---

## 3. Storage Synchronization & Dual-Write

To preserve Git-based version control compatibility alongside relational SQLite querying:

1. **Primary Persistence**: The SQLite database (`.e2e/e2e.db`) is the primary source of truth for the API, Web GUI, and runner.
2. **Auto-Import on Initialization**: If the SQLite `scenarios` table is empty when `loadScenarios()` or `GET /api/scenarios` executes, the system automatically scans `.e2e/scenarios/*.json` and imports all valid scenarios and their steps into the database.
3. **Dual-Write on Save**: When a scenario is created or updated via `saveScenario()` (`POST /api/scenarios`), it is written to SQLite and simultaneously formatted and written to `.e2e/scenarios/<id>.json` on disk.
4. **Synchronized Deletion**: When a scenario is deleted via `deleteScenario()` (`DELETE /api/scenarios/:id`), it is removed from SQLite (cascading to `scenario_steps`) and its corresponding `.json` file is deleted from the filesystem.

---

## 4. Execution Lifecycle

During test execution (`src/runner.ts`):

1. **Setup Fixtures**: If `scenario.setup` contains fixture names, each fixture command is executed sequentially before any step starts.
2. **Sequential Step Evaluation**: Steps are queried from `scenario_steps` ordered by `order_num ASC`.
3. **Variable Interpolation**: Step fields undergo placeholder substitution (`${vars.X}`, `${env.Y}`, `${extract.Z}`).
4. **Target Dispatch**: The step payload is routed to the designated target driver.
5. **Assertion & Extraction**: Outcomes are validated against `assert` specifications, and matching values are stored into `scenarioContext.extract` for downstream steps.
6. **Step Run Persistence**: Each step execution attempt is persisted in `step_runs`.

---

## 5. Core Invariants

1. **Unique Scenario ID**: Scenario IDs are unique alphanumeric identifiers (e.g. `01-smoke`, `02-checkout`).
2. **Cascading Deletion**: Deleting a scenario immediately cascades and removes all associated `scenario_steps`.
3. **Deterministic Step Ordering**: Step execution strictly follows `order_num ASC`.
4. **Target Decoupling**: Steps reference abstract target identifiers (`target: "web"`), not concrete hostnames, ports, or process details.
