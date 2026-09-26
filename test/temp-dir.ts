import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after } from "node:test"

/** A new temp folder, deleted when the test file finishes. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `e2e-${prefix}-`))
  after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
