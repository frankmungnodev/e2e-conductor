# Plan: Clean Scenario Studio & Direct Composite Actions

## Overview
Based on user feedback, streamline the Scenario Studio into a clean, dedicated authoring tool and eliminate all backward-compatibility cruft:
1. **Dedicated Authoring Focus**: Remove all execution-related features from Scenario Studio (no run histories, no step run telemetry, no run buttons). Execution is exclusively owned by the **Runner** tab (`RunnerView`).
2. **Immediate Step Actions UI**: When inspecting a step, the **Step Actions** list is immediately visible as the primary interface (no tabs hiding it, no defaulting to empty run logs).
3. **Zero Backward-Compatibility Debt**:
   - Web & Mobile steps exclusively execute `step.actions: StepAction[]`.
   - Remove legacy fallback branches (`step.run`, `step.flow`, single `step.action` legacy fields) from drivers and UI.
   - Remove mobile YAML flows explorer and editor from Scenario Studio.

---

## Progress Checklist

- [x] **Phase 1: Driver Simplification (`src/drivers/web.ts` & `src/drivers/mobile.ts`)**
  - [x] `WebDriver.run()`: Execute `step.actions` directly as an ordered action sequence. Remove legacy fallback code for `step.run` / single `step.action`.
  - [x] `MobileDriver.run()`: Execute `step.actions` directly via `executeAction()`. Remove legacy fallback code for `step.flow` / single `step.action`.
  - [x] Remove `step.action`, `step.selector`, etc. legacy validation requirements from `src/scenario.ts` and `schema/v1/scenario.schema.json`.

- [x] **Phase 2: Clean Scenario Studio UI (`ui/src/components/ScenarioBuilder.tsx`)**
  - [x] Remove all run telemetry states and effects (`scenarioStepRuns`, `fetchStepRuns`, `latestStepRun`, `stepTab === "runs"`).
  - [x] Remove "Run Scenario" button and run status indicators from Scenario Studio header.
  - [x] Remove mobile flow files explorer and draftFlow state (mobile uses pure declarative step actions).
  - [x] Render **Step Actions** directly and prominently inside the Step Inspector for Web and Mobile targets:
    - Clear action list with card-based inputs (Action dropdown, Target/Selector, Value/Text, URL, Key, Timeout/Delay ms).
    - Up/down reordering buttons and delete action button.
    - Prominent `+ Add Action` button at the bottom of the actions list.
  - [x] Keep Step Inspector focused on: Step Name & Target selector, Step Actions list (or HTTP / Shell config), Retry/Timeout policy, Assertions, and "Save as Preset".

- [x] **Phase 3: Domain Documentation & Automated Verification**
  - [x] Update `docs/domain/scenarios.md` to reflect direct composite actions without legacy fallbacks.
  - [x] Update tests in `test/scenario.test.ts` and `test/db.test.ts`.
  - [x] Run `pnpm exec biome check --write`.
  - [x] Run `pnpm run check` and `pnpm test`.
  - [x] Run `pnpm run build:ui`.
