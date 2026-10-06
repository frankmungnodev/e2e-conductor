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
      needs TEXT,
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
      not_run_scenarios INTEGER DEFAULT 0,
      fixed_scenarios INTEGER DEFAULT 0
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
      failure_label TEXT,
      manual INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scenario_runs (
      run_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      iteration INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL,
      artifacts_dir TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      PRIMARY KEY (run_id, scenario_id, iteration)
    );

    CREATE TABLE IF NOT EXISTS scenario_versions (
      fingerprint TEXT PRIMARY KEY,
      scenario_json TEXT NOT NULL,
      created_at INTEGER
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
    CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario ON scenario_runs(scenario_id, started_at);
  `)

  // Databases created before these columns existed get them here: CREATE TABLE IF NOT EXISTS skips existing tables.
  addMissingColumn(db, "runs", "reason", "TEXT")
  addMissingColumn(db, "runs", "recovered_steps", "INTEGER DEFAULT 0")
  addMissingColumn(db, "runs", "not_run_scenarios", "INTEGER DEFAULT 0")
  addMissingColumn(db, "step_runs", "failure_label", "TEXT")
  addMissingColumn(db, "runs", "fixed_scenarios", "INTEGER DEFAULT 0")
  addMissingColumn(db, "step_runs", "manual", "INTEGER DEFAULT 0")
  addMissingColumn(db, "platforms", "needs", "TEXT")

  // Older databases linked platforms by copying their fields, so an edit to a platform never reached
  // an environment. Clear copied values that still equal the platform's, so they inherit again.
  for (const column of ["url", "health", "start_cmd", "cwd", "slow_mo", "app_id", "config_json"]) {
    db.exec(`UPDATE env_platform SET ${column} = NULL
      WHERE ${column} IS (SELECT p.${column} FROM platforms p WHERE p.id = env_platform.platform_id)`)
  }
  db.exec(`UPDATE env_platform SET headless = NULL
    WHERE headless IS (SELECT COALESCE(p.headless, 0) FROM platforms p WHERE p.id = env_platform.platform_id)`)

  return db
}

function addMissingColumn(db: DatabaseSync, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}
