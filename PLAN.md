# Plan: Composite Step Actions & Reusable Step Presets (Option B)

## Overview
This initiative transitions `e2e-orchestrator` to a **Composite Step Architecture** with zero-code orchestration, SQLite persistence, and JSON portability:
- **Scenario**: Contains milestone/phase **Steps** (e.g., *"Admin Web Login"*, *"Seed Inventory"*, *"Verify Notification"*).
- **Composite Step (`step.actions`)**: Each step contains an ordered array of execution **Actions** (`StepAction[]`) such as `navigate`, `fill`, `click`, `wait_for`, `tap`, `swipe`.
- **Reusable Step Presets (`step_presets`)**: A Preset is a reusable **Step** template. Saved presets are stored directly in SQLite (`step_presets` table) and dual-written to `.e2e/presets/<id>.json` on disk for Git versioning and export/import portability.
- **Scenario Studio UI**: Provides an intuitive Actions Inspector for each Step (add, edit, reorder, delete actions) and a 1-click Preset workflow ("Save Step as Preset" and "Add Step from Preset").

---

## Progress Checklist

- [x] **Phase 1: Database Schema & Presets Layer (`src/db.ts`)**
  - [x] Define `StepAction` type (`id`, `name`, `action`, `selector`, `value`, `url`, `key`, `ms`).
  - [x] Extend `Step` interface with `actions?: StepAction[]`.
  - [x] Define `StepPreset` type (`id`, `name`, `description`, `target`, `step`, `createdAt`, `updatedAt`).
  - [x] Add `step_presets` table in `openDatabase()`.
  - [x] Implement `getStepPresets(db)`, `getStepPreset(db, id)`, `saveStepPreset(db, preset)`, `deleteStepPreset(db, id)`.

- [x] **Phase 2: Driver Execution Loops (`src/drivers/web.ts` & `src/drivers/mobile.ts`)**
  - [x] In `WebDriver.run()`: sequentially execute `step.actions` if present, with error attribution (action index + name), falling back to single `step.action` or `step.run`.
  - [x] In `MobileDriver.run()`: sequentially execute `step.actions` if present, with error attribution, falling back to single `step.action` or `step.flow`.

- [x] **Phase 3: Schema Validation & Presets Seeding (`schema/` & `src/scenario.ts`)**
  - [x] Update `schema/v1/scenario.schema.json` with `actions: StepAction[]`.
  - [x] Update `src/scenario.ts` to allow `actions` in `DRIVER_FIELDS` and `hasRequired` checks.
  - [x] Implement `getOrSeedPresets(config)` for SQLite + `.e2e/presets/*.json` file synchronization.

- [x] **Phase 4: Backend API Endpoints (`src/server.ts`)**
  - [x] `GET /api/presets`: Return all step presets (SQLite + seeded files).
  - [x] `POST /api/presets`: Save preset to SQLite and dual-write to `.e2e/presets/<id>.json`.
  - [x] `DELETE /api/presets/:id`: Delete preset from SQLite and remove `.e2e/presets/<id>.json`.

- [x] **Phase 5: Frontend UI & Presets Workflow (`ui/`)**
  - [x] Update `ui/src/types.ts` (`StepAction`, `StepPreset`) and `ui/src/api.ts` (`fetchStepPresets`, `saveStepPreset`, `deleteStepPreset`).
  - [x] In `ScenarioBuilder.tsx` Step Inspector: render ordered Actions list with "+ Add Action", edit action type/fields, reorder (Up/Down), and delete.
  - [x] In `ScenarioBuilder.tsx` Step Inspector Header: add "Save Step as Preset" dialog/action.
  - [x] In `ScenarioBuilder.tsx` Stepper Header: add "+ From Preset" dialog to insert pre-configured steps.

- [x] **Phase 6: Domain Documentation & Automated Verification**
  - [x] Synchronize `docs/domain/scenarios.md` with composite steps and presets schema.
  - [x] Add unit tests in `test/db.test.ts` for composite actions and presets dual-write.
  - [x] Run `pnpm exec biome check --write`.
  - [x] Run `pnpm run check` and `pnpm test`.
