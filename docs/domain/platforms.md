# Platforms & Targets Domain & Business Logic

A **Platform** represents a testing surface configured in SQLite. At runtime, platforms are compiled into executable **Targets** (test driver endpoints) and background **Services** (servers, daemons, health checks).

---

## 1. Core Abstractions

| Concept | Role | Example |
|---|---|---|
| **Platform** | Stored configuration record in SQLite (`platforms` table). | `web-app`, `admin-api`, `customer-android` |
| **Target** | Execution endpoint referenced by scenario steps (`step.target`). | `web` (Playwright), `mobile` (ADB), `http` (Fetch) |
| **Service** | Background HTTP daemon backing a target with health checks and auto-start. | `http://localhost:5173`, `http://localhost:3000` |

---

## 2. Storage & Schema

### Table: `platforms` (`src/db/platforms.ts`)

```sql
CREATE TABLE IF NOT EXISTS platforms (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,       -- Target name used in scenario steps
  type TEXT NOT NULL,              -- 'web' | 'android' | 'api'
  order_num INTEGER DEFAULT 1,     -- Display and preflight check order
  url TEXT,                        -- Base URL or backend endpoint
  service_name TEXT,               -- Service key (defaults to platform name)
  health TEXT,                     -- Health check polling path (e.g. '/health')
  start_cmd TEXT,                  -- Command to start service when down
  cwd TEXT,                        -- Working directory for commands
  modules TEXT,                    -- Web step modules directory
  slow_mo INTEGER,                 -- Playwright delay in ms
  headless INTEGER DEFAULT 0,      -- 1 = Headless, 0 = Visible browser
  exclusive INTEGER DEFAULT 0,     -- 1 = Isolated daemon lifecycle per run
  app_id TEXT,                     -- Android package ID (e.g. 'com.example.app')
  flows TEXT,                      -- Android YAML flows directory
  install_cmd TEXT,                -- Command to build/install APK
  grant_permissions TEXT,          -- JSON array of Android permissions
  reverse_ports TEXT,              -- JSON array of ports for adb reverse
  needs TEXT,                      -- JSON array of platform names this one depends on
  config_json TEXT,                -- Extension metadata
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## 3. Supported Platform Types

### Web (`type: "web"`)
- **Driver**: `"web"` (`WebTarget` in `src/config.ts`) powered by Playwright.
- **Declarative Actions**: Executes full Playwright browser automation directly through UI configuration without requiring code files:
  - *Navigation*: `navigate`, `reload`, `go_back`, `go_forward`
  - *Mouse & Locator*: `click`, `dblclick`, `hover`, `focus`, `clear`, `drag_and_drop`, `scroll_into_view`
  - *Keyboard & Forms*: `fill`, `type`, `press`, `check`, `uncheck`, `select`, `upload_file`
  - *Waiting*: `wait_for`, `wait_for_url`, `wait_for_load_state`
  - *Assertions*: `assert_visible`, `assert_not_visible`, `assert_text`, `assert_not_text`, `assert_value`, `assert_checked`, `assert_not_checked`, `assert_disabled`, `assert_enabled`, `assert_url`, `assert_title`
  - *Viewport & Utilities*: `set_viewport`, `screenshot`, `eval`
- **Modules (not run)**: `modules` is still stored, but no step runs a TypeScript module any more. A step with `run` or `params` fails validation (`scenarios.md`, section 2).
- **Service Dependency**: Must link to a backing HTTP service for its base URL.
- **Options**: `headless` (toggle browser UI) and `slowMo` (delay per action for visual debugging).

### Android (`type: "android"`)
- **Driver**: `"mobile"` (`MobileTarget` in `src/config.ts`) powered by ADB and UIAutomator.
- **Declarative Actions**: Executes gestures and assertions directly (`tap`, `type`, `press`, `swipe`, `assert_visible`, `wait`, `launch`) via ADB without requiring YAML flow files.
- **Package**: `appId` specifies the application identifier.
- **Flows (not run)**: `flows` is still stored and the GUI can edit flow files, but no step runs a YAML flow any more. A step with `flow` fails validation (`scenarios.md`, section 2).
- **Device Setup**: `grantPermissions` auto-granted on launch; `reversePorts` forwarded via `adb reverse`. For the run, preflight disables every keyboard in `ime list -s` and turns autofill off, saving both on the device and restoring them when the run ends (or at the next preflight after a crash). It warns when Android falls back to a keyboard it does not list, such as Transsion's on Infinix phones; typing then closes that keyboard after each field.

### API (`type: "api"`)
- **Driver**: `"http"` (`HttpTarget` in `src/config.ts`) powered by Node fetch.
- **Service Dependency**: Links to target API base URL, health path (default `/`), and optional `startCmd`.
- **Options**: `exclusive` (starts isolated daemon before run, stops at completion).

---

### Needs (any type)
- `needs` lists other platforms this one depends on, by name: an admin web app or an Android app that calls an API platform lists that API. When a run uses a target, it also prepares (checks, starts if allowed) the services of every platform the target needs, transitively, and the post-failure re-check covers them (`runs.md`, section 3). A needed platform that does not exist fails config loading.
- `needs` is stored on the platform only; environments do not override it.

## 4. Multi-Environment Overrides (`env_platform`)

The `env_platform` junction table (`src/db/env-platforms.ts`) provides per-environment overrides with **sparse field inheritance**:

```sql
CREATE TABLE IF NOT EXISTS env_platform (
  env_name TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,       -- Toggle platform in this environment
  url TEXT,
  health TEXT,
  start_cmd TEXT,
  cwd TEXT,
  headless INTEGER,
  slow_mo INTEGER,
  app_id TEXT,
  config_json TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  PRIMARY KEY (env_name, platform_id)
);
```

### Inheritance Invariant
Any null or undefined field in `env_platform` inherits directly from the base `platforms` row. Overrides only store changed fields. Disabled platforms (`enabled = 0`) are completely omitted from the compiled targets. Saving a platform links it to every environment, and saving an environment links it to every platform, with rows that store no field values, so a later edit to a platform reaches every environment that does not override that field. Opening a database clears stored values that equal the platform's, which older versions wrote by copying the platform when linking.

---

## 5. Compilation Engine (`platformsToTargetsAndServices`)

Implemented in `src/db/platforms.ts`:

1. **Filter**: Skips any platform where `enabled === false`.
2. **Web**: Emits `targets[name]` with driver `"web"` and `services[serviceName]` with dev URL.
3. **Android**: Emits `targets[name]` with driver `"mobile"`, `platform: "android"`, `appId`, and `flows`.
4. **API**: Emits `targets[name]` with driver `"http"` and `services[serviceName]` with API URL.

---

## 6. Business Invariants

- **Reserved Name**: `"shell"` is reserved for the built-in subshell runner. Creating or compiling a platform named `"shell"` throws an error.
- **Service Integrity**: Every non-mobile target must resolve to a valid service in `services`.
- **Relational Integrity**: Deleting a platform cascades and removes all linked `env_platform` records.
