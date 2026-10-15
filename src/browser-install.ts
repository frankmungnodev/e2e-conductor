import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { chromium } from "playwright"
import { color, type RunLog } from "./logger.ts"

const require = createRequire(import.meta.url)
const playwrightDir = dirname(require.resolve("playwright/package.json"))
const playwrightVersion = (require("playwright/package.json") as { version: string }).version

/** The command a person can run to install the browser this package's Playwright launches. */
export const INSTALL_COMMAND = `npx playwright@${playwrightVersion} install chromium`

export type BrowserInstaller = {
  /** Whether the Chromium this package's Playwright launches is on disk. */
  installed: () => boolean
  /** Download it; rejects with Playwright's output when the download fails. */
  install: () => Promise<void>
}

/**
 * The project installs the `playwright` package with e2e-conductor, but no package manager downloads
 * its browser, and pnpm 10 skips dependencies' install scripts. So preflight downloads it once, with
 * this package's own Playwright CLI: `npx playwright install` in the project could pick another
 * version, or none, since `playwright` is not the project's own dependency.
 */
export const playwrightInstaller: BrowserInstaller = {
  installed: () => existsSync(chromium.executablePath()),
  install: () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(playwrightDir, "cli.js"), "install", "chromium"], { stdio: ["ignore", "pipe", "pipe"] })
      let output = ""
      child.stdout.on("data", (chunk) => (output += chunk))
      child.stderr.on("data", (chunk) => (output += chunk))
      child.on("error", reject)
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(output.trim().split("\n").slice(-3).join(" ")))))
    }),
}

/** Preflight for web targets: download Chromium when it is missing, or fail with the command that installs it. */
export async function ensureBrowser(out: RunLog, installer: BrowserInstaller = playwrightInstaller): Promise<void> {
  if (installer.installed()) {
    out.line(`  ${color.green("✓")} browser: Chromium`)
    return
  }
  out.line(`  ${color.yellow("…")} browser: downloading Chromium for Playwright, once (about 150 MB)`)
  try {
    await installer.install()
  } catch (error) {
    throw new Error(`Could not download Chromium for web steps: ${(error as Error).message}\nInstall it with: ${INSTALL_COMMAND}`)
  }
  out.line(`  ${color.green("✓")} browser: Chromium installed`)
}

/** Playwright's own missing-browser error is a boxed banner that names a command the project may not have. */
export function missingBrowserError(error: unknown): Error | undefined {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.includes("Executable doesn't exist")) return undefined
  return new Error(`Chromium for Playwright is not installed. Run any scenario again to download it, or install it with: ${INSTALL_COMMAND}`)
}
