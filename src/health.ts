import type { ServiceConfig } from "./config.ts"
import { isUp, listAdbDevices } from "./preflight.ts"
import { adbPath } from "./process.ts"

/** Ready device serials, or why adb could not say. */
export type AdbListing = { serials: string[] } | { problem: string }

// A wedged adb server can hang `adb devices` for minutes; the re-check must not stall the run.
const ADB_TIMEOUT_MS = 5_000

/** List devices with the adb at `adb`, bounded so a hung adb reads as down rather than blocking. */
export function listDevicesBounded(adb: string | undefined): AdbListing {
  if (!adb) return { problem: "adb not found" }
  const { serials, error } = listAdbDevices(adb, { timeoutMs: ADB_TIMEOUT_MS })
  if (error === "ETIMEDOUT") return { problem: "adb not responding" }
  if (error === "ENOENT") return { problem: "adb not found" }
  if (error) return { problem: `adb could not run (${error})` }
  return { serials }
}

/**
 * Re-check what the run prepared after a step's final failed attempt: every service it
 * prepared and every device it picked. Returns one readable entry per thing that is down,
 * empty when all is well. `listDevices` is only called when a device was picked.
 */
export async function findDown(
  services: Record<string, ServiceConfig>,
  devices: string[],
  listDevices: () => AdbListing = () => listDevicesBounded(adbPath()),
): Promise<string[]> {
  const entries = Object.entries(services)
  const up = await Promise.all(entries.map(([, service]) => isUp(service)))
  const down = entries.filter((_, i) => !up[i]).map(([name, service]) => `service ${name} (${service.url})`)

  if (devices.length > 0) {
    const listing = listDevices()
    if ("problem" in listing) down.push(listing.problem)
    else down.push(...devices.filter((serial) => !listing.serials.includes(serial)).map((serial) => `device ${serial}`))
  }
  return down
}
