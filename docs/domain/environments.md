# Environments Domain & Business Logic

An **Environment** represents a target deployment context (e.g. `dev`, `staging`, `prod`, `ci`) where test scenarios execute without altering test definitions.

---

## 1. Storage & Schema

Environments are persisted in SQLite (`src/db.ts`):

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
| **Scenarios** | `.e2e/scenarios` | `env.scenarios` | `resolveFromConfig(config, config.scenarios)` |
| **Mobile Flows** | `.e2e/flows` | `env.flows` | Relative to `configDir` |
| **Run Results** | `.e2e/results` | `env.results` | `resolveFromConfig(config, config.results)` |

### Single-Service URL Auto-Adoption
If an environment specifies `url` and exactly **one** service exists in the resolved platform set, that service automatically adopts the environment's `url`:

```typescript
if (selectedEnv.url && Object.keys(services).length === 1) {
  services[srvKeys[0]].url = selectedEnv.url
}
```

---

## 5. Lifecycle Operations

- **Creation (`saveEnvironment`)**: Automatically creates default `env_platform` records for all existing platforms. If it is the first environment, it is marked active and default.
- **Active Switch (`setActiveEnvironment`)**: Atomically clears `is_active` on all environments, sets `is_active = 1` on the target, updates `settings.active_environment`, and triggers UI reload.
- **Deletion (`deleteEnvironment`)**: Deletes all linked `env_platform` records. If the deleted environment was active or default, automatically promotes the next available alphabetical environment.

---

## 6. Business Invariants

- Environment names are unique, case-sensitive primary keys.
- There is always exactly one active environment.
- Variables from inactive environments are isolated and never visible during execution.
