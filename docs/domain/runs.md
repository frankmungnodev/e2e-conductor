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
  reason TEXT,                     -- Why the run failed when no single step explains it: "environment down" or "recovered steps (strict)"
  recovered_steps INTEGER DEFAULT 0,   -- Steps that passed only on a retry
  not_run_scenarios INTEGER DEFAULT 0  -- Scenario-iterations never reached because an environment-down failure stopped the run
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
  failure_label TEXT               -- On the final failed attempt: "Environment down", "Assertion failed" or "Step error"
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_step_runs_run ON step_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_step ON step_runs(step_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_scenario ON step_runs(scenario_id);
```

A step run's id is `<runId>:<scenarioId>:<iteration>:<stepIndex>:<attempt>`, so every iteration of a `--repeat` run keeps its own attempt rows. Databases created before `reason`, `recovered_steps`, `not_run_scenarios` and `failure_label` existed get those columns when they are opened (`openDatabase` in `src/db/connection.ts`).

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
   - A step whose final row is `PASSED` with `attempt > 1` is **recovered**. Recovered is derived from the rows, not stored per step.

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
A recovered step passes and its run passes. The summary's `recovered` count, the CLI result line and the GUI show it. With `e2e run --strict`, any recovered step fails the run with `reason = "recovered steps (strict)"`. An environment-down reason takes precedence over the strict reason. The GUI has no strict option yet.

### Run outcome

| Failures | Environment down | Recovered steps | `--strict` | Status | Reason |
|---|---|---|---|---|---|
| none | no | 0 | any | `PASSED` | none |
| none | no | 1 or more | off | `PASSED` | none |
| none | no | 1 or more | on | `FAILED` | recovered steps (strict) |
| 1 or more | no | any | any | `FAILED` | none (labels on each failure) |
| any | yes | any | any | `FAILED` | environment down |

`summary.json` carries these as additive fields: `reason`, `down` (what the re-check found down), `recovered`, `notRun`, `strict`, and `failures[].label`.

---

## 4. Querying & API Access

The orchestrator provides unified access to both database-backed telemetry and filesystem-backed artifacts:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/runs` | `GET` | Returns execution history sorted by `started_at DESC`, merging SQLite records with filesystem summary metadata. |
| `/api/runs/:runId` | `GET` | Returns full run metadata, scenario-level artifact listings, captured screenshots, and the array of all associated `stepRuns`. |
| `/api/step-runs` | `GET` | Queries step execution telemetry filtered by `scenarioId`, `stepId`, or `runId`. |
| `/api/steps/:stepId/runs` | `GET` | Queries historical execution records for a specific step across all runs, enabling flakiness detection and performance tracking. |

---

## 5. UI Representation

In the Web GUI:

- **Runner View (`ui/src/views/runner/`)**:
  - **Step tree**: each failed step shows its failure label badge (`Environment Down`, `Assertion Failed`, `Step Error`); a recovered step shows a `Recovered` warning badge, and its scenario header counts recovered steps. A scenario that failed in setup shows its label and error in the scenario header. Scenarios the run never reached show `Not Run`.
  - **Status bar**: Passed, Failed, Not Run, Recovered and Total counts (Not Run and Recovered only when above zero), plus an `Environment Down` badge naming what was down.
- **Reports & Artifacts View (`ArtifactsView.tsx`)**:
  - **Run History Sidebar**: Displays run timestamp, environment, duration, and status badge.
  - **Run Details View**:
    - **Screenshots Tab**: Grid of screenshots captured during failures or explicit visual check steps.
    - **Step Runs Tab**: Tabular breakdown of every step attempt, including step identifier, scenario, retry attempt, duration in milliseconds, status badge, failure label, a recovered marker on a passing retry, and diagnostic error message or status code.
    - **Run Log Tab**: Full terminal stream and execution log (`run.log`).
- **Badge Convention**: All run and step status badges are formatted in Title Case (`Passed`, `Failed`, `Running`, `Cancelled`, `Not Run`, `Recovered`, `Environment Down`, `Assertion Failed`, `Step Error`).

---

## 6. Core Invariants

1. **Cascading Run Deletion**: Deleting a run row automatically cascades and deletes all associated `step_runs`.
2. **Immutable Execution Records**: Step runs preserve historical telemetry even if scenario definitions or step configurations are modified or deleted later.
3. **Guaranteed Finalization**: The runner always finalizes run status in database storage before closing connections or releasing system resources.
4. **One Label per Final Failure**: Every final failure carries exactly one failure label; an environment-down label always stops the run.
5. **Counts Add Up**: A run's passed, failed and not-run scenario-iterations always sum to its total.
