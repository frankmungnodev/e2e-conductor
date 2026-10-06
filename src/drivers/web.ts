import { join } from "node:path"
import { type Browser, type BrowserContext, chromium, errors, type Page } from "playwright"
import { AssertionFailure, prefixError } from "../assertions.ts"
import type { Logger, ServiceConfig, WebTarget } from "../config.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

export class WebDriver implements Driver {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page

  constructor(
    private readonly target: WebTarget,
    private readonly service: ServiceConfig,
  ) {}

  /** One browser per run; one context (cookies, trace) per scenario. */
  private async openPage(env: Record<string, string>): Promise<Page> {
    if (this.page) return this.page
    this.browser ??= await chromium.launch({
      headless: env.E2E_HEADLESS === "1" || (this.target.headless ?? false),
      slowMo: Number(env.E2E_SLOWMO ?? this.target.slowMo ?? 0),
    })
    this.context = await this.browser.newContext({ baseURL: this.service.url })
    await this.context.tracing.start({ screenshots: true, snapshots: true })
    this.page = await this.context.newPage()
    return this.page
  }

  async run({ step, env, log }: StepRun): Promise<StepResult> {
    const page = await this.openPage(env)
    page.setDefaultTimeout(step.timeout_ms ?? 15_000)

    const actions =
      step.actions && step.actions.length > 0
        ? step.actions
        : step.action
          ? [
              {
                action: step.action,
                selector: step.selector,
                target_selector: step.target_selector,
                value: step.value,
                key: step.key,
                url: step.url,
                ms: step.ms,
                timeout_ms: step.timeout_ms,
                width: step.width,
                height: step.height,
              },
            ]
          : []

    if (actions.length === 0) {
      throw new Error('web step requires an "actions" list or an "action"')
    }

    log(`running step "${step.name}" with ${actions.length} action(s)`)
    const combinedData: Record<string, unknown> = {}
    for (let i = 0; i < actions.length; i++) {
      const actionItem = actions[i]
      const label = actionItem.name ? `"${actionItem.name}" (${actionItem.action})` : `action #${i + 1} (${actionItem.action})`
      log(`executing action ${label}`)
      try {
        const res = await this.executeAction(page, actionItem, log, step.timeout_ms)
        Object.assign(combinedData, res)
      } catch (err) {
        throw prefixError(`Step action #${i + 1} (${actionItem.action}) failed: `, err)
      }
    }
    return { data: combinedData }
  }

  private async executeAction(
    page: Page,
    step: {
      action?: string
      selector?: string
      target_selector?: string
      value?: unknown
      url?: string
      key?: string
      ms?: number
      timeout_ms?: number
      width?: number
      height?: number
    },
    log: Logger,
    defaultTimeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    const action = (step.action ?? "").toLowerCase()
    log(`web action: ${action}`)
    const timeout = step.timeout_ms ?? defaultTimeoutMs
    /** Most actions also accept the selector in `value`; text-entry actions keep `value` for their input. */
    const requireSelector = (name: string, { valueFallback = true } = {}): string => {
      const selector = (valueFallback ? (step.selector ?? step.value) : step.selector) as string
      if (!selector) throw new Error(`web '${name}' action requires a selector`)
      return selector
    }

    switch (action) {
      case "navigate":
      case "goto": {
        const url = (step.url ?? step.value ?? "/") as string
        log(`goto "${url}"`)
        await page.goto(url, { timeout })
        return { url: page.url(), path: new URL(page.url()).pathname }
      }
      case "reload": {
        log("reload page")
        await page.reload({ timeout })
        return { reloaded: true, url: page.url() }
      }
      case "go_back": {
        log("go back in history")
        await page.goBack({ timeout })
        return { go_back: true, url: page.url() }
      }
      case "go_forward": {
        log("go forward in history")
        await page.goForward({ timeout })
        return { go_forward: true, url: page.url() }
      }
      case "click": {
        const selector = requireSelector("click")
        log(`click "${selector}"`)
        await page.click(selector, { timeout })
        return { clicked: selector }
      }
      case "dblclick": {
        const selector = requireSelector("dblclick")
        log(`dblclick "${selector}"`)
        await page.dblclick(selector, { timeout })
        return { dblclicked: selector }
      }
      case "hover": {
        const selector = requireSelector("hover")
        log(`hover "${selector}"`)
        await page.hover(selector, { timeout })
        return { hovered: selector }
      }
      case "focus": {
        const selector = requireSelector("focus")
        log(`focus "${selector}"`)
        await page.focus(selector, { timeout })
        return { focused: selector }
      }
      case "clear": {
        const selector = requireSelector("clear")
        log(`clear "${selector}"`)
        await page.locator(selector).clear({ timeout })
        return { cleared: selector }
      }
      case "fill": {
        const selector = requireSelector("fill", { valueFallback: false })
        const val = String(step.value ?? "")
        log(`fill "${selector}" with "${val}"`)
        await page.fill(selector, val, { timeout })
        return { filled: selector, value: val }
      }
      case "type": {
        const selector = requireSelector("type", { valueFallback: false })
        const val = String(step.value ?? "")
        log(`type "${selector}" with "${val}"`)
        await page.locator(selector).pressSequentially(val, { timeout })
        return { typed: selector, value: val }
      }
      case "press": {
        const key = (step.key ?? step.value ?? "Enter") as string
        if (step.selector) {
          log(`press "${key}" on "${step.selector}"`)
          await page.press(step.selector, key, { timeout })
        } else {
          log(`keyboard press "${key}"`)
          await page.keyboard.press(key)
        }
        return { pressed: key }
      }
      case "check": {
        const selector = requireSelector("check")
        log(`check "${selector}"`)
        await page.check(selector, { timeout })
        return { checked: selector }
      }
      case "uncheck": {
        const selector = requireSelector("uncheck")
        log(`uncheck "${selector}"`)
        await page.uncheck(selector, { timeout })
        return { unchecked: selector }
      }
      case "select":
      case "select_option": {
        const selector = requireSelector("select", { valueFallback: false })
        const val = String(step.value ?? "")
        log(`select "${val}" on "${selector}"`)
        await page.selectOption(selector, val, { timeout })
        return { selected: val }
      }
      case "drag_and_drop": {
        const source = step.selector as string
        const target = (step.target_selector ?? step.value) as string
        if (!source) throw new Error("web 'drag_and_drop' action requires a source 'selector'")
        if (!target) throw new Error("web 'drag_and_drop' action requires a 'target_selector' (or 'value' as target element)")
        log(`drag and drop "${source}" to "${target}"`)
        await page.dragAndDrop(source, target, { timeout })
        return { dragged: source, droppedOn: target }
      }
      case "upload_file":
      case "set_input_files": {
        const selector = requireSelector("upload_file", { valueFallback: false })
        const filePath = String(step.value ?? "")
        if (!filePath) throw new Error("web 'upload_file' action requires a file path in 'value'")
        log(`upload file "${filePath}" to "${selector}"`)
        await page.setInputFiles(selector, filePath, { timeout })
        return { uploaded: filePath, selector }
      }
      case "scroll_into_view": {
        const selector = requireSelector("scroll_into_view")
        log(`scroll into view "${selector}"`)
        await page.locator(selector).scrollIntoViewIfNeeded({ timeout })
        return { scrolled: selector }
      }
      case "wait_for":
      case "wait": {
        if (step.selector) {
          log(`wait for selector "${step.selector}"`)
          await page.waitForSelector(step.selector, { timeout: timeout ?? 10_000 })
        }
        if (step.ms) {
          log(`wait for ${step.ms}ms`)
          await page.waitForTimeout(step.ms)
        }
        return { waited: true }
      }
      case "wait_for_url": {
        const urlPattern = (step.url ?? step.value) as string
        if (!urlPattern) throw new Error("web 'wait_for_url' action requires a URL pattern or string")
        log(`wait for URL "${urlPattern}"`)
        await page.waitForURL(urlPattern, { timeout: timeout ?? 15_000 })
        return { waitedUrl: page.url() }
      }
      case "wait_for_load_state": {
        const state = (step.value ?? "load") as "load" | "domcontentloaded" | "networkidle"
        log(`wait for load state "${state}"`)
        await page.waitForLoadState(state, { timeout: timeout ?? 15_000 })
        return { loadState: state }
      }
      case "assert_visible": {
        const selector = requireSelector("assert_visible")
        log(`assert visible "${selector}"`)
        await assertState(page, selector, "visible", timeout ?? 10_000)
        return { visible: selector }
      }
      case "assert_not_visible":
      case "assert_hidden": {
        const selector = requireSelector("assert_not_visible")
        log(`assert not visible "${selector}"`)
        await assertState(page, selector, "hidden", timeout ?? 10_000)
        return { not_visible: selector }
      }
      case "assert_text": {
        const selector = requireSelector("assert_text", { valueFallback: false })
        const expected = String(step.value ?? "")
        log(`assert text on "${selector}" contains "${expected}"`)
        const text = await waitUntil(
          (wait) => page.locator(selector).innerText({ timeout: wait }),
          (found) => found.includes(expected),
          timeout ?? 10_000,
          (found) => `Expected element "${selector}" to contain "${expected}", but found "${found}"`,
        )
        return { text, matched: true }
      }
      case "assert_not_text": {
        const selector = requireSelector("assert_not_text", { valueFallback: false })
        const forbidden = String(step.value ?? "")
        log(`assert text on "${selector}" does not contain "${forbidden}"`)
        const text = await waitUntil(
          (wait) => page.locator(selector).innerText({ timeout: wait }),
          (found) => !found.includes(forbidden),
          timeout ?? 10_000,
          () => `Expected element "${selector}" to NOT contain "${forbidden}", but it did`,
        )
        return { text, matched: false }
      }
      case "assert_value": {
        const selector = requireSelector("assert_value", { valueFallback: false })
        const expected = String(step.value ?? "")
        log(`assert value on "${selector}" equals "${expected}"`)
        const actual = await waitUntil(
          (wait) => page.locator(selector).inputValue({ timeout: wait }),
          (found) => found === expected,
          timeout ?? 10_000,
          (found) => `Expected element "${selector}" value to be "${expected}", but found "${found}"`,
        )
        return { value: actual, matched: true }
      }
      case "assert_checked": {
        const selector = requireSelector("assert_checked")
        log(`assert checked "${selector}"`)
        const isChecked = await page.locator(selector).isChecked({ timeout: timeout ?? 10_000 })
        if (!isChecked) {
          throw new AssertionFailure(`Expected checkbox "${selector}" to be checked, but it is not`)
        }
        return { checked: true, selector }
      }
      case "assert_not_checked": {
        const selector = requireSelector("assert_not_checked")
        log(`assert not checked "${selector}"`)
        const isChecked = await page.locator(selector).isChecked({ timeout: timeout ?? 10_000 })
        if (isChecked) {
          throw new AssertionFailure(`Expected checkbox "${selector}" to NOT be checked, but it is checked`)
        }
        return { checked: false, selector }
      }
      case "assert_disabled": {
        const selector = requireSelector("assert_disabled")
        log(`assert disabled "${selector}"`)
        const isDisabled = await page.locator(selector).isDisabled({ timeout: timeout ?? 10_000 })
        if (!isDisabled) {
          throw new AssertionFailure(`Expected element "${selector}" to be disabled, but it is enabled`)
        }
        return { disabled: true, selector }
      }
      case "assert_enabled": {
        const selector = requireSelector("assert_enabled")
        log(`assert enabled "${selector}"`)
        const isEnabled = await page.locator(selector).isEnabled({ timeout: timeout ?? 10_000 })
        if (!isEnabled) {
          throw new AssertionFailure(`Expected element "${selector}" to be enabled, but it is disabled`)
        }
        return { enabled: true, selector }
      }
      case "assert_url": {
        const expected = String(step.url ?? step.value ?? "")
        if (!expected) throw new Error("web 'assert_url' action requires an expected URL or substring")
        log(`assert current URL contains "${expected}"`)
        const currentUrl = await waitUntil(
          async () => page.url(),
          (found) => found.includes(expected),
          timeout ?? 10_000,
          (found) => `Expected URL to contain "${expected}", but current URL is "${found}"`,
        )
        return { url: currentUrl, matched: true }
      }
      case "assert_title": {
        const expected = String(step.value ?? "")
        if (!expected) throw new Error("web 'assert_title' action requires an expected title substring")
        log(`assert page title contains "${expected}"`)
        const title = await waitUntil(
          () => page.title(),
          (found) => found.includes(expected),
          timeout ?? 10_000,
          (found) => `Expected title to contain "${expected}", but found "${found}"`,
        )
        return { title, matched: true }
      }
      case "set_viewport": {
        const width = Number(
          step.width ??
            (typeof step.value === "object" && step.value !== null && "width" in step.value
              ? (step.value as { width: unknown }).width
              : 1280),
        )
        const height = Number(
          step.height ??
            (typeof step.value === "object" && step.value !== null && "height" in step.value
              ? (step.value as { height: unknown }).height
              : 720),
        )
        log(`set viewport to ${width}x${height}`)
        await page.setViewportSize({ width, height })
        return { viewport: { width, height } }
      }
      case "screenshot": {
        log("capture screenshot")
        const shotPath = step.value ? String(step.value) : undefined
        const buffer = await page.screenshot(shotPath ? { path: shotPath, fullPage: true } : { fullPage: true })
        return { screenshot: true, bytes: buffer.length }
      }
      case "eval":
      case "script": {
        const code = String(step.value ?? "")
        log(`eval "${code}"`)
        const res = await page.evaluate(code)
        return (typeof res === "object" && res !== null ? res : { result: res }) as Record<string, unknown>
      }
      default:
        throw new Error(`unknown web action: "${step.action}"`)
    }
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!this.context) return
    if (failed && this.page) {
      await this.page.screenshot({ path: join(artifactsDir, "web-failure.png"), fullPage: true }).catch(() => {})
    }
    await this.context.tracing.stop(failed ? { path: join(artifactsDir, "web-trace.zip") } : undefined)
    await this.context.close()
    this.context = undefined
    this.page = undefined
  }

  async close() {
    await this.browser?.close()
  }
}

/**
 * For these assertions the wait timing out is the check failing, so it is an AssertionFailure.
 * Other errors (a bad selector, a closed page) mean the step could not run, and stay plain.
 */
async function assertState(page: Page, selector: string, state: "visible" | "hidden", timeout: number) {
  try {
    await page.locator(selector).waitFor({ state, timeout })
  } catch (error) {
    if (error instanceof errors.TimeoutError) throw new AssertionFailure(error.message)
    throw error
  }
}

/**
 * Re-reads a value until `holds` accepts it, like Playwright's `expect` does, so a page still
 * loading or re-rendering does not fail the check. `read` gets the time left; an element that never
 * appears fails as its own error, and a value that never matches fails as an AssertionFailure.
 */
async function waitUntil<T>(
  read: (timeLeft: number) => Promise<T>,
  holds: (value: T) => boolean,
  timeout: number,
  describe: (last: T) => string,
): Promise<T> {
  const deadline = Date.now() + timeout
  let last: { value: T } | undefined
  for (;;) {
    try {
      last = { value: await read(Math.max(deadline - Date.now(), 1)) }
    } catch (error) {
      // Once a value was read, a read cut short by the deadline means the value never matched.
      if (last && error instanceof errors.TimeoutError) throw new AssertionFailure(describe(last.value))
      throw error
    }
    if (holds(last.value)) return last.value
    if (Date.now() >= deadline) throw new AssertionFailure(describe(last.value))
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
