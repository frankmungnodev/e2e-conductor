import { chmodSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** Write an executable shell script standing in for adb, so tests run without a device. */
export function fakeAdb(dir: string, name: string, script: string): string {
  const path = join(dir, name)
  writeFileSync(path, `#!/bin/sh\n${script}\n`)
  chmodSync(path, 0o755)
  return path
}
