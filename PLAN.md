# Implementation Plan: Universal Step Actions & Scenario Studio Refactor

## Objective
Provide an intuitive, clean, and reliable **Scenario Studio** exclusively dedicated to authoring and configuring scenarios, with prominent **Step Actions Sequence** across all driver types (Web, Mobile, HTTP, Shell), without backward-compatibility cruft. All test execution telemetry, run history, and run triggers are segregated exclusively in the **Runner** tab.

---

## Architecture Summary
1. **Universal Step Actions**: Every step across all drivers (`web`, `mobile`, `http`, `shell`) supports an ordered array of `actions: StepAction[]`.
   - **Web**: `navigate`, `click`, `fill`, `type`, `press`, `wait_for`, `assert_visible`, `assert_text`, `hover`, `select`, `check`, `uncheck`, `screenshot`, `eval`.
   - **Mobile**: `tap`, `type`, `press`, `swipe`, `assert_visible`, `assert_not_visible`, `wait_for`, `back`, `hidekeyboard`, `launch`, `stop`.
   - **HTTP**: `http_get`, `http_post`, `http_put`, `http_patch`, `http_delete` (with `url`, `headers`, `body`, and expected `status`).
   - **Shell**: `shell` (with `command`, `cwd`, and expected `exit_code`).
2. **Dedicated Scenario Studio**: Clean 3-pane layout:
   - Left: Scenario search & selection list (`4 Steps` badge in Title Case, `+ New Scenario`).
   - Center: Milestone step sequence cards with driver badges, action summaries, step reordering, duplication, deletion, and quick-add buttons.
   - Right: Step Inspector featuring the **Step Actions Sequence** card prominently at the top, followed by Execution & Retry Policy.
3. **Execution Separation**: Scenario Studio contains zero run buttons or run history tables. The **Runner** tab (`RunnerView`) handles all execution controls, multi-scenario selection, execution live stream, and execution logs.
4. **Resilient Dual-Write & Validation**:
   - Schema validation (`schema/v1/scenario.schema.json`) and scenario validation (`src/scenario.ts`) fully accept `actions` across all targets.
   - Dual-write saves simultaneously to SQLite (`.e2e/e2e.db`) and filesystem (`.e2e/scenarios/<id>.json`).
   - Step presets saved to SQLite and dual-written to `.e2e/presets/<id>.json`.

---

## Status & Progress Checklist

- [x] **Backend & Drivers**:
  - [x] Extend `src/drivers/http.ts` to execute sequential composite `actions` (`http_get`, `http_post`, etc.).
  - [x] Extend `src/drivers/shell.ts` to execute sequential composite `actions` (`shell` commands).
  - [x] Update `src/drivers/web.ts` and `src/drivers/mobile.ts` to directly evaluate `step.actions`.
  - [x] Update JSON Schema `schema/v1/scenario.schema.json` allowing `StepAction` HTTP and shell fields.
  - [x] Update `src/scenario.ts` `DRIVER_FIELDS` and `hasRequired` validation across all drivers.
  - [x] Update `src/db.ts` and `ui/src/types.ts` types for universal `StepAction`.

- [x] **Scenario Studio UI (`ui/src/components/ScenarioBuilder.tsx`)**:
  - [x] Strip all run-related UI, attempt counts, execution logs, and flow editor sidebars.
  - [x] Prominently display **Step Actions Sequence** at the top of the Step Inspector for all drivers.
  - [x] Add interactive action cards with type dropdown, inputs, move up/down, and delete.
  - [x] Add prominent `+ Add Action to Step` button.
  - [x] Add auto-migration in `selectScenario` ensuring every step initializes an `actions` array.
  - [x] Synchronize `draftScenario.raw` and `draftScenario.steps` on save.
  - [x] Add startup connection retry in `ui/src/App.tsx` for resilient Vite dev proxy loading.

- [x] **Verification & Documentation**:
  - [x] Visual verification in Playwright browser confirming Step Actions panel on all steps.
  - [x] Visual verification confirming scenario save persists without errors.
  - [x] Verify Runner tab maintains full execution workflow.
  - [x] Update domain documentation in `docs/domain/scenarios.md`.
  - [x] Update unit test suite in `test/scenario.test.ts` (all 60 tests pass).
  - [x] Pass `pnpm exec biome check --write`, `pnpm run check`, and `pnpm run build:ui`.
  - [x] Commit and push to branch `feat/web-gui`.
