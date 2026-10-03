# Backlog

Known follow-up work that is not scheduled yet. Each item says where to start. Delete an item when it ships.

## From the UI component split (2026-10-02)

Context: `docs/plans/2026-10-02-1245-refactor-ui-component-split-plan.md`. None of these blocked the split.

### Untested flows

Neither the smoke tests in `test/ui/` nor the unit tests in `test/ui-helpers.test.ts` cover these:

- Scenario builder (`ui/src/views/scenario-builder/useScenarioDraft.tsx`):
  - saving while the raw-JSON editor is open
  - switching scenarios with unsaved changes, which saves first
  - the save that runs when the view unmounts
  - deleting a scenario
- Step presets (`useStepPresets.tsx`): saving and deleting a preset.
- Config view: editing and deleting a fixture, and the Database tab.
- Runner: runs that repeat, runs with a failing step, and the run-option toggles.

### No automatic run of the UI smoke suite

`pnpm run test:ui` is not part of `pnpm run check`, and the repo has no CI workflow, so the suite only protects changes when someone runs it by hand. Options: add a CI workflow that installs Playwright's Chromium and runs `pnpm run test:ui`, or a pre-push hook.
