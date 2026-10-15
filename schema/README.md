# Schemas

| File | Validates | `$id` |
| --- | --- | --- |
| `v1/scenario.schema.json` | Scenario JSON files | `urn:e2e-conductor:scenario:v1` |
| `v1/flow.schema.json` | Each YAML document of a mobile flow file. No step runs flows any more; the file is a leftover | `urn:e2e-conductor:flow:v1` |

`e2e-conductor list` and `e2e-conductor run` validate every scenario before anything starts: the schema, then the step
check in `src/scenario.ts`, which reads the vocabulary in `src/vocabulary.ts`. A test holds the schema's
step and action fields to that vocabulary.

## Versions

Each folder is one schema version. A file may declare its version: `"version": 1` in a scenario,
`version: 1` in a flow header. A file without `version` is version 1, now and after later versions ship.

- **Additive change** (a new optional field, a new flow command): edit the current version in place.
- **Breaking change** (rename, remove, tighten a rule, change a meaning): copy the folder to the next
  version, change its `$id` and `version` const, and load both versions until the old one is dropped.
  Files written for the new version must declare it.

**Exception, kept in v1:** removing the step fields `run`, `flow` and `params` (and `params` on an
action) was a breaking change made in place. No driver ran them, and the step check already
rejected any scenario that had one, so no file that ran before stops passing. A v2 would have
protected no working file.

## Editor support

Scenario JSON:

```json
{ "$schema": "../node_modules/e2e-conductor/schema/v1/scenario.schema.json" }
```
