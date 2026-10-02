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
  completed_at INTEGER
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
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_step_runs_run ON step_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_step ON step_runs(step_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_scenario ON step_runs(scenario_id);
```

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
3. **Completion**: In the execution `finally` block (prior to closing database connections), `saveRun()` updates the row with `completed_at`, computed `duration_ms`, scenario totals, and final status (`PASSED` if zero failures, else `FAILED` or `CANCELLED`).

### Step Run Lifecycle
1. **Per-Attempt Tracking**: Each step attempt (initial execution or retry) creates a `step_runs` record with `status = "RUNNING"`.
2. **Outcome Recording**:
   - If the step succeeds, `status = "PASSED"`, `duration_ms` is recorded, and any HTTP status code or result data is stored.
   - If the step fails, `status = "FAILED"`, `duration_ms` is recorded, and the sanitized error message is saved.
   - If configured retries remain, subsequent attempts insert new `step_runs` rows with incremented `attempt` numbers.

---

## 3. Querying & API Access

The orchestrator provides unified access to both database-backed telemetry and filesystem-backed artifacts:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/runs` | `GET` | Returns execution history sorted by `started_at DESC`, merging SQLite records with filesystem summary metadata. |
| `/api/runs/:runId` | `GET` | Returns full run metadata, scenario-level artifact listings, captured screenshots, and the array of all associated `stepRuns`. |
| `/api/step-runs` | `GET` | Queries step execution telemetry filtered by `scenarioId`, `stepId`, or `runId`. |
| `/api/steps/:stepId/runs` | `GET` | Queries historical execution records for a specific step across all runs, enabling flakiness detection and performance tracking. |

---

## 4. UI Representation

In the Web GUI:

- **Scenarios Studio View (`ScenarioBuilder.tsx`)**:
  - **Explorer Column**: Scenarios list with step count, validation status, and recent health indicators.
  - **Steps Stepper Column**: Compact step sequence showing step index, target driver badge, and latest run outcome pill (`Passed`, `Failed`, `Running`, or `Idle`) with execution timing.
  - **Step Inspector Column**: Deep inspection tabs including **Step Runs & Telemetry** (chronological attempts, status code, duration, and error trace diagnostics), **Configuration** (driver properties, assertions, extractions, timeouts, and retries), and **Raw JSON**.
- **Reports & Artifacts View (`ArtifactsView.tsx`)**:
  - **Run History Sidebar**: Displays run timestamp, environment, duration, and status badge.
  - **Run Details View**:
    - **Screenshots Tab**: Grid of screenshots captured during failures or explicit visual check steps.
    - **Step Runs Tab**: Tabular breakdown of every step attempt, including step identifier, scenario, retry attempt, duration in milliseconds, status badge, and diagnostic error message or status code.
    - **Run Log Tab**: Full terminal stream and execution log (`run.log`).
- **Badge Convention**: All run and step status badges are formatted in Title Case (`Passed`, `Failed`, `Running`, `Cancelled`, `Idle`).

---

## 5. Core Invariants

1. **Cascading Run Deletion**: Deleting a run row automatically cascades and deletes all associated `step_runs`.
2. **Immutable Execution Records**: Step runs preserve historical telemetry even if scenario definitions or step configurations are modified or deleted later.
3. **Guaranteed Finalization**: The runner always finalizes run status in database storage before closing connections or releasing system resources.
