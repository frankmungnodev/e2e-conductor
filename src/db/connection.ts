import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"

export function safeJsonParse<T>(val: string | null | undefined, fallback?: T): T | undefined {
  if (!val) return fallback
  try {
    return JSON.parse(val) as T
  } catch {
    return fallback
  }
}

export function withDb<T>(dbPath: string, fn: (db: DatabaseSync) => T): T {
  const db = openDatabase(dbPath)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

export function openDatabase(dbPath: string): DatabaseSync {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new DatabaseSync(dbPath)

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS environments (
      name TEXT PRIMARY KEY,
      description TEXT,
      url TEXT,
      scenarios TEXT,
      flows TEXT,
      results TEXT,
      env_vars TEXT,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      order_num INTEGER DEFAULT 1,
      url TEXT,
      service_name TEXT,
      health TEXT,
      start_cmd TEXT,
      cwd TEXT,
      modules TEXT,
      slow_mo INTEGER,
      headless INTEGER DEFAULT 0,
      exclusive INTEGER DEFAULT 0,
      app_id TEXT,
      flows TEXT,
      install_cmd TEXT,
      grant_permissions TEXT,
      reverse_ports TEXT,
      config_json TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS env_platform (
      env_name TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS fixtures (
      name TEXT PRIMARY KEY,
      cmd TEXT NOT NULL,
      cwd TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      setup_fixtures TEXT,
      vars TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scenario_steps (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      order_num INTEGER NOT NULL,
      name TEXT NOT NULL,
      target TEXT NOT NULL,
      timeout_ms INTEGER,
      retry_times INTEGER,
      retry_delay_ms INTEGER,
      assert_json TEXT,
      extract_json TEXT,
      driver_config TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      environment_name TEXT NOT NULL,
      status TEXT NOT NULL,
      total_scenarios INTEGER DEFAULT 0,
      passed_scenarios INTEGER DEFAULT 0,
      failed_scenarios INTEGER DEFAULT 0,
      duration_ms INTEGER,
      artifacts_dir TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      reason TEXT,
      recovered_steps INTEGER DEFAULT 0,
      not_run_scenarios INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS step_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      step_id TEXT,
      scenario_id TEXT NOT NULL,
      iteration INTEGER DEFAULT 1,
      attempt INTEGER DEFAULT 1,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      status_code INTEGER,
      error_message TEXT,
      result_data TEXT,
      artifacts_path TEXT,
      created_at INTEGER,
      failure_label TEXT
    );

    CREATE TABLE IF NOT EXISTS step_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target TEXT,
      steps TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS step_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target TEXT NOT NULL,
      step_json TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_scenario_steps_scenario ON scenario_steps(scenario_id, order_num);
    CREATE INDEX IF NOT EXISTS idx_step_runs_run ON step_runs(run_id);
    CREATE INDEX IF NOT EXISTS idx_step_runs_step ON step_runs(step_id);
    CREATE INDEX IF NOT EXISTS idx_step_runs_scenario ON step_runs(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
  `)

  // Databases created before these columns existed get them here: CREATE TABLE IF NOT EXISTS skips existing tables.
  addMissingColumn(db, "runs", "reason", "TEXT")
  addMissingColumn(db, "runs", "recovered_steps", "INTEGER DEFAULT 0")
  addMissingColumn(db, "runs", "not_run_scenarios", "INTEGER DEFAULT 0")
  addMissingColumn(db, "step_runs", "failure_label", "TEXT")

  // Backfill env_platform if it's empty but platforms and environments exist
  try {
    const epCountRow = db.prepare("SELECT COUNT(*) as cnt FROM env_platform").get() as { cnt: number } | undefined
    if ((epCountRow?.cnt ?? 0) === 0) {
      const envRows = db.prepare("SELECT name FROM environments").all() as Array<{ name: string }>
      const platRows = db.prepare("SELECT * FROM platforms").all() as Array<{
        id: string
        url?: string | null
        health?: string | null
        start_cmd?: string | null
        cwd?: string | null
        headless?: number | null
        slow_mo?: number | null
        app_id?: string | null
        config_json?: string | null
      }>

      if (envRows.length > 0 && platRows.length > 0) {
        const now = Date.now()
        for (const env of envRows) {
          for (const p of platRows) {
            db.prepare(`
              INSERT OR IGNORE INTO env_platform (
                env_name, platform_id, enabled, url, health, start_cmd, cwd, headless, slow_mo, app_id, config_json, created_at, updated_at
              ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              env.name,
              p.id,
              p.url || null,
              p.health || null,
              p.start_cmd || null,
              p.cwd || null,
              p.headless ?? 0,
              p.slow_mo ?? null,
              p.app_id || null,
              p.config_json || null,
              now,
              now,
            )
          }
        }
      }
    }
  } catch {
    // Ignore migration backfill errors
  }

  return db
}

function addMissingColumn(db: DatabaseSync, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}
