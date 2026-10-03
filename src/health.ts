import { execFile } from "node:child_process"
import type { ServiceConfig } from "./config.ts"
import { isUp, readySerials } from "./preflight.ts"
import { adbPath } from "./process.ts"

/** Ready device serials, or why adb could not say. */
export type AdbListing = { serials: string[] } | { problem: string }

// A wedged adb server can hang `adb devices` for minutes; the re-check must not stall the run.
const ADB_TIMEOUT_MS = 5_000

/**
 * List devices with the adb at `adb`, bounded so a hung adb reads as down. Asynchronous because
 * the re-check runs mid-run, where a blocking call would also freeze the GUI server's requests.
 */
export function listDevicesBounded(adb: string | undefined): Promise<AdbListing> {
  if (!adb) return Promise.resolve({ problem: "adb not found" })
  return new Promise((resolve) => {
    execFile(adb, ["devices"], { encoding: "utf8", timeout: ADB_TIMEOUT_MS }, (error, stdout) => {
      // A non-zero exit still lists devices; only a failure to run adb at all means it is down.
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (error?.killed) resolve({ problem: "adb not responding" })
      else if (code === "ENOENT") resolve({ problem: "adb not found" })
      else if (typeof code === "string") resolve({ problem: `adb could not run (${code})` })
      else resolve({ serials: readySerials(stdout) })
    })
  })
}

/**
 * Re-check what the run prepared after a step's final failed attempt: every service it
 * prepared and every device it picked. Returns one readable entry per thing that is down,
 * empty when all is well. `listDevices` is only called when a device was picked.
 */
export async function findDown(
  services: Record<string, ServiceConfig>,
  devices: string[],
  listDevices: () => AdbListing | Promise<AdbListing> = () => listDevicesBounded(adbPath()),
): Promise<string[]> {
  const entries = Object.entries(services)
  const [up, listing] = await Promise.all([
    Promise.all(entries.map(([, service]) => isUp(service))),
    devices.length > 0 ? listDevices() : undefined,
  ])
  const down = entries.filter((_, i) => !up[i]).map(([name, service]) => `service ${name} (${service.url})`)

  if (listing) {
    if ("problem" in listing) down.push(listing.problem)
    else down.push(...devices.filter((serial) => !listing.serials.includes(serial)).map((serial) => `device ${serial}`))
  }
  return down
}
