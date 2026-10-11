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
  read_only INTEGER DEFAULT 0,     -- 1 when the steps never change what the setup fixtures reset
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
- `id`: Unique identifier for the step, a UUID. The scenario builder gives every new step, including a copy of a preset, a UUID when it is created, and saving assigns one to any step that arrives without an id (an imported JSON file, `POST /api/scenarios`). Ids are never derived from a step's position, so a step added where another was deleted never inherits its id. Steps saved before this rule keep their existing ids.
- `name`: Human-readable milestone label displayed in test execution runners and logs.
- `target`: The platform or driver to execute against (e.g. `web`, `http`, `shell`, `android`). Must match a compiled target in configuration.
- `actions`: An ordered array of declarative execution actions (`StepAction[]`).
- `timeout_ms`: Maximum step duration in milliseconds.
- `retry`: Retry policy specifying `times` and `delay_ms`.
- `assert`: Assertions to evaluate against the driver outcome (`assert_json`).
- `extract`: Map of variable names to JSON path expressions extracted from step results into the execution context (`extract_json`).

### Removed Step Fields
`run` (a web module), `flow` (a YAML flow) and `params` (their arguments) are no longer run by any driver. The schema no longer lists them, and the step check (`checkSteps` in `src/scenario.ts`) rejects a step or action that has one with the code `field-removed` and a message to write the step as `actions`, so `e2e list` fails instead of the run. The web target's `login` module option is gone for the same reason.

### Vocabulary & Step Check
`src/vocabulary.ts` is the one source for the scenario vocabulary: step fields per driver, every action with its aliases and the fields it reads, `json_match` operators, placeholder namespaces, removed fields, and the problem codes with their fix hints. Tests hold the hand-written schema's `Step` and `StepAction` fields, and the web and mobile drivers' action `switch` cases, to it.

`checkSteps` is the base check. It runs wherever a scenario is validated (`loadScenarios`, the scenario routes, a Pause on Failure retry) and returns problems of one shape: `{ file, pointer, stepIndex, stepName, code, message, value, allowed, hint }` (`src/problems.ts`). `pointer` is a JSON pointer such as `/steps/0/actions/1/action`; `allowed` lists the accepted values when there is a fixed set. `formatProblem` turns a problem into the one-line text those callers show, e.g. `steps[0] "Login": unknown target "ghost" (config has: api, shell)`. It checks:
- `unknown-fixture`: a `setup` name the config does not have.
- `unknown-target`: a step target that is neither a config target nor `shell`.
- `field-not-allowed`: a step field the target's driver does not accept, or an action field that no action of the driver reads.
- `field-removed`: `run`, `flow` or `params` on a step or an action.
- `unknown-action`: an action name, in `actions[]` or a step's single `action`, that the driver does not run. Web and mobile names match in any letter case, as those drivers lower-case them (`tapOn` runs as `tapon`); `http_*` and `shell` names match exactly. An http step with no `actions` is still valid.
- `step-needs-action`: a step with nothing for its driver to do.

Action fields are checked per driver, not per action: the builder keeps an action's other fields when its type changes, so a per-action rule would reject scenarios the builder saved.

### Strict Check
`checkStrict` (`src/strict-check.ts`) is the stricter level `e2e save` runs on agent-written drafts. It returns the same problem shape and adds to the base check:
- Targets come from the checked environments, not the active one. `environmentsToCheck` reads each environment's targets (its enabled platforms) and its configured `env_vars` names. With no environment named, it uses the default environment and adds the notice `no-draft-environment`. `E2E_ENV` plays no part. A target that one checked environment lacks gives `unknown-target` naming that environment.
- `ctx-produced-later`: a `${ctx.name}` that a later step (or the same step) extracts. The message names the step that extracts it, which should move earlier.
- `ctx-not-produced`: a `${ctx.name}` that no `vars` entry and no earlier `extract` sets. `allowed` lists the names set at that point. The first path segment counts, so `${ctx.user.email}` is set by a `user` var.
- `unknown-env-var`: a `${env.NAME}` that a checked environment's `env_vars` does not list. Process env names do not count, unlike at run time.
- `raw-url`: an absolute `http://` or `https://` URL in a step or action `url`, or in the `value` of an action that reads a URL (`navigate`, `wait_for_url`, `assert_url`). Use a path relative to the target's service.

Kept scenarios are held only to the base check, because process env names and absolute URLs are legal in them today.

### Web Assertions Wait
`assert_text`, `assert_not_text`, `assert_value`, `assert_url` and `assert_title` re-read the page until the check holds or `timeout_ms` (default 10 s) runs out, like `assert_visible` waits for its element. A value that never matches fails as `Assertion failed`; an element that never appears fails as `Step error`.

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
  - **Mobile**: `tap` (`tapon`, `click`), `type` (`input`, `inputtext`, `fill`), `erase` (`erasetext`, `clear`), `press` (`presskey`), `swipe`, `scroll_to`, `assert_visible` (`assertvisible`), `assert_not_visible` (`assertnotvisible`), `wait_for` (`wait`), `back`, `hidekeyboard`, `launch` (`launchapp`), `stop` (`stopapp`). A mobile step may also be one action written on the step itself (`action`, `selector`, `value`, `key`, `ms`), as on web; with `launch` the app launches first. A mobile `selector` is `id=<resource id>` (a Compose `testTag` exposed as a resource id), or a full-match regex on the element's text or content description (`text=` prefix optional). `scroll_to` swipes until the selector is visible, in the direction in `key` (`DOWN` by default). `timeout_ms` sets how long `wait_for`, `assert_visible`, `assert_not_visible` and `scroll_to` wait. `wait_for` with `ms` pauses that long. A mobile `type` with a `selector` taps it, types into the text field that then has focus, and closes any keyboard that shows, because some devices show a system keyboard even with every listed keyboard disabled and it would cover the fields below. If the tap leaves no field focused, it taps the same spot once more, because an app that clears focus on scroll loses it when focusing scrolls the field into view. It fails if the tap left focus on the field that had it before, which means something else on screen took the tap.
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
- `status`: Accepted and has no effect: the builder writes it, but no driver reads it. The step's `assert.status` is what checks the response.
- `exit_code`: Accepted and has no effect, like `status`. The step's `assert.exit_code` is what checks the exit code.

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

1. **Single Source of Truth**: The SQLite database (`.e2e/e2e.db`) is the only store the API, Web GUI, and runner read and write. `--db <path>` (or `E2E_DB_PATH`) picks another database file for the whole command: `loadConfig` stores the path as `config.dbPath`, and every later read and write, including config reloads in the GUI, uses it. The project folder stays `--dir`, or the current folder, unless the `--db` file sits in a `.e2e` folder, whose parent is then the project (`resolveCliPaths` in `src/db/paths.ts`). A `--db` directory names a project and uses its default database. `e2e init --db <file>` seeds that file. Server routes reload config with `reloadConfig` (`src/config.ts`), which keeps the chosen database; saving the first environment with a custom path reloads from the new database. `POST` and `DELETE` on `/api/scenarios` and `/api/presets` change SQLite only and never touch JSON files. A failed database write returns HTTP 500.
2. **One-Time Import**: The first time `getOrSeedScenarios()` (used by `loadScenarios()` and `GET /api/scenarios`) opens a database, it imports every valid `<scenarios folder>/*.json` file whose id the database does not have yet. It then records `scenarios_imported_at` in `settings` and never imports again, so a scenario deleted in the GUI does not come back from a leftover file. Presets follow the same rule with `<config folder>/presets/*.json` and `presets_imported_at`.
3. **Export**: `e2e export`, `POST /api/export`, and the **Export to JSON** button on the Config view's Database tab all call `exportToJson()` in `src/export.ts`. It runs the one-time import first, then writes every scenario to `<scenarios folder>/<id>.json` (without the `id` field, which comes from the file name) and every preset to `<config folder>/presets/<id>.json`. It overwrites files with the same id and leaves files for deleted ids in place.
   - **Drift check**: `e2e export --check` (`checkExport()` in `src/export.ts`) writes nothing. It compares each file with what an export would write and lists files that are missing (in SQLite, no file), changed (different content, or not valid JSON) or stale (a `.json` file in the scenarios or presets folder whose id SQLite no longer has). Whitespace and key order are ignored. Any other difference counts, including a step name or a missing step id. It fails when SQLite cannot be read, rather than falling back to the JSON files as the GUI's loaders do, since a fallback would compare each file with itself and report no drift. It exits 1 when anything is listed, so a consumer can run it from a pre-push hook to keep the scenarios in git the same as the ones that run. `e2e export` fixes missing and changed files; stale files must be deleted by hand, since an export never deletes.
4. **Import**: `e2e import` (`importFromJson()` in `src/import.ts`) saves every `<scenarios folder>/*.json` file into SQLite on request, keyed by file name, for scenarios written or edited as files after the one-time import ran. A new id is added; an existing one is replaced when the file's name, description, step ids or fingerprinted content (`runs.md`, section 5) differ, because importing is an explicit request and the file wins. A file step with no `id` matches any stored id, so re-importing an unchanged hand-written file changes nothing; a changed file without step ids gives its steps new UUIDs, which starts their run history over. A file that fails the schema or the base step check (`checkSteps`, e.g. an unknown target) is invalid: it is listed with its problems and never saved, and the command exits 1. Scenarios with no file are left alone.
5. **No Database Yet**: If the database file does not exist, reads fall back to the JSON files directly. The first save creates the database, and the next read runs the one-time import.

---

## 5. Execution Lifecycle

During test execution (`src/runner.ts`):

1. **Setup Fixtures**: If `scenario.setup` contains fixture names, each fixture command is executed sequentially before any step starts, unless the run skips them because the same setup still holds (`fixtures.md`, section 3).
2. **Sequential Step Evaluation**: Steps are queried from `scenario_steps` ordered by `order_num ASC`.
3. **Variable Interpolation**: Step fields undergo placeholder substitution: `${ctx.X}` reads the scenario's `vars` and every value extracted by an earlier step, `${env.Y}` the environment variables, `${run.Z}` the run (for example `${run.id}`). A string that is exactly one placeholder keeps the value's type.
4. **Target Dispatch**: The step payload is routed to the designated target driver.
5. **Assertion & Extraction**: Outcomes are validated against `assert` specifications, and matching values are stored into `scenarioContext.extract` for downstream steps.
6. **Step Run Persistence**: Each step execution attempt is persisted in `step_runs`. Each scenario-iteration also records, when it starts, the fingerprint of the scenario content it runs (`runs.md`, section 5).
7. **Pause on Failure**: In a GUI run started with Pause on Failure, a failed step can be edited and retried on the live run (`runs.md`, section 4). A retry that passes replaces the stored step it was made for, keeping its step id, so the fix applies to future runs. The stored step is found by its id; if the step was deleted meanwhile, nothing is saved. It also replaces the step for the rest of the current run, including later `--repeat` iterations; the iteration in progress keeps the fingerprint it started with, and the next iteration records the fixed content.

---

## 6. Core Invariants

1. **Unique Scenario ID**: Scenario IDs are unique alphanumeric identifiers (e.g. `01-smoke`, `02-checkout`).
2. **Cascading Deletion**: Deleting a scenario immediately cascades and removes all associated `scenario_steps`.
3. **Deterministic Step Ordering**: Step execution strictly follows `order_num ASC`.
4. **Target Decoupling**: Steps reference abstract target identifiers (`target: "web"`), not concrete hostnames, ports, or process details.
