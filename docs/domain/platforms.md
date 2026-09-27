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

### Table: `platforms` (`src/db.ts`)

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
  config_json TEXT,                -- Extension metadata
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## 3. Supported Platform Types

### Web (`type: "web"`)
- **Driver**: `"web"` (`WebTarget` in `src/config.ts`) powered by Playwright.
- **Modules**: Directory of TypeScript step files (default `.e2e/modules`) exporting a `WebStep` function.
- **Service Dependency**: Must link to a backing HTTP service for its base URL.
- **Options**: `headless` (toggle browser UI) and `slowMo` (delay per action for visual debugging).

### Android (`type: "android"`)
- **Driver**: `"mobile"` (`MobileTarget` in `src/config.ts`) powered by ADB and UIAutomator YAML flows.
- **Package**: `appId` specifies the application identifier.
- **Flows**: Directory containing declarative YAML flow files (default `.e2e/flows`).
- **Device Setup**: `grantPermissions` auto-granted on launch; `reversePorts` forwarded via `adb reverse`.

### API (`type: "api"`)
- **Driver**: `"http"` (`HttpTarget` in `src/config.ts`) powered by Node fetch.
- **Service Dependency**: Links to target API base URL, health path (default `/`), and optional `startCmd`.
- **Options**: `exclusive` (starts isolated daemon before run, stops at completion).

---

## 4. Multi-Environment Overrides (`env_platform`)

The `env_platform` junction table provides per-environment overrides with **sparse field inheritance**:

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
Any null or undefined field in `env_platform` inherits directly from the base `platforms` row. Overrides only store changed fields. Disabled platforms (`enabled = 0`) are completely omitted from the compiled targets.

---

## 5. Compilation Engine (`platformsToTargetsAndServices`)

Implemented in `src/db.ts`:

1. **Filter**: Skips any platform where `enabled === false`.
2. **Web**: Emits `targets[name]` with driver `"web"` and `services[serviceName]` with dev URL.
3. **Android**: Emits `targets[name]` with driver `"mobile"`, `platform: "android"`, `appId`, and `flows`.
4. **API**: Emits `targets[name]` with driver `"http"` and `services[serviceName]` with API URL.

---

## 6. Business Invariants

- **Reserved Name**: `"shell"` is reserved for the built-in subshell runner. Creating or compiling a platform named `"shell"` throws an error.
- **Service Integrity**: Every non-mobile target must resolve to a valid service in `services`.
- **Relational Integrity**: Deleting a platform cascades and removes all linked `env_platform` records.
