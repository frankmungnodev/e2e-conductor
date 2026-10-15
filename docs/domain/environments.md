# Environments Domain & Business Logic

An **Environment** represents a target deployment context (e.g. `dev`, `staging`, `prod`, `ci`) where test scenarios execute without altering test definitions.

---

## 1. Storage & Schema

Environments are persisted in SQLite (`src/db/environments.ts`):

```sql
CREATE TABLE IF NOT EXISTS environments (
  name TEXT PRIMARY KEY,
  description TEXT,
  url TEXT,                        -- Primary base URL
  scenarios TEXT,                  -- Folder for scenario JSON files
  flows TEXT,                      -- Folder for Android YAML flows
  results TEXT,                    -- Output folder for run results
  env_vars TEXT,                   -- Serialized JSON: Record<string, string>
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 0,
  allow_drafts INTEGER DEFAULT 0,  -- 1 when runs that include drafts may use it
  created_at INTEGER,
  updated_at INTEGER
);
```

Global pointers in `settings`:
- `active_environment`: Current environment used by Web GUI, server API, and default CLI runs.
- `default_environment`: Fallback environment when no active environment is selected.

---

## 2. Active Environment Resolution

When `loadConfig(configDir, envName)` in `src/config.ts` executes, it resolves the active environment using this priority cascade:

1. **CLI / Parameter**: `--env <name>` flag or explicit `envName` function argument.
2. **Process Environment**: `process.env.E2E_ENV`.
3. **Database Active Pointer**: `settings.active_environment` (or row with `is_active = 1`).
4. **Database Default Pointer**: `settings.default_environment` (or row with `is_default = 1`).
5. **Alphabetical First**: First row returned by `SELECT name FROM environments ORDER BY name ASC LIMIT 1`.
6. **Fallback**: Defaults to `"dev"` if table is empty.

---

## 3. Environment Variables (`env_vars`)

Stored as a JSON dictionary in `environments.env_vars`.

### Resolution Precedence
1. Environment variables defined in the active environment are assigned to `config.env`.
2. Host process variables (`process.env`) are merged **over** them (shell environment always wins).

### Scenario Interpolation
Scenarios reference these variables via `${env.VARIABLE_NAME}`. Fixtures inherit the full merged map in their execution context.

---

## 4. Path & URL Routing

| Resource | Default Directory | Environment Override | Resolved Via |
|---|---|---|---|
| **Scenarios** | `e2e-suite/scenarios` | `env.scenarios` | `resolveFromConfig(config, config.scenarios)` |
| **Mobile Flows** | `.e2e/flows` | `env.flows` | Relative to `configDir` |
| **Run Results** | `.e2e/results` | `env.results` | `resolveFromConfig(config, config.results)` |

### Environment URL
`url` describes the environment and is shown in the GUI. It never changes a service's URL: a service's URL comes from its platform, or from that platform's override in the environment (`platforms.md`, section 4). An earlier version copied `url` onto the only service when there was exactly one, which silently replaced the platform's URL.

---

## 5. Lifecycle Operations

- **Creation (`saveEnvironment`)**: Links every existing platform to the new environment with an `env_platform` row that overrides nothing, so all fields inherit from the platform. If it is the first environment, it is marked active and default.
- **Project Seed (`e2e-conductor init`)**: Creates one environment, `dev` (active and default, `APP_ENV=dev`, with the draft mark), and nothing else: no platform, no scenario. `dev` is the person's own machine, so an agent's first drafts can run there without a trip to the UI. Platforms depend on the app, so they are added afterwards with `e2e-conductor platform add` or in the UI (`platforms.md`, section 6); until then the agent kit lists only the built-in `shell` target and tells agents to add the platform a scenario needs first. `init` never touches a database that already has an environment. `e2e-conductor init -i` instead saves the platforms the person describes and writes a smoke scenario for them, and sets no draft mark.
- **Active Switch (`setActiveEnvironment`)**: Atomically clears `is_active` on all environments, sets `is_active = 1` on the target, updates `settings.active_environment`, and triggers UI reload.
- **Draft mark (`setAllowDrafts`)**: sets `allow_drafts`, read as `allowDrafts` on `EnvironmentConfig`. Only `e2e-conductor init` sets it without the person, on the `dev` environment it creates (Project Seed above). Otherwise the person sets it from the UI; no CLI command sets or clears it. The UI sets and clears it with the `Allow Draft Runs` checkbox in Config, Environments, which saves on its own and not with Save Profile, through `POST /api/config/environment/allow-drafts` (`{ name, allowed }`, 404 for an unknown environment), which reloads the config so `GET /api/config` shows `allowDrafts`. A run that includes drafts is refused unless the environment it actually loaded carries the mark, whatever `E2E_ENV` or `--env` says, and the refusal names the marked environments, or says none is marked and that the mark is set in the UI's Config view (`draftRunRefusal` in `src/draft-run.ts`, checked by `run()` and by `POST /api/run` before it answers; `runs.md` section 2). `saveEnvironment` never writes the column, so a form save keeps the mark. The mark is cooperative: it stops mistakes, not an agent that edits SQLite or calls the API directly. Process env still wins over `env_vars` in a draft run (section 3), so a UI started from a shell that exports production values sends them into the run.
- **Deletion (`deleteEnvironment`)**: Deletes all linked `env_platform` records. If the deleted environment was active or default, automatically promotes the next available alphabetical environment.

---

## 6. Business Invariants

- Environment names are unique, case-sensitive primary keys.
- There is always exactly one active environment.
- Variables from inactive environments are isolated and never visible during execution.
