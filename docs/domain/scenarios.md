# Scenarios & Steps Domain & Business Logic

A **Scenario** represents an executable end-to-end test specification consisting of sequential **Steps**, setup fixtures, and scoped variables.

Scenarios define *what* to test across decoupled platform targets (e.g. `web`, `android`, `api`, `shell`) without hardcoding infrastructure configurations.

---

## 1. Storage & Schema

Scenarios and their steps are stored in SQLite (`src/db/scenarios.ts`; presets and step groups in `src/db/step-presets.ts` and `src/db/step-groups.ts`) with a 1-to-many relationship and cascading deletion:

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

CREATE TABLE IF NOT EXISTS step_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target TEXT NOT NULL,            -- Platform target identifier ("web", "mobile", etc.)
  step TEXT NOT NULL,              -- Serialized JSON object: Step (with actions)
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

## 2. Step Fields & Composite Actions

Each scenario step represents a milestone or phase (e.g., *Admin Login*, *Add to Cart*, *Verify Order*). The orchestrator employs a **Zero-Code Composite Step Architecture** where each step contains an ordered array of execution actions (`actions: StepAction[]`):

### Common Step Fields
- `id`: Optional unique identifier for the step (auto-generated if omitted upon persistence).
- `name`: Human-readable milestone label displayed in test execution runners and logs.
- `target`: The platform or driver to execute against (e.g. `web`, `http`, `shell`, `android`). Must match a compiled target in configuration.
- `actions`: An ordered array of declarative execution actions (`StepAction[]`).
- `timeout_ms`: Maximum step duration in milliseconds.
- `retry`: Retry policy specifying `times` and `delay_ms`.
- `assert`: Assertions to evaluate against the driver outcome (`assert_json`).
- `extract`: Map of variable names to JSON path expressions extracted from step results into the execution context (`extract_json`).

### StepAction Structure
Each action in `step.actions` executes sequentially within the step's driver session:
- `id`: Optional client-side action ID.
- `name`: Human-readable label for this specific action.
- `action`: Specific driver action keyword:
  - **Web (Playwright)**:
    - *Navigation*: `navigate` (`goto`), `reload`, `go_back`, `go_forward`
    - *Mouse & Locator*: `click`, `dblclick`, `hover`, `focus`, `clear`, `drag_and_drop`, `scroll_into_view`
    - *Keyboard & Forms*: `fill`, `type`, `press`, `check`, `uncheck`, `select` (`select_option`), `upload_file` (`set_input_files`)
    - *Waiting*: `wait_for` (`wait`), `wait_for_url`, `wait_for_load_state`
    - *Assertions*: `assert_visible`, `assert_not_visible` (`assert_hidden`), `assert_text`, `assert_not_text`, `assert_value`, `assert_checked`, `assert_not_checked`, `assert_disabled`, `assert_enabled`, `assert_url`, `assert_title`
    - *Viewport & Utilities*: `set_viewport`, `screenshot`, `eval` (`script`)
  - **Mobile**: `tap`, `type`, `press`, `swipe`, `assert_visible`, `assert_not_visible`, `wait_for`, `back`, `hidekeyboard`, `launch`, `stop`.
  - **HTTP**: `http_get`, `http_post`, `http_put`, `http_patch`, `http_delete`.
  - **Shell**: `shell`.
- `selector`: CSS selector, XPath, or mobile element label/resource ID.
- `target_selector`: Target element selector for drag and drop interactions.
- `value`: Text input value, expected assertion text, file path, or script content.
- `url`: Destination URL for web navigation or HTTP requests.
- `key`: Keyboard key (`Enter`, `Tab`, `Escape`, `BACK`, `HOME`) or swipe direction (`RIGHT`, `LEFT`, `UP`, `DOWN`).
- `ms`: Delay duration or timeout in milliseconds.
- `timeout_ms`: Action-specific timeout override in milliseconds.
- `width`: Viewport width in pixels for `set_viewport`.
- `height`: Viewport height in pixels for `set_viewport`.
- `command`: Shell command string executed with `sh -c`.
- `cwd`: Shell working directory, relative to config folder.
- `method`: HTTP request method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- `headers`: HTTP request headers map.
- `body`: HTTP request JSON body.
- `status`: Expected HTTP response status code assertion.
- `exit_code`: Expected shell process exit code assertion.

---

## 3. Reusable Step Presets (`step_presets`)

A **Preset** is a reusable **Step** template (storing target platform and pre-configured `actions`).
- Stored directly in SQLite (`step_presets` table).
- Dual-written to `.e2e/presets/<id>.json` on disk for Git versioning and export/import portability.
- If the SQLite `step_presets` table is empty on startup, presets are automatically seeded from `.e2e/presets/*.json`.
- Authors can save any configured step as a preset with one click from the Step Inspector header.
- Authors can insert a pre-configured step directly into any scenario from the Stepper header (`+ Add Step from Preset`).

---

## 4. Storage Synchronization & Dual-Write

To preserve Git-based version control compatibility alongside relational SQLite querying:

1. **Primary Persistence**: The SQLite database (`.e2e/e2e.db`) is the primary source of truth for the API, Web GUI, and runner.
2. **Auto-Import on Initialization**: If the SQLite `scenarios` table is empty when `loadScenarios()` or `GET /api/scenarios` executes, the system automatically scans `.e2e/scenarios/*.json` and imports all valid scenarios and their steps into the database.
3. **Dual-Write on Save**: When a scenario is created or updated via `saveScenario()` (`POST /api/scenarios`), it is written to SQLite and simultaneously formatted and written to `.e2e/scenarios/<id>.json` on disk.
4. **Synchronized Deletion**: When a scenario is deleted via `deleteScenario()` (`DELETE /api/scenarios/:id`), it is removed from SQLite (cascading to `scenario_steps`) and its corresponding `.json` file is deleted from the filesystem.

---

## 5. Execution Lifecycle

During test execution (`src/runner.ts`):

1. **Setup Fixtures**: If `scenario.setup` contains fixture names, each fixture command is executed sequentially before any step starts.
2. **Sequential Step Evaluation**: Steps are queried from `scenario_steps` ordered by `order_num ASC`.
3. **Variable Interpolation**: Step fields undergo placeholder substitution (`${vars.X}`, `${env.Y}`, `${extract.Z}`).
4. **Target Dispatch**: The step payload is routed to the designated target driver.
5. **Assertion & Extraction**: Outcomes are validated against `assert` specifications, and matching values are stored into `scenarioContext.extract` for downstream steps.
6. **Step Run Persistence**: Each step execution attempt is persisted in `step_runs`.

---

## 6. Core Invariants

1. **Unique Scenario ID**: Scenario IDs are unique alphanumeric identifiers (e.g. `01-smoke`, `02-checkout`).
2. **Cascading Deletion**: Deleting a scenario immediately cascades and removes all associated `scenario_steps`.
3. **Deterministic Step Ordering**: Step execution strictly follows `order_num ASC`.
4. **Target Decoupling**: Steps reference abstract target identifiers (`target: "web"`), not concrete hostnames, ports, or process details.
