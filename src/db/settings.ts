import type { DatabaseSync } from "node:sqlite"

export function getSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value)
}

export function deleteSetting(db: DatabaseSync, key: string): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key)
}
