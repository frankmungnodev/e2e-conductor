# Execution Runs & Step Runs Domain & Business Logic

A **Run** represents a complete end-to-end execution session for an environment.
A **Step Run** records the granular execution attempt, timing, status, and outcome of an individual scenario step within a run.

---

## 1. Storage & Schema

Run history and step-level telemetry are persisted in SQLite (`src/db/runs.ts`):

```sql
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  environment_name TEXT NOT NULL,
  status TEXT NOT NULL,            -- "RUNNING", "PASSED", "FAILED", "CANCELLED"
  total_scenarios INTEGER DEFAULT 0,
  passed_scenarios INTEGER DEFAULT 0,
  failed_scenarios INTEGER DEFAULT 0,
  duration_ms INTEGER,
  artifacts_dir TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  reason TEXT,                     -- Why the run failed when no single step explains it: "environment down", "fixed during run" or "recovered steps (strict)"
  recovered_steps INTEGER DEFAULT 0,   -- Steps that passed only on a retry
  not_run_scenarios INTEGER DEFAULT 0, -- Scenario-iterations never reached because an environment-down failure stopped the run
  fixed_scenarios INTEGER DEFAULT 0    -- Scenario-iterations that paused on a failure and passed after a manual retry
);

CREATE TABLE IF NOT EXISTS step_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT,                    -- Reference to scenario_steps(id), if known
  scenario_id TEXT NOT NULL,       -- Scenario identifier
  iteration INTEGER DEFAULT 1,     -- Loop/repetition iteration index
  attempt INTEGER DEFAULT 1,       -- Retry attempt counter (1-indexed)
  status TEXT NOT NULL,            -- "RUNNING", "PASSED", "FAILED", "CANCELLED"
  duration_ms INTEGER,
  status_code INTEGER,             -- HTTP status code or process exit code
  error_message TEXT,              -- Failure summary or stack trace
  result_data TEXT,                -- Serialized JSON result payload
  artifacts_path TEXT,             -- Relative path to screenshot or step trace
  created_at INTEGER,
  failure_label TEXT,              -- On the final failed attempt: "Environment down", "Assertion failed" or "Step error"
  manual INTEGER DEFAULT 0         -- 1 for a retry the user started while the run was paused
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_step_runs_run ON step_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_step ON step_runs(step_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_scenario ON step_runs(scenario_id);
```

A step run's id is `<runId>:<scenarioId>:<iteration>:<stepIndex>:<attempt>`, so every iteration of a `--repeat` run keeps its own attempt rows. Databases created before `reason`, `recovered_steps`, `not_run_scenarios`, `fixed_scenarios`, `failure_label` and `manual` existed get those columns when they are opened (`openDatabase` in `src/db/connection.ts`).

---

## 2. Status Lifecycle

Execution progress follows a deterministic state machine:

```text
       ┌──────────┐
       │ RUNNING  │
       └────┬─────┘
            │
   ┌────────┼──────────┐
   ▼        ▼          ▼
┌────────┐┌────────┐┌───────────┐
│ PASSED ││ FAILED ││ CANCELLED │
└────────┘└────────┘└───────────┘
```

### Run Lifecycle
1. **Initialization**: When test execution starts (`run()` in `src/runner.ts`), a run record is inserted with `status = "RUNNING"` and `started_at = Date.now()`.
2. **Execution**: Scenarios and steps execute sequentially or per-suite.
3. **Completion**: In the execution `finally` block (prior to closing database connections), `saveRun()` updates the row with `completed_at`, computed `duration_ms`, scenario totals, the stop reason, the recovered and not-run counts, and the final status (see section 3).

### Step Run Lifecycle
1. **Per-Attempt Tracking**: Each step attempt (initial execution or retry) creates a `step_runs` record with `status = "RUNNING"`.
2. **Outcome Recording**:
   - If the step succeeds, `status = "PASSED"`, `duration_ms` is recorded, and any HTTP status code or result data is stored.
   - If the step fails, `status = "FAILED"`, `duration_ms` is recorded, and the sanitized error message is saved.
   - If configured retries remain, subsequent attempts insert new `step_runs` rows with incremented `attempt` numbers.
   - When the final attempt fails, the runner re-checks the environment (section 3) and stores the failure label on that attempt's row.
   - A step whose final row is `PASSED` with `attempt > 1` and `manual = 0` is **recovered**. Recovered is derived from the rows, not stored per step. A step that passed on a manual retry is never recovered.
   - Manual retries (section 4) add rows with `manual = 1`, numbered after the automatic attempts.

---

## 3. Failure Labels, Environment-Down Stop, and Strict Mode

### Failure labels
Every step that fails after its final attempt, and every setup fixture that fails, gets exactly one label. Labels state what happened; they never guess blame.

| Label | When |
|---|---|
| `Environment down` | The post-failure re-check finds a service or device down. Takes precedence over everything else. |
| `Assertion failed` | The environment is healthy and a check the scenario expects failed: `assert` (including the implicit shell exit-code and HTTP >= 400 checks), `extract`, the drivers' `assert_*` actions, or a Playwright `expect` inside a web module. These throw `AssertionFailure` (`src/assertions.ts`). |
| `Step error` | The environment is healthy and the step or fixture could not complete: a timeout, a missing element, a connection error, a failed fixture command. |

Fixture failures are labeled `Environment down` or `Step error`; a fixture has no assertion.

### The re-check
The re-check (`findDown` in `src/health.ts`) runs only after a step's **final** attempt fails, or after a fixture fails, so a service that restarts mid-step gets its retries. It probes:
- every service the run prepared, with the preflight probe: a service is up when its `health` path, or `/` when none is set, answers below 500 within 3 seconds;
- every Android device the run picked: the device is down when adb no longer lists its serial, adb does not answer within 5 seconds (`adb not responding`), or adb is missing (`adb not found`).

The label is a hint, not proof: a service that crashed and recovered before the re-check reads as healthy.

**Known limit:** Android and shell targets name no service. A run made only of Android and shell scenarios prepares no services, so the re-check covers only the device, and a backend dying behind the app reads as `Step error`. Runs that also include an API or web target for that backend are covered.

### Environment-down stop
When a failure is labeled `Environment down`, the run stops. No further steps or scenarios run. The stop is a normal return, not a throw, so `summary.json`, the result line and the `finish` event are always written. The run is stored `FAILED` (never `CANCELLED`) with `reason = "environment down"`, and every scenario-iteration it never reached is listed in `summary.notRun`. Counts always add up: `passed + failed + notRun = total`. The CLI exits 1.

If the user cancels while the re-check runs, cancellation wins: the run is `CANCELLED` and no label is stored.

### Recovered steps and `--strict`
A recovered step passes and its run passes. The summary's `recovered` count, the CLI result line and the GUI show it. With `e2e run --strict`, any recovered step fails the run with `reason = "recovered steps (strict)"`. The environment-down and fixed-during-run reasons take precedence over the strict reason. The GUI has no strict option yet.

### Run outcome

| Failures | Environment down | Fixed scenarios | Recovered steps | `--strict` | Status | Reason |
|---|---|---|---|---|---|---|
| none | no | 0 | 0 | any | `PASSED` | none |
| none | no | 0 | 1 or more | off | `PASSED` | none |
| none | no | 0 | 1 or more | on | `FAILED` | recovered steps (strict) |
| none | no | 1 or more | any | any | `FAILED` | fixed during run |
| 1 or more | no | any | any | any | `FAILED` | none (labels on each failure) |
| any | yes | any | any | any | `FAILED` | environment down |

`summary.json` carries these as additive fields: `reason`, `down` (what the re-check found down), `fixed`, `recovered`, `notRun`, `strict`, and `failures[].label`.

---

## 4. Pause on Failure

A run started from the Web GUI with **Pause on Failure** (`POST /api/run` with `pauseOnFailure: true`) can stop on a failed step so the user fixes it in place. The CLI has no pause option. Without it, a run behaves exactly as sections 2 and 3 describe.

### When a run pauses
A run pauses when a step fails after its final attempt, the failure is not labeled `Environment down`, and the scenario has not ended yet. The pause happens inside the scenario, before the drivers end it, so the browser page or Android app stays on the screen where the step failed, and the scenario's extracted variables stay as they were. Nothing else runs while the run is paused, including later scenarios. An `Environment down` failure and a failed setup fixture never pause.

### Lifecycle

```text
 step fails (final attempt, not Environment down)
        │
        ▼
     PAUSED ──Retry (edited step, one attempt)──▶ retry fails, healthy ──▶ PAUSED
        │                    │
        │                    ├─▶ retry fails, Environment down ──▶ run stops (environment down)
        │                    │
        │                    └─▶ retry passes (step saved) ──▶ RETRY PASSED ──Retry──▶ …
        │                                                           │
        │                                                           └─Continue──▶ next step
        ├─End Scenario──▶ scenario FAILED with the original failure, run moves on
        └─Stop Run─────▶ run CANCELLED
```

- **Retry** runs the edited step once, with no automatic retries, on the live session. The server refuses a step that fails validation, or whose target the run did not prepare, without running it.
- **Continue** is accepted only after the last retry passed. The scenario goes on from the next step.
- **End Scenario** ends the scenario failed with the failure it paused on, and the run moves on.
- **Stop Run** is the existing `/api/run/stop`: the run is `CANCELLED`, never fixed.
- A pause waits until the user acts or cancels. It has no timeout.

### Fixed scenarios
A scenario that paused, and continued past every pause to its last step, is **fixed**: neither passed nor failed. It keeps its failure screenshot and trace like a failed one. If it pauses again later and the user ends it, it is failed. A run with one or more fixed scenarios and no failed ones ends `FAILED` with `reason = "fixed during run"`, so a green run always means nobody stepped in (section 3, Run outcome). The summary's `fixed` count, `runs.fixed_scenarios`, the CLI result line and the GUI show it.

### Saved fixes
A retry that passes is saved into the stored scenario at the same step position (`scenarios.md`, section 5), and the run uses the fix for the rest of its iterations.

### Events
`hold_start` (the paused step, its error and label, whether a retry passed, and the targets the run prepared), `hold_retry` (each retry's result), and `hold_end` (`continue`, `end`, or `stopped` when a retry found the environment down). `scenario_end` carries `fixed: true` for a fixed scenario. `GET /api/run/status` reports the paused step as `currentRun.paused`, so a reloaded page shows the pause.

---

## 5. Querying & API Access

The orchestrator provides unified access to both database-backed telemetry and filesystem-backed artifacts:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/runs` | `GET` | Returns execution history sorted by `started_at DESC`, merging SQLite records with filesystem summary metadata. |
| `/api/runs/:runId` | `GET` | Returns full run metadata, scenario-level artifact listings, captured screenshots, and the array of all associated `stepRuns`. |
| `/api/step-runs` | `GET` | Queries step execution telemetry filtered by `scenarioId`, `stepId`, or `runId`. |
| `/api/run/hold/retry` | `POST` | Retries an edited step (`{ step }`) on the paused run. 400 for an invalid step or an unprepared target, 409 when the run is not paused. |
| `/api/run/hold/continue` | `POST` | Continues the paused scenario from the next step. 409 until a retry has passed. |
| `/api/run/hold/end-scenario` | `POST` | Ends the paused scenario failed; the run moves on. 409 when the run is not paused. |
| `/api/steps/:stepId/runs` | `GET` | Queries historical execution records for a specific step across all runs, enabling flakiness detection and performance tracking. |

---

## 6. UI Representation

In the Web GUI:

- **Runner View (`ui/src/views/runner/`)**:
  - **Step tree**: each failed step shows its failure label badge (`Environment Down`, `Assertion Failed`, `Step Error`); a recovered step shows a `Recovered` warning badge, and its scenario header counts recovered steps. A scenario that failed in setup shows its label and error in the scenario header. Scenarios the run never reached show `Not Run`.
  - **Status bar**: Passed, Failed, Fixed, Not Run, Recovered and Total counts (Fixed, Not Run and Recovered only when above zero), plus an `Environment Down` badge naming what was down, or a `Fixed During Run` badge.
  - **Run Options**: a `Pause on Failure` checkbox, off by default.
  - **Pause banner** (`PausePanel.tsx`): while the run is paused, shows the scenario, step, label and error, with `Edit and Retry Step` (a JSON dialog, `RetryStepModal.tsx`), `Continue` (enabled once a retry passes), `End Scenario` and `Stop Run`. A passing retry shows a toast naming the scenario the fix was saved to.
  - **Fixed results**: a fixed scenario shows a `Fixed` badge; its fixed step shows `Fixed By Retry` and its number of manual retries.
- **Reports & Artifacts View (`ArtifactsView.tsx`)**:
  - **Run History Sidebar**: Displays run timestamp, environment, duration, and status badge.
  - **Run Details View**:
    - **Screenshots Tab**: Grid of screenshots captured during failures or explicit visual check steps.
    - **Step Runs Tab**: Tabular breakdown of every step attempt, including step identifier, scenario, retry attempt, duration in milliseconds, status badge, failure label, a recovered marker on a passing automatic retry, a `Manual Retry` marker on a retry made while paused, and diagnostic error message or status code.
    - **Run Log Tab**: Full terminal stream and execution log (`run.log`).
- **Badge Convention**: All run and step status badges are formatted in Title Case (`Passed`, `Failed`, `Running`, `Cancelled`, `Not Run`, `Recovered`, `Fixed`, `Fixed By Retry`, `Fixed During Run`, `Manual Retry`, `Retry Passed`, `Environment Down`, `Assertion Failed`, `Step Error`).

---

## 7. Core Invariants

1. **Cascading Run Deletion**: Deleting a run row automatically cascades and deletes all associated `step_runs`.
2. **Immutable Execution Records**: Step runs preserve historical telemetry even if scenario definitions or step configurations are modified or deleted later.
3. **Guaranteed Finalization**: The runner always finalizes run status in database storage before closing connections or releasing system resources.
4. **One Label per Final Failure**: Every final failure carries exactly one failure label; an environment-down label always stops the run.
5. **Counts Add Up**: A run's passed, failed, fixed and not-run scenario-iterations always sum to its total.
6. **A Fixed Run Is Never Green**: A run in which the user fixed a step while paused never ends `PASSED`.
