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
  fixed_scenarios INTEGER DEFAULT 0,   -- Scenario-iterations that paused on a failure and passed after a manual retry
  pid INTEGER                          -- The process running it (section 2, Interruption)
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

CREATE TABLE IF NOT EXISTS scenario_runs (
  run_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,       -- SHA-256 of the scenario content the iteration started with (section 5)
  status TEXT NOT NULL,            -- "RUNNING", "PASSED", "FAILED", "FIXED", "CANCELLED"
  artifacts_dir TEXT,              -- The iteration's folder under the run's artifacts folder
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (run_id, scenario_id, iteration)
);

CREATE TABLE IF NOT EXISTS scenario_versions (
  fingerprint TEXT PRIMARY KEY,
  scenario_json TEXT NOT NULL,     -- The canonical content the fingerprint was computed from
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario ON scenario_runs(scenario_id, started_at);
CREATE INDEX IF NOT EXISTS idx_step_runs_run ON step_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_step ON step_runs(step_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_scenario ON step_runs(scenario_id);
```

A step run's id is `<runId>:<scenarioId>:<iteration>:<stepIndex>:<attempt>`, so every iteration of a `--repeat` run keeps its own attempt rows. The `scenario_runs` and `scenario_versions` tables are created on open like every other table. Databases created before `reason`, `recovered_steps`, `not_run_scenarios`, `fixed_scenarios`, `failure_label` and `manual` existed get those columns when they are opened (`openDatabase` in `src/db/connection.ts`).

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
4. **Interruption**: Ctrl+C (SIGINT, exit 130) and `kill` (SIGTERM, exit 143) both store the run as `CANCELLED`, stop the services the run started, close the drivers and restore the device's keyboards and autofill before the process exits. A run whose process died without that (killed with SIGKILL, crashed, machine restarted) stays `RUNNING` in the table; `effectiveStatus` in `src/db/runs.ts` reads it as `CANCELLED` when its `pid` no longer exists, or when it has no `pid` (runs from before the column) and is not the server's active run. `GET /api/runs` and `GET /api/runs/:runId` return that status.
5. **Logs**: every line goes to `<results>/run.log` (the newest run) and to `<results>/artifacts/<runId>/run.log` (kept with the run). `GET /api/runs/:runId` returns the run's own log, falls back to `run.log` only for the run `summary.json` describes, and returns an empty log otherwise.
6. **Report**: `GET /api/runs/:runId` also returns `report`, built by `buildRunReport` in `src/run-report.ts`: one entry per scenario-iteration with its current scenario name, duration, files, and one row per step, named from the pinned content (section 5), its attempts collapsed into a status (`PASSED`, `FAILED`, `RUNNING`, `NOT_RUN`), the last failure's error and label, and whether it passed on an automatic retry (recovered) or a manual one. The Reports tab shows this, failed scenarios first.

### Scenario Selection and Draft Runs
A run is either ordinary or a draft run, never both (`loadScenarios` in `src/scenario.ts`, gate in `src/draft-run.ts`).

- **Ordinary run** (run all, a `-s` / `scenarios` substring filter, `e2e-conductor run`, `e2e-conductor list`): drafts and draft revisions are dropped first, then the filter applies, then validation. An invalid draft never fails an ordinary run. When a filter matches only drafts, the run stops before preflight with `"<text>" matches only drafts (<ids>). Drafts run from the UI's Drafts tab.`, and `e2e-conductor run` exits 1.
- **Draft run** (`RunOptions.drafts`, `POST /api/run` with `drafts`): loads exactly those ids, never by substring, and ignores `scenarios`. `run()` refuses it before opening anything unless every id is a draft or revision and the environment the run loaded has the draft mark (`allowDrafts`, `environments.md` section 5). The refusal names the environments that allow drafts, or says none does and that the mark is set in the UI's Config view. `E2E_ENV` and `--env` do not get around it: the check reads the environment actually loaded.
- **Over HTTP**, `POST /api/run` with `drafts` runs the same checks before it sets the active run or answers: the requested `environment` loads, every id is a draft, and the mark is set. A failure answers 409 with the message, and no run starts. An ordinary run whose `environment` fails to load still falls back to the active environment.
- **The CLI** has no way to start a draft run or to set the mark.

### Step Run Lifecycle
1. **Per-Attempt Tracking**: Each step attempt (initial execution or retry) creates a `step_runs` record with `status = "RUNNING"`.
2. **Outcome Recording**:
   - If the step succeeds, `status = "PASSED"`, `duration_ms` is recorded, and any HTTP status code or result data is stored.
   - If the step fails, `status = "FAILED"`, `duration_ms` is recorded, and the sanitized error message is saved. When the driver returned a result before an assertion failed, its status code and result data are saved too, so the row shows what the assertion was read against.
   - If configured retries remain, subsequent attempts insert new `step_runs` rows with incremented `attempt` numbers.
   - When the final attempt fails, the runner re-checks the environment (section 3) and stores the failure label on that attempt's row.
   - A step whose final row is `PASSED` with `attempt > 1` and `manual = 0` is **recovered**. Recovered is derived from the rows, not stored per step. A step that passed on a manual retry is never recovered.
   - Manual retries (section 4) add rows with `manual = 1`, numbered after the automatic attempts.

### Step History
Each step's latest 20 **executions** summarize how it has been doing (`src/db/step-history.ts`). Nothing new is stored; the history is read from `step_runs`.
- **Execution**: one per step per scenario-iteration, read from its last automatic attempt. Manual retries during a pause are left out, so a step that failed and was fixed by hand counts as failed. `RUNNING` and `CANCELLED` attempts are left out.
- **Outcomes**: passed (first attempt), recovered (passed on attempt 2 or later), failed.
- **p95**: the 95th percentile duration of passing executions, nearest rank. Absent when none passed.
- **Flaky**: at least one recovered execution, or both passed and failed executions, in the window.
- **Identity**: by `step_id`, so history follows a step through edits and reordering, and spans every environment. A step whose content changed keeps its older executions.

When a scenario-iteration fails or is fixed (section 4), each driver it used keeps evidence in its artifacts folder. Every file is best-effort: one that cannot be captured is skipped and never changes the outcome.
- **Web**: `web-trace.zip`, the Playwright trace of the whole scenario.
- **Android**: `mobile-failure.png` (the screen), `mobile-logcat.txt` (`adb logcat -d -v threadtime -v year -v UTC`, so each line carries the year and a UTC time; Android before 7 rejects those modifiers, and its adb still reports success with the usage text as output, so when the output holds no log line the driver captures again with plain `-v threadtime`) and `mobile-ui.xml` (the `uiautomator dump` view hierarchy, written only when the dump succeeds). The driver clears the device log (`adb logcat -c`) before each scenario-iteration's first step (`startScenario` on the `Driver` interface), so the log covers only that scenario-iteration. A device that refuses to clear keeps older lines too.
- **HTTP**: `http-exchanges.json`, every request of the scenario-iteration in order (latest 200): step name, start time, duration, method, URL, headers and body, and the response's status, headers and body (cut at 64 KB), or the error of a request that got no response. Values of headers, fields and URL query parameters named like a credential (`authorization`, `cookie`, `password`, `secret`, `token`, `api_key`, `session`, case-insensitive, at any depth) are written as `[redacted]`, and so are the values of `name=value` or `"name": "value"` pairs with such names inside a text body (a form-encoded token response, say). A body is redacted before it is cut, so a cut body never holds a credential. The driver keeps exchanges in memory only until the scenario-iteration ends, and drops them when it passes.
- **Shell**: nothing.

The files show under **Result Files & Reports** in the GUI (section 7).

### Failure Timeline
A failed or fixed scenario-iteration's evidence can be read on one clock (`buildFailureTimeline` in `src/failure-timeline.ts`). It is built when asked for, from what is already stored; nothing new is saved.
- **Step attempts**: every attempt in `step_runs`, automatic and manual, at its `created_at`, with its outcome and the first line of its error.
- **HTTP**: every exchange in `http-exchanges.json`, at its `startedAt`: method, path, status (or the error of a request that got no response) and step name. Status 400 and up is an error.
- **Device**: `mobile-logcat.txt` lines at warning level and worse (`W`, `E`, `F`, `A`). Consecutive lines of one thread, tag and level at the same millisecond (a stack trace) make one entry, of at most 30 lines. Only the latest 100 entries show; the count of all of them comes with the timeline. Lines with the year are read as UTC, so they line up with the host clock. Lines without it (logs from older devices or older runs) are read in the host's time zone, in the year nearest the scenario-iteration's start, and the timeline says the times are assumed.
- **Web**: not on the timeline. Browser detail stays in `web-trace.zip`.
- **Order**: by time. On a tie, step attempts come first, then requests, then device lines.

**Known limits:** a device clock that drifts from the host clock shifts its lines by the drift. Emulators take the host's clock; a physical device is only as close as its network time.

A run started with **Screenshot Every Step** (`e2e-conductor run --screenshots`, or `POST /api/run` with `stepScreenshots: true`) saves the screen after each web and Android step as `step-<n>.png` (`<n>` is the 1-based step position) in the scenario-iteration's artifacts folder. The option is off by default; without it a run saves only the failure evidence it always did.
- **When**: after the step's last automatic attempt, passed or failed, and before the re-check and any pause, so a failed step shows the screen it failed on. A manual retry during a pause (section 4) retakes it, so the image always shows the step's final attempt.
- **Which steps**: only targets whose driver has a screen (`captureScreen` on `WebDriver` and `MobileDriver`). HTTP and shell steps get no image. Web images capture the viewport; the failure screenshot stays full-page.
- **Best-effort**: an Android capture times out after 10 s. A failed capture is logged as a detail line and never changes the step's status, duration or failure label. Capture time is not counted in the step's `duration_ms`.
- **Storage**: images are files only; nothing is stored in SQLite. The run report (`buildRunReport` in `src/run-report.ts`) attaches each `step-<n>.png` to step `<n>` of its scenario-iteration as `screenshot`.

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

A platform's `needs` (`platforms.md`, section 3) adds the services of the platforms it lists to what the run prepares, so an Android app or web app that needs an API platform gets that API's service re-checked too, even in a run whose steps never call the API.

**Known limit:** Shell targets name no service, and an Android or web platform without `needs` names only its own (a web app) or none (an Android app). A backend dying behind such a target reads as `Step error`.

### Environment-down stop
When a failure is labeled `Environment down`, the run stops. No further steps or scenarios run. The stop is a normal return, not a throw, so `summary.json`, the result line and the `finish` event are always written. The run is stored `FAILED` (never `CANCELLED`) with `reason = "environment down"`, and every scenario-iteration it never reached is listed in `summary.notRun`. Counts always add up: `passed + failed + notRun = total`. The CLI exits 1.

If the user cancels while the re-check runs, cancellation wins: the run is `CANCELLED` and no label is stored.

### Recovered steps and `--strict`
A recovered step passes and its run passes. The summary's `recovered` count, the CLI result line and the GUI show it. With `e2e-conductor run --strict`, any recovered step fails the run with `reason = "recovered steps (strict)"`. The environment-down and fixed-during-run reasons take precedence over the strict reason. The GUI has no strict option yet.

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
A retry that passes is saved over the stored step it was made for (`scenarios.md`, section 5), and the run uses the fix for the rest of its iterations. The stored step is found by its id. When no stored step has that id, because the step was deleted during the pause, nothing is written, the run log says so, and the GUI shows a "Fix Not Saved" warning. The passing `hold_retry` event carries `savedTo`, the scenario's name, only when the save happened.

### Events
`hold_start` (the paused step, its error and label, whether a retry passed, and the targets the run prepared), `hold_retry` (each retry's result and the step it ran, with the paused step's id), and `hold_end` (`continue`, `end`, or `stopped` when a retry found the environment down). `scenario_end` carries `fixed: true` for a fixed scenario. `GET /api/run/status` reports the paused step as `currentRun.paused`, so a reloaded page shows the pause.

---

## 5. Scenario Versions

Every run pins each scenario-iteration it starts to the scenario content it ran, so run history says what actually ran even after the scenario is edited in place.

### The fingerprint
`scenarioVersion` (`src/scenario-version.ts`) builds canonical JSON from the content that decides what a run does, and hashes it with SHA-256:
- It keeps `setup` (fixture names), `vars` and `steps`, as written, and `read_only` only when it is `true`, so scenarios saved before the field existed keep their fingerprint. Turning `read_only` on or off changes which later setups the run skips, so it counts as a change. Placeholders such as `${env.TOKEN}` stay unsubstituted, so no secret is stored.
- It leaves out the scenario name and description, every step id and every action id. Changing them changes nothing that runs.
- It sorts object keys, drops `null` and `undefined` fields of each step and action, and treats a missing `setup` as `[]` and missing `vars` as `{}`, so the same scenario read from SQLite or from JSON gets the same fingerprint. A `null` inside `vars`, a body or an assertion is kept: it changes what runs. Array order counts.

Changes outside the scenario record are not part of the fingerprint: a fixture's command, platform and environment configuration, and `${env.*}` values.

The canonical JSON is stored once per fingerprint in `scenario_versions`. A later save of the same fingerprint keeps the stored content.

### Lifecycle
When a scenario-iteration starts, before its setup fixtures, `runScenario` (`src/scenario-run.ts`) stores the version and inserts a `scenario_runs` row with `status = "RUNNING"`. When it ends, the row gets one outcome:

| Outcome | When |
|---|---|
| `CANCELLED` | The run was cancelled. Takes precedence over everything else. |
| `FIXED` | The scenario paused, and continued past every pause to its last step (section 4). |
| `FAILED` | A step or setup fixture failed and was not fixed. |
| `PASSED` | Everything else. |

Scenario-iterations an environment-down stop never reached record nothing. A process killed mid-scenario leaves `RUNNING`. Every connection waits up to 5 seconds for another connection's write transaction (an `e2e-conductor save`, for example) before a write fails, so these writes land after it commits. Writes are best effort: a failed write never fails a step, a scenario or the run, and never changes the exit code, `summary.json` or run events.

A fix saved during a pause changes the scenario in memory, not the iteration's row: the iteration keeps the fingerprint it started with, and the next iteration records the fixed content. Runs from before these tables existed have no rows.

### Changed since last pass
A scenario-iteration is **changed since last pass** when the latest `PASSED` row of the same scenario that started before it, in any run or environment, has a different fingerprint. Only a plain pass counts: `FIXED`, `FAILED`, `CANCELLED` and `RUNNING` rows are never the last pass. With no earlier pass there is nothing to compare, so the scenario-iteration is not marked. The marker is derived when read (`getScenarioRuns` in `src/db/scenario-runs.ts`), not stored, so a later pass never changes an earlier row's marker.

### Passed on current content
A scenario has **passed on its current content** when the latest run that ran it with its current fingerprint finished every iteration `PASSED`. `FIXED`, `FAILED`, `CANCELLED` and `RUNNING` rows make that run not count, so a later failed run on the same content clears the pass. Recovered steps count, as they do for a run's `PASSED`. It is derived when read (`passedOnContent` in `src/db/scenario-runs.ts`), never stored: any change to the steps gives a new fingerprint and needs a new pass. Keeping a draft requires it (`scenarios.md`, section 1, Drafts).

---

## 6. Querying & API Access

The orchestrator provides unified access to both database-backed telemetry and filesystem-backed artifacts:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/run` | `POST` | Starts a run (`scenarios`, `repeat`, `environment`, `pauseOnFailure`, `drafts`, ...) and answers `{ ok, runId }`. 409 when a run is in progress, or for a draft run that is refused (section 2, Scenario Selection and Draft Runs). |
| `/api/run/status` | `GET` | Whether a run is going on, the active run (`currentRun`, with `paused`), the last run's summary (`lastSummary`) and the last suite run's summary (`lastSuiteSummary`: the last run that was not a draft run, or `null`). A draft run's summary carries `drafts: true`, also on the SSE `finish` event, so the header's last-run status reads only suite runs while the Runner shows any run. |
| `/api/runs` | `GET` | Returns execution history sorted by `started_at DESC`, merging SQLite records with filesystem summary metadata. |
| `/api/runs/:runId` | `GET` | Returns full run metadata, scenario-level artifact listings (each URL carries `?v=<mtime>`, because artifacts are served with a one-hour cache and a manual retry rewrites a step screenshot in place), captured screenshots, the array of all associated `stepRuns`, and `scenarioRuns`: each scenario-iteration's `fingerprint`, `status`, `artifactsDir` and `changedSinceLastPass` (section 5). |
| `/api/runs/:runId/scenarios/:scenarioId/:iteration/timeline` | `GET` | The scenario-iteration's failure timeline (section 2, Failure Timeline): `startedAt`, `events` (each with `at`, `source` `step`, `http` or `device`, `level`, `title`, `detail` and `durationMs`), `deviceEntries` and `deviceClock` (`exact` or `assumed`). 404 when the run has no such scenario-iteration. |
| `/api/step-runs` | `GET` | Queries step execution telemetry filtered by `scenarioId`, `stepId`, or `runId`. |
| `/api/run/hold/retry` | `POST` | Retries an edited step (`{ step }`) on the paused run. 400 for an invalid step or an unprepared target, 409 when the run is not paused. |
| `/api/run/hold/continue` | `POST` | Continues the paused scenario from the next step. 409 until a retry has passed. |
| `/api/run/hold/end-scenario` | `POST` | Ends the paused scenario failed; the run moves on. 409 when the run is not paused. |
| `/api/scenarios/:id/step-history` | `GET` | Each step's history (section 2, Step History), keyed by step id: `executions`, `passed`, `recovered`, `failed`, `p95Ms` and `recent` (outcomes newest first). Steps that never ran are absent. |
| `/api/steps/:stepId/runs` | `GET` | Queries historical execution records for a specific step across all runs, enabling flakiness detection and performance tracking. |

---

## 7. UI Representation

In the Web GUI:

- **Runner View (`ui/src/views/runner/`)**:
  - **Step tree**: each failed step shows its failure label badge (`Environment Down`, `Assertion Failed`, `Step Error`); a recovered step shows a `Recovered` warning badge, and its scenario header counts recovered steps. A scenario that failed in setup shows its label and error in the scenario header. Scenarios the run never reached show `Not Run`.
  - **Status bar**: Passed, Failed, Fixed, Not Run, Recovered and Total counts (Fixed, Not Run and Recovered only when above zero), plus an `Environment Down` badge naming what was down, or a `Fixed During Run` badge.
  - **Run Options**: `Pause on Failure` and `Screenshot Every Step` checkboxes, both off by default and not kept across a page reload.
  - **Pause banner** (`PausePanel.tsx`): while the run is paused, shows the scenario, step, label and error, with `Edit and Retry Step` (a JSON dialog, `RetryStepModal.tsx`), `Continue` (enabled once a retry passes), `End Scenario` and `Stop Run`. A passing retry shows a toast naming the scenario the fix was saved to.
  - **Fixed results**: a fixed scenario shows a `Fixed` badge; its fixed step shows `Fixed By Retry` and its number of manual retries.
- **Scenario Builder (`ui/src/views/scenario-builder/`)**:
  - **Step list**: a step that is flaky (section 2, Step History) shows a `Flaky` warning badge.
  - **Run History panel** (`StepHistoryPanel.tsx`), under the selected step's retry policy: first-try passes out of the latest executions, a strip of outcomes (oldest left), recovered and failed counts, and the p95 duration of passes.
- **Drafts View (`ui/src/views/drafts/`)**, the `Drafts` tab (`?tab=drafts`):
    - One card per prompt group (`GET /api/drafts`): the prompt, the agent that saved it, and how many drafts it holds and how many passed. Each draft row shows its state badge (`Draft`, `Bug Found`), its pass badge (`Passed`, `Not Yet Passed`, or `Fixed, Run Again` when its last run passed only after a fix while paused), `Revision of <kept name>` on a revision, and its readback: steps as plain sentences, the targets and fixtures it uses, and any shell commands and full URLs verbatim.
    - **Run Batch** runs every draft in the group as one draft run (`drafts` plus the chosen environment), with an optional `Pause on Failure`, and switches to the Runner. The environment select lists only environments with the draft mark, defaulting to the active one when it is marked. With none marked, the card says so, links to Config, Environments, and offers no Run Batch. A refusal (409) shows the server's message and stays on the Drafts tab.
    - `Keep` shows only on a draft whose current content passed; `Keep All Passing` keeps every such draft in the group and names any revision it skipped. `Mark Bug Found` shows on a draft that ran and has not passed. `Discard` and `Discard Group` ask for confirmation first. `Edit in Builder` opens the draft in the Scenario Builder, where it stays a draft.
    - With no drafts, an empty state says how an agent saves them (`e2e-conductor kit`, then `e2e-conductor save`).
- **Runner View and drafts**: the scenario list, the default selection and Select All cover kept scenarios only, so an ordinary run from the Runner never includes a draft. A draft run's steps and pause still show, because the step tree and pause banner read every scenario.
- **Reports & Artifacts View (`ArtifactsView.tsx`)**:
  - **Run History Sidebar**: Displays run timestamp, environment, duration, and status badge.
  - **Run Details View**:
    - **Results Tab**: each step row shows a thumbnail of its step screenshot (section 2, Step Screenshots) when one exists; clicking it opens the full-size preview. The scenario's `Saved when it failed` list leaves out step screenshots. A failed or fixed scenario has a `Show Timeline` button that opens its failure timeline (section 2, Failure Timeline, `FailureTimeline.tsx`): each event's time since the scenario started, a `Step`, `HTTP` or `Device` badge, and its title and detail, errors in red and warnings in yellow. A failed scenario also has a `Re-run with Pause on Failure` button, disabled while a run is in progress: it starts a new run of just that scenario (for a draft or revision, a draft run of exactly that id, which the active environment must allow) (one repeat, services started, headed, in the active environment) with Pause on Failure on, and switches to the Runner, where the pause banner handles the failure.
    - **Screenshots Tab**: Grid of every screenshot in the run: failure screenshots, explicit `screenshot` actions and step screenshots. Below it, **Result Files & Reports** lists each scenario-iteration's folder and files; a scenario-iteration that changed since its last pass (section 5) shows a `Changed Since Last Pass` warning badge, whatever its own outcome.
    - **Step Runs Tab**: Tabular breakdown of every step attempt, including step identifier, scenario, retry attempt, duration in milliseconds, status badge, failure label, a recovered marker on a passing automatic retry, a `Manual Retry` marker on a retry made while paused, and diagnostic error message or status code.
    - **Run Log Tab**: Full terminal stream and execution log (`run.log`).
- **Badge Convention**: All run and step status badges are formatted in Title Case (`Passed`, `Failed`, `Running`, `Cancelled`, `Not Run`, `Recovered`, `Fixed`, `Fixed By Retry`, `Fixed During Run`, `Manual Retry`, `Retry Passed`, `Environment Down`, `Assertion Failed`, `Step Error`, `Changed Since Last Pass`, `Flaky`, `Draft`, `Bug Found`, `Not Yet Passed`, `Fixed, Run Again`).

---

## 8. Core Invariants

1. **Cascading Run Deletion**: Deleting a run row automatically cascades and deletes all associated `step_runs`.
2. **Immutable Execution Records**: Step runs preserve historical telemetry even if scenario definitions or step configurations are modified or deleted later.
3. **Guaranteed Finalization**: The runner always finalizes run status in database storage before closing connections or releasing system resources.
4. **One Label per Final Failure**: Every final failure carries exactly one failure label; an environment-down label always stops the run.
5. **Counts Add Up**: A run's passed, failed, fixed and not-run scenario-iterations always sum to its total.
6. **A Fixed Run Is Never Green**: A run in which the user fixed a step while paused never ends `PASSED`.
7. **A Run Pins Only What It Started**: A scenario-iteration is pinned to the content it started with, and only scenario-iterations that started are pinned.
8. **Drafts Stay Out of Ordinary Runs**: An ordinary run never loads a draft, and a draft run loads only drafts, by exact id, on an environment with the draft mark.
