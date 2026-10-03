import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { AssertionFailure, failureLabel } from "../src/assertions.ts"
import type { StepAction } from "../src/db/scenarios.ts"
import { WebDriver } from "../src/drivers/web.ts"
import { tempDir } from "./temp-dir.ts"

describe("WebDriver Playwright actions", () => {
  it("executes comprehensive Playwright actions and assertions", async () => {
    const dir = tempDir("web-driver-test")
    const target = { driver: "web" as const, service: "web", modules: dir, headless: true }
    const service = { url: "http://localhost:3000" }
    const driver = new WebDriver(target, service, dir)

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Playwright Test Suite</title>
        </head>
        <body>
          <h1 id="title">Playwright E2E</h1>
          <button id="btn" onclick="this.textContent = 'Clicked!'">Click Me</button>
          <button id="dbl" ondblclick="this.textContent = 'Double Clicked!'">Double</button>
          <input id="input" value="initial text" />
          <input id="type-input" value="" />
          <input type="checkbox" id="check-box" />
          <input type="checkbox" id="uncheck-box" checked />
          <button id="disabled-btn" disabled>Disabled</button>
          <button id="enabled-btn">Enabled</button>
          <select id="country">
            <option value="us">United States</option>
            <option value="ca">Canada</option>
          </select>
          <div id="hidden-el" style="display: none;">Hidden</div>
          <div id="drag-source" style="width: 50px; height: 50px; background: red;">Source</div>
          <div id="drag-target" style="width: 50px; height: 50px; background: blue;">Target</div>
          <div id="scroll-target" style="margin-top: 500px;">Scrolled Element</div>
        </body>
      </html>
    `
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`

    try {
      // Step with multiple actions
      const result = await driver.run({
        step: {
          name: "Test All Actions",
          target: "web",
          actions: [
            { action: "navigate", url: dataUrl },
            { action: "set_viewport", width: 1280, height: 800 },
            { action: "assert_title", value: "Playwright Test Suite" },
            { action: "assert_visible", selector: "#title" },
            { action: "assert_not_visible", selector: "#hidden-el" },
            { action: "assert_text", selector: "#title", value: "Playwright E2E" },
            { action: "assert_not_text", selector: "#title", value: "Puppeteer" },
            { action: "click", selector: "#btn" },
            { action: "assert_text", selector: "#btn", value: "Clicked!" },
            { action: "dblclick", selector: "#dbl" },
            { action: "assert_text", selector: "#dbl", value: "Double Clicked!" },
            { action: "hover", selector: "#btn" },
            { action: "focus", selector: "#input" },
            { action: "assert_value", selector: "#input", value: "initial text" },
            { action: "clear", selector: "#input" },
            { action: "assert_value", selector: "#input", value: "" },
            { action: "fill", selector: "#input", value: "new filled text" },
            { action: "assert_value", selector: "#input", value: "new filled text" },
            { action: "type", selector: "#type-input", value: "typed text" },
            { action: "assert_value", selector: "#type-input", value: "typed text" },
            { action: "press", key: "Enter", selector: "#type-input" },
            { action: "check", selector: "#check-box" },
            { action: "assert_checked", selector: "#check-box" },
            { action: "uncheck", selector: "#uncheck-box" },
            { action: "assert_not_checked", selector: "#uncheck-box" },
            { action: "assert_disabled", selector: "#disabled-btn" },
            { action: "assert_enabled", selector: "#enabled-btn" },
            { action: "select", selector: "#country", value: "ca" },
            { action: "assert_value", selector: "#country", value: "ca" },
            { action: "drag_and_drop", selector: "#drag-source", target_selector: "#drag-target" },
            { action: "scroll_into_view", selector: "#scroll-target" },
            { action: "wait_for", selector: "#title", ms: 50 },
            { action: "wait_for_load_state", value: "load" },
            { action: "eval", value: "document.title = 'Modified Title'" },
            { action: "assert_title", value: "Modified Title" },
            { action: "screenshot" },
          ],
        },
        env: {},
        artifactsDir: dir,
        log: () => {},
      })

      assert.ok(result.data)
      const data = result.data as Record<string, unknown>
      assert.equal(data.matched, true)
      assert.equal(data.screenshot, true)
    } finally {
      await driver.close()
    }
  })

  it("surfaces failed assertion actions as AssertionFailure, labeled Assertion failed", async () => {
    const dir = tempDir("web-driver-assert")
    const target = { driver: "web" as const, service: "web", modules: dir, headless: true }
    const driver = new WebDriver(target, { url: "http://localhost:3000" }, dir)
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent('<h1 id="title">Hello</h1>')}`
    const runActions = (actions: StepAction[]) =>
      driver
        .run({ step: { name: "Assert", target: "web", actions }, env: {}, artifactsDir: dir, log: () => {} })
        .then(() => assert.fail("expected the step to fail"), (error: unknown) => error)

    try {
      const textError = await runActions([
        { action: "navigate", url: dataUrl },
        { action: "assert_text", selector: "#title", value: "Goodbye" },
      ])
      assert.ok(textError instanceof AssertionFailure)
      assert.match(textError.message, /^Step action #2 \(assert_text\) failed: Expected element "#title" to contain "Goodbye"/)
      assert.equal(failureLabel(textError, []), "Assertion failed")

      const visibleError = await runActions([{ action: "assert_visible", selector: "#missing", timeout_ms: 200 }])
      assert.ok(visibleError instanceof AssertionFailure)
      assert.match(visibleError.message, /^Step action #1 \(assert_visible\) failed: /)
    } finally {
      await driver.close()
    }
  })

  it("supports single-action fallback syntax", async () => {
    const dir = tempDir("web-driver-fallback")
    const target = { driver: "web" as const, service: "web", modules: dir, headless: true }
    const service = { url: "http://localhost:3000" }
    const driver = new WebDriver(target, service, dir)

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent("<title>Fallback</title>")}`

    try {
      const res = await driver.run({
        step: {
          name: "Single Action Step",
          target: "web",
          action: "navigate",
          url: dataUrl,
        },
        env: {},
        artifactsDir: dir,
        log: () => {},
      })
      assert.ok(res.data)
    } finally {
      await driver.close()
    }
  })
})
