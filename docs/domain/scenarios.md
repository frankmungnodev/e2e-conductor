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
- SQLite is the only place saves and deletes go. `<config folder>/presets/<id>.json` files are written only by an export (see section 4).
- The first time a database loads presets, it imports `<config folder>/presets/*.json` files whose ids it does not have yet (see section 4).
- Authors can save any configured step as a preset with one click from the Step Inspector header.
- Authors can insert a pre-configured step directly into any scenario from the Stepper header (`+ Add Step from Preset`).

---

## 4. Storage: SQLite Only, JSON on Export

1. **Single Source of Truth**: The SQLite database (`.e2e/e2e.db`) is the only store the API, Web GUI, and runner read and write. `POST` and `DELETE` on `/api/scenarios` and `/api/presets` change SQLite only and never touch JSON files. A failed database write returns HTTP 500.
2. **One-Time Import**: The first time `getOrSeedScenarios()` (used by `loadScenarios()` and `GET /api/scenarios`) opens a database, it imports every valid `<scenarios folder>/*.json` file whose id the database does not have yet. It then records `scenarios_imported_at` in `settings` and never imports again, so a scenario deleted in the GUI does not come back from a leftover file. Presets follow the same rule with `<config folder>/presets/*.json` and `presets_imported_at`.
3. **Export**: `e2e export`, `POST /api/export`, and the **Export to JSON** button on the Config view's Database tab all call `exportToJson()` in `src/export.ts`. It runs the one-time import first, then writes every scenario to `<scenarios folder>/<id>.json` (without the `id` field, which comes from the file name) and every preset to `<config folder>/presets/<id>.json`. It overwrites files with the same id and leaves files for deleted ids in place.
4. **No Database Yet**: If the database file does not exist, reads fall back to the JSON files directly. The first save creates the database, and the next read runs the one-time import.

---

## 5. Execution Lifecycle

During test execution (`src/runner.ts`):

1. **Setup Fixtures**: If `scenario.setup` contains fixture names, each fixture command is executed sequentially before any step starts.
2. **Sequential Step Evaluation**: Steps are queried from `scenario_steps` ordered by `order_num ASC`.
3. **Variable Interpolation**: Step fields undergo placeholder substitution (`${vars.X}`, `${env.Y}`, `${extract.Z}`).
4. **Target Dispatch**: The step payload is routed to the designated target driver.
5. **Assertion & Extraction**: Outcomes are validated against `assert` specifications, and matching values are stored into `scenarioContext.extract` for downstream steps.
6. **Step Run Persistence**: Each step execution attempt is persisted in `step_runs`.
7. **Pause on Failure**: In a GUI run started with Pause on Failure, a failed step can be edited and retried on the live run (`runs.md`, section 4). A retry that passes replaces the stored step it was made for, keeping its step id, so the fix applies to future runs. The stored step must still have the same id and the name the run last saw; otherwise nothing is saved. It also replaces the step for the rest of the current run, including later `--repeat` iterations.

---

## 6. Core Invariants

1. **Unique Scenario ID**: Scenario IDs are unique alphanumeric identifiers (e.g. `01-smoke`, `02-checkout`).
2. **Cascading Deletion**: Deleting a scenario immediately cascades and removes all associated `scenario_steps`.
3. **Deterministic Step Ordering**: Step execution strictly follows `order_num ASC`.
4. **Target Decoupling**: Steps reference abstract target identifiers (`target: "web"`), not concrete hostnames, ports, or process details.
