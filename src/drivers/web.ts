import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { type Browser, type BrowserContext, chromium, type Page } from "playwright"
import type { Logger, ServiceConfig, WebStep, WebTarget } from "../config.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

const MODULE_EXTENSIONS = [".ts", ".mts", ".js", ".mjs"]

export class WebDriver implements Driver {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page

  constructor(
    private readonly target: WebTarget,
    private readonly service: ServiceConfig,
    private readonly modulesDir: string,
  ) {}

  private async loadStep(name: string): Promise<WebStep> {
    const file = MODULE_EXTENSIONS.map((ext) => join(this.modulesDir, name + ext)).find((path) => existsSync(path))
    if (!file) throw new Error(`web module "${name}" not found in ${this.modulesDir}`)
    const mod = await import(pathToFileURL(file).href)
    if (typeof mod.default !== "function") throw new Error(`${file} must default-export defineWebStep(...)`)
    return mod.default
  }

  /** One browser per run; one context (cookies, trace) per scenario. */
  private async openPage(env: Record<string, string>, log: Logger): Promise<Page> {
    if (this.page) return this.page
    this.browser ??= await chromium.launch({
      headless: env.E2E_HEADLESS === "1" || (this.target.headless ?? false),
      slowMo: Number(env.E2E_SLOWMO ?? this.target.slowMo ?? 0),
    })
    this.context = await this.browser.newContext({ baseURL: this.service.url })
    await this.context.tracing.start({ screenshots: true, snapshots: true })
    this.page = await this.context.newPage()

    if (this.target.login) {
      log(`login via "${this.target.login}"`)
      const login = await this.loadStep(this.target.login)
      await login({ page: this.page, params: {}, baseUrl: this.service.url, env, log })
    }
    return this.page
  }

  async run({ step, env, log }: StepRun): Promise<StepResult> {
    const page = await this.openPage(env, log)
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
        throw new Error(`Step action #${i + 1} (${actionItem.action}) failed: ${(err as Error).message}`)
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

    switch (action) {
      case "navigate":
      case "goto": {
        const url = (step.url ?? step.value ?? "/") as string
        log(`goto "${url}"`)
        await page.goto(url, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { url: page.url(), path: new URL(page.url()).pathname }
      }
      case "reload": {
        log("reload page")
        await page.reload({ timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { reloaded: true, url: page.url() }
      }
      case "go_back": {
        log("go back in history")
        await page.goBack({ timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { go_back: true, url: page.url() }
      }
      case "go_forward": {
        log("go forward in history")
        await page.goForward({ timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { go_forward: true, url: page.url() }
      }
      case "click": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'click' action requires a selector")
        log(`click "${selector}"`)
        await page.click(selector, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { clicked: selector }
      }
      case "dblclick": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'dblclick' action requires a selector")
        log(`dblclick "${selector}"`)
        await page.dblclick(selector, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { dblclicked: selector }
      }
      case "hover": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'hover' action requires a selector")
        log(`hover "${selector}"`)
        await page.hover(selector, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { hovered: selector }
      }
      case "focus": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'focus' action requires a selector")
        log(`focus "${selector}"`)
        await page.focus(selector, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { focused: selector }
      }
      case "clear": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'clear' action requires a selector")
        log(`clear "${selector}"`)
        await page.locator(selector).clear({ timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { cleared: selector }
      }
      case "fill": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'fill' action requires a selector")
        const val = String(step.value ?? "")
        log(`fill "${selector}" with "${val}"`)
        await page.fill(selector, val, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { filled: selector, value: val }
      }
      case "type": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'type' action requires a selector")
        const val = String(step.value ?? "")
        log(`type "${selector}" with "${val}"`)
        await page.locator(selector).pressSequentially(val, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { typed: selector, value: val }
      }
      case "press": {
        const key = (step.key ?? step.value ?? "Enter") as string
        if (step.selector) {
          log(`press "${key}" on "${step.selector}"`)
          await page.press(step.selector, key, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        } else {
          log(`keyboard press "${key}"`)
          await page.keyboard.press(key)
        }
        return { pressed: key }
      }
      case "check": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'check' action requires a selector")
        log(`check "${selector}"`)
        await page.check(selector, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { checked: selector }
      }
      case "uncheck": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'uncheck' action requires a selector")
        log(`uncheck "${selector}"`)
        await page.uncheck(selector, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { unchecked: selector }
      }
      case "select":
      case "select_option": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'select' action requires a selector")
        const val = String(step.value ?? "")
        log(`select "${val}" on "${selector}"`)
        await page.selectOption(selector, val, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { selected: val }
      }
      case "drag_and_drop": {
        const source = step.selector as string
        const target = (step.target_selector ?? step.value) as string
        if (!source) throw new Error("web 'drag_and_drop' action requires a source 'selector'")
        if (!target) throw new Error("web 'drag_and_drop' action requires a 'target_selector' (or 'value' as target element)")
        log(`drag and drop "${source}" to "${target}"`)
        await page.dragAndDrop(source, target, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { dragged: source, droppedOn: target }
      }
      case "upload_file":
      case "set_input_files": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'upload_file' action requires a selector")
        const filePath = String(step.value ?? "")
        if (!filePath) throw new Error("web 'upload_file' action requires a file path in 'value'")
        log(`upload file "${filePath}" to "${selector}"`)
        await page.setInputFiles(selector, filePath, { timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { uploaded: filePath, selector }
      }
      case "scroll_into_view": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'scroll_into_view' action requires a selector")
        log(`scroll into view "${selector}"`)
        await page.locator(selector).scrollIntoViewIfNeeded({ timeout: step.timeout_ms ?? defaultTimeoutMs })
        return { scrolled: selector }
      }
      case "wait_for":
      case "wait": {
        if (step.selector) {
          log(`wait for selector "${step.selector}"`)
          await page.waitForSelector(step.selector, { timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
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
        await page.waitForURL(urlPattern, { timeout: step.timeout_ms ?? defaultTimeoutMs ?? 15_000 })
        return { waitedUrl: page.url() }
      }
      case "wait_for_load_state": {
        const state = (step.value ?? "load") as "load" | "domcontentloaded" | "networkidle"
        log(`wait for load state "${state}"`)
        await page.waitForLoadState(state, { timeout: step.timeout_ms ?? defaultTimeoutMs ?? 15_000 })
        return { loadState: state }
      }
      case "assert_visible": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'assert_visible' action requires a selector")
        log(`assert visible "${selector}"`)
        await page.locator(selector).waitFor({ state: "visible", timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        return { visible: selector }
      }
      case "assert_not_visible":
      case "assert_hidden": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'assert_not_visible' action requires a selector")
        log(`assert not visible "${selector}"`)
        await page.locator(selector).waitFor({ state: "hidden", timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        return { not_visible: selector }
      }
      case "assert_text": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'assert_text' action requires a selector")
        const expected = String(step.value ?? "")
        log(`assert text on "${selector}" contains "${expected}"`)
        const text = await page.locator(selector).innerText({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (!text.includes(expected)) {
          throw new Error(`Expected element "${selector}" to contain "${expected}", but found "${text}"`)
        }
        return { text, matched: true }
      }
      case "assert_not_text": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'assert_not_text' action requires a selector")
        const forbidden = String(step.value ?? "")
        log(`assert text on "${selector}" does not contain "${forbidden}"`)
        const text = await page.locator(selector).innerText({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (text.includes(forbidden)) {
          throw new Error(`Expected element "${selector}" to NOT contain "${forbidden}", but it did`)
        }
        return { text, matched: false }
      }
      case "assert_value": {
        const selector = step.selector as string
        if (!selector) throw new Error("web 'assert_value' action requires a selector")
        const expected = String(step.value ?? "")
        log(`assert value on "${selector}" equals "${expected}"`)
        const actual = await page.locator(selector).inputValue({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (actual !== expected) {
          throw new Error(`Expected element "${selector}" value to be "${expected}", but found "${actual}"`)
        }
        return { value: actual, matched: true }
      }
      case "assert_checked": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'assert_checked' action requires a selector")
        log(`assert checked "${selector}"`)
        const isChecked = await page.locator(selector).isChecked({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (!isChecked) {
          throw new Error(`Expected checkbox "${selector}" to be checked, but it is not`)
        }
        return { checked: true, selector }
      }
      case "assert_not_checked": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'assert_not_checked' action requires a selector")
        log(`assert not checked "${selector}"`)
        const isChecked = await page.locator(selector).isChecked({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (isChecked) {
          throw new Error(`Expected checkbox "${selector}" to NOT be checked, but it is checked`)
        }
        return { checked: false, selector }
      }
      case "assert_disabled": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'assert_disabled' action requires a selector")
        log(`assert disabled "${selector}"`)
        const isDisabled = await page.locator(selector).isDisabled({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (!isDisabled) {
          throw new Error(`Expected element "${selector}" to be disabled, but it is enabled`)
        }
        return { disabled: true, selector }
      }
      case "assert_enabled": {
        const selector = (step.selector ?? step.value) as string
        if (!selector) throw new Error("web 'assert_enabled' action requires a selector")
        log(`assert enabled "${selector}"`)
        const isEnabled = await page.locator(selector).isEnabled({ timeout: step.timeout_ms ?? defaultTimeoutMs ?? 10_000 })
        if (!isEnabled) {
          throw new Error(`Expected element "${selector}" to be enabled, but it is disabled`)
        }
        return { enabled: true, selector }
      }
      case "assert_url": {
        const expected = String(step.url ?? step.value ?? "")
        if (!expected) throw new Error("web 'assert_url' action requires an expected URL or substring")
        log(`assert current URL contains "${expected}"`)
        const currentUrl = page.url()
        if (!currentUrl.includes(expected)) {
          throw new Error(`Expected URL to contain "${expected}", but current URL is "${currentUrl}"`)
        }
        return { url: currentUrl, matched: true }
      }
      case "assert_title": {
        const expected = String(step.value ?? "")
        if (!expected) throw new Error("web 'assert_title' action requires an expected title substring")
        log(`assert page title contains "${expected}"`)
        const title = await page.title()
        if (!title.includes(expected)) {
          throw new Error(`Expected title to contain "${expected}", but found "${title}"`)
        }
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
