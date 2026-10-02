import type { DatabaseSync } from "node:sqlite"

export function getFixtures(db: DatabaseSync): Record<string, { cmd: string; cwd?: string }> {
  const rows = db.prepare("SELECT name, cmd, cwd FROM fixtures ORDER BY name ASC").all() as Array<{
    name: string
    cmd: string
    cwd?: string | null
  }>
  const fixtures: Record<string, { cmd: string; cwd?: string }> = {}
  for (const row of rows) {
    fixtures[row.name] = {
      cmd: row.cmd,
      cwd: row.cwd || undefined,
    }
  }
  return fixtures
}

export function saveFixture(db: DatabaseSync, name: string, data: { cmd: string; cwd?: string }): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO fixtures (name, cmd, cwd, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      cmd = excluded.cmd,
      cwd = excluded.cwd,
      updated_at = excluded.updated_at
  `).run(name, data.cmd, data.cwd || null, now, now)
}

export function deleteFixture(db: DatabaseSync, name: string): void {
  db.prepare("DELETE FROM fixtures WHERE name = ?").run(name)
}
