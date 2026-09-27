# Plan: Declarative Step Actions & Reusable Step Presets

## Overview
This initiative transitions `e2e-orchestrator` to a **Zero-Code Orchestration** model. Everything needed to define and execute end-to-end scenarios is persisted directly in SQLite (`.e2e/e2e.db`) and portable via standard JSON export/import.
- Eliminates the requirement for `.e2e/modules/` (TypeScript files) for web steps.
- Eliminates the requirement for `.e2e/flows/` (YAML files) for mobile steps.
- Introduces **Reusable Step Presets / Groups** (`step_groups` in SQLite) to easily compose and reuse multi-step flows (like admin login, cart setup, or account verification) across scenarios.
- Enhances the Scenario Studio UI (`ui/src/components/ScenarioBuilder.tsx`) with visual action selectors, tailored controls, and human-readable step badges/summaries.

---

## Progress Checklist

- [x] **Step 1: Database Schema & Data Access Layer (`src/db.ts`)**
  - [x] Add `step_groups` table to SQLite schema (`id`, `name`, `description`, `target`, `steps`, `created_at`, `updated_at`).
  - [x] Add TypeScript types for `StepGroupRecord` and `StepGroup`.
  - [x] Implement CRUD helpers in `src/db.ts`: `getStepGroups(db)`, `getStepGroup(db, id)`, `saveStepGroup(db, group)`, `deleteStepGroup(db, id)`.
  - [x] Update `STEP_COMMON_KEYS` or ensure all declarative action fields (`action`, `selector`, `url`, `value`, `key`, `ms`, etc.) serialize and deserialize transparently.

- [x] **Step 2: Web Driver Native Declarative Actions (`src/drivers/web.ts`)**
  - [x] Implement native action dispatcher in `WebDriver.run()`:
    - `navigate` (`page.goto(url)`)
    - `click` (`page.click(selector)`)
    - `fill` / `type` (`page.fill(selector, value)`)
    - `press` (`page.press(selector ?? "body", key)`)
    - `wait_for` (`page.waitForSelector(selector)` or `page.waitForTimeout(ms)`)
    - `hover` (`page.hover(selector)`)
    - `select` (`page.selectOption(selector, value)`)
    - `check` / `uncheck` (`page.check(selector)` / `page.uncheck(selector)`)
    - `assert_visible` (`page.locator(selector).waitFor({ state: "visible" })`)
    - `assert_text` (verify text content on `page.locator(selector)`)
    - `screenshot` (`page.screenshot({ path })`)
  - [x] Maintain backward-compatible escape hatch: if `step.run` is supplied, load custom TypeScript module.

- [x] **Step 3: Mobile Driver Native Declarative Actions (`src/drivers/mobile.ts` & `src/drivers/adb-flow.ts`)**
  - [x] Expose single-command execution in `AdbFlowRunner` or `MobileDriver` without reading YAML files:
    - `tap` (`runner.runSingleCommand({ tapOn: selector })`)
    - `type` (`runner.runSingleCommand({ inputText: value })`)
    - `press_key` (`runner.runSingleCommand({ pressKey: key })`)
    - `wait` (`runner.runSingleCommand({ waitForAnimationToEnd: ms })` or sleep)
    - `assert_visible` (`runner.runSingleCommand({ assertVisible: selector })`)
    - `launch` (`fresh` | `restart`)
  - [x] Maintain backward-compatible fallback: if `step.flow` is specified, execute existing YAML flow runner.

- [x] **Step 4: Scenario Schema & Validator Updates**
  - [x] Update `schema/v1/scenario.schema.json` to allow declarative action properties (`action`, `selector`, `value`, `key`, `ms`).
  - [x] Update `src/scenario.ts`:
    - Extend `DRIVER_FIELDS` to recognize declarative action keys.
    - Relax `REQUIRED` rules so `web` accepts `action` OR `run`, and `mobile` accepts `action` OR `launch` OR `flow`.

- [x] **Step 5: Backend API Endpoints (`src/server.ts`)**
  - [x] `GET /api/step-groups`: List all reusable step presets.
  - [x] `POST /api/step-groups`: Create or update a reusable preset.
  - [x] `DELETE /api/step-groups/:id`: Remove a reusable preset.

- [x] **Step 6: Frontend API & Types (`ui/src/api.ts` & `ui/src/types.ts`)**
  - [x] Add `StepGroup` interface to `ui/src/types.ts`.
  - [x] Add `fetchStepGroups()`, `saveStepGroup()`, `deleteStepGroup()` to `ui/src/api.ts`.

- [x] **Step 7: Scenario Studio UI Revamp (`ui/src/components/ScenarioBuilder.tsx`)**
  - [x] **Action Selector**: Dropdown of human-friendly actions for Web and Mobile instead of plain text function name inputs.
  - [x] **Dynamic Action Controls**: Tailored input fields based on selected action (`URL`, `Selector`, `Text / Value`, `Key`, `Delay Ms`).
  - [x] **Human-Readable Stepper Labels**: Stepper list displays plain-English summaries (e.g., `🌐 Navigate to "/login"`, `🖱️ Click "#submit"`, `📱 Tap "Allow"`).
  - [x] **Step Presets / Reusable Groups**:
    - "Insert Preset" dropdown/modal to append or insert preset steps into scenario.
    - "Save Selection as Preset" button to save steps as a new preset.

- [x] **Step 8: Domain Documentation Synchronization**
  - [x] Synchronize `docs/domain/scenarios.md` (declarative step actions, schemas, invariants).
  - [x] Synchronize `docs/domain/platforms.md` (no-code driver execution).
  - [x] Synchronize `docs/domain/README.md` (architecture table & references).

- [x] **Step 9: Quality & Verification**
  - [x] Run `pnpm exec biome check --write`.
  - [x] Run `pnpm run check` (TypeScript compilation & linting).
  - [x] Run scenario test suite (`pnpm test` or `e2e run`).
