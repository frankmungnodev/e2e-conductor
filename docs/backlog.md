# Backlog

Known follow-up work that is not scheduled yet. Each item says where to start. Delete an item when it ships.

## From the UI component split (2026-10-02)

Context: `docs/plans/2026-10-02-1245-refactor-ui-component-split-plan.md`. None of these blocked the split.

### No automatic run of the UI smoke suite

`pnpm run test:ui` is not part of `pnpm run check`, and the repo has no CI workflow, so the suite only protects changes when someone runs it by hand. Options: add a CI workflow that installs Playwright's Chromium and runs `pnpm run test:ui`, or a pre-push hook.
