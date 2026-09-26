# Schemas

| File | Validates | `$id` |
| --- | --- | --- |
| `v1/scenario.schema.json` | Scenario JSON files | `urn:e2e-orchestrator:scenario:v1` |
| `v1/flow.schema.json` | Each YAML document of a mobile flow file | `urn:e2e-orchestrator:flow:v1` |

`e2e list` and `e2e run` validate every scenario and every flow a scenario names before anything starts.

## Versions

Each folder is one schema version. A file may declare its version: `"version": 1` in a scenario,
`version: 1` in a flow header. A file without `version` is version 1, now and after later versions ship.

- **Additive change** (a new optional field, a new flow command): edit the current version in place.
- **Breaking change** (rename, remove, tighten a rule, change a meaning): copy the folder to the next
  version, change its `$id` and `version` const, and load both versions until the old one is dropped.
  Files written for the new version must declare it.

## Editor support

Scenario JSON:

```json
{ "$schema": "../node_modules/e2e-orchestrator/schema/v1/scenario.schema.json" }
```

Flow YAML (with the YAML extension, which reads this comment):

```yaml
# yaml-language-server: $schema=../node_modules/e2e-orchestrator/schema/v1/flow.schema.json
```
