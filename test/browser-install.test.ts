import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ensureBrowser, INSTALL_COMMAND, missingBrowserError } from "../src/browser-install.ts"
import type { RunLog } from "../src/logger.ts"

/** A RunLog that keeps its lines. */
function log(): RunLog & { lines: string[] } {
  const lines: string[] = []
  return { lines, line: (text = "") => lines.push(text), detail: () => {} } as unknown as RunLog & { lines: string[] }
}

describe("ensureBrowser", () => {
  it("downloads nothing when Chromium is on disk", async () => {
    let installs = 0
    await ensureBrowser(log(), { installed: () => true, install: async () => void installs++ })
    assert.equal(installs, 0)
  })

  it("downloads Chromium once when it is missing, and says so", async () => {
    const out = log()
    let installs = 0
    await ensureBrowser(out, { installed: () => false, install: async () => void installs++ })
    assert.equal(installs, 1)
    assert.ok(out.lines.some((line) => line.includes("downloading Chromium")))
    assert.ok(out.lines.some((line) => line.includes("Chromium installed")))
  })

  it("fails with the install command for this package's Playwright version when the download fails", async () => {
    const failing = { installed: () => false, install: async () => Promise.reject(new Error("ENOTFOUND cdn.playwright.dev")) }
    await assert.rejects(ensureBrowser(log(), failing), (error: Error) => {
      assert.match(error.message, /ENOTFOUND/)
      assert.ok(error.message.includes(INSTALL_COMMAND))
      return true
    })
    assert.match(INSTALL_COMMAND, /^npx playwright@\d+\.\d+\.\d+ install chromium$/)
  })
})

describe("missingBrowserError", () => {
  it("replaces Playwright's boxed banner with one line", () => {
    const banner = "browserType.launch: Executable doesn't exist at /x/chrome\n╔═══╗\n║ pnpm exec playwright install ║\n╚═══╝"
    const error = missingBrowserError(new Error(banner))
    assert.ok(error)
    assert.ok(!error.message.includes("╔"))
    assert.ok(error.message.includes(INSTALL_COMMAND))
  })

  it("leaves other launch errors alone", () => {
    assert.equal(missingBrowserError(new Error("Target page, context or browser has been closed")), undefined)
  })
})
