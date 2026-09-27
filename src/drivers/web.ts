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

    if (step.action) {
      const action = step.action.toLowerCase()
      log(`web action: ${action}`)

      switch (action) {
        case "navigate":
        case "goto": {
          const url = (step.url ?? step.value ?? "/") as string
          log(`goto "${url}"`)
          await page.goto(url)
          return { data: { url: page.url(), path: new URL(page.url()).pathname } }
        }
        case "click": {
          const selector = (step.selector ?? step.value) as string
          if (!selector) throw new Error("web 'click' action requires a selector")
          log(`click "${selector}"`)
          await page.click(selector)
          return { data: { clicked: selector } }
        }
        case "fill":
        case "type": {
          const selector = step.selector as string
          if (!selector) throw new Error(`web '${action}' action requires a selector`)
          const val = String(step.value ?? "")
          log(`fill "${selector}" with "${val}"`)
          await page.fill(selector, val)
          return { data: { filled: selector, value: val } }
        }
        case "press": {
          const key = (step.key ?? step.value ?? "Enter") as string
          if (step.selector) {
            log(`press "${key}" on "${step.selector}"`)
            await page.press(step.selector, key)
          } else {
            log(`keyboard press "${key}"`)
            await page.keyboard.press(key)
          }
          return { data: { pressed: key } }
        }
        case "wait_for":
        case "wait": {
          if (step.selector) {
            log(`wait for selector "${step.selector}"`)
            await page.waitForSelector(step.selector, { timeout: step.timeout_ms ?? 10_000 })
          }
          if (step.ms) {
            log(`wait for ${step.ms}ms`)
            await page.waitForTimeout(step.ms)
          }
          return { data: { waited: true } }
        }
        case "hover": {
          const selector = (step.selector ?? step.value) as string
          if (!selector) throw new Error("web 'hover' action requires a selector")
          log(`hover "${selector}"`)
          await page.hover(selector)
          return { data: { hovered: selector } }
        }
        case "select":
        case "select_option": {
          const selector = step.selector as string
          if (!selector) throw new Error("web 'select' action requires a selector")
          const val = String(step.value ?? "")
          log(`select "${val}" on "${selector}"`)
          await page.selectOption(selector, val)
          return { data: { selected: val } }
        }
        case "check": {
          const selector = (step.selector ?? step.value) as string
          if (!selector) throw new Error("web 'check' action requires a selector")
          log(`check "${selector}"`)
          await page.check(selector)
          return { data: { checked: selector } }
        }
        case "uncheck": {
          const selector = (step.selector ?? step.value) as string
          if (!selector) throw new Error("web 'uncheck' action requires a selector")
          log(`uncheck "${selector}"`)
          await page.uncheck(selector)
          return { data: { unchecked: selector } }
        }
        case "assert_visible": {
          const selector = (step.selector ?? step.value) as string
          if (!selector) throw new Error("web 'assert_visible' action requires a selector")
          log(`assert visible "${selector}"`)
          await page.locator(selector).waitFor({ state: "visible", timeout: step.timeout_ms ?? 10_000 })
          return { data: { visible: selector } }
        }
        case "assert_text": {
          const selector = step.selector as string
          if (!selector) throw new Error("web 'assert_text' action requires a selector")
          const expected = String(step.value ?? "")
          log(`assert text on "${selector}" contains "${expected}"`)
          const text = await page.locator(selector).innerText({ timeout: step.timeout_ms ?? 10_000 })
          if (!text.includes(expected)) {
            throw new Error(`Expected element "${selector}" to contain "${expected}", but found "${text}"`)
          }
          return { data: { text, matched: true } }
        }
        case "screenshot": {
          log("capture screenshot")
          const shotPath = step.value ? String(step.value) : undefined
          const buffer = await page.screenshot(shotPath ? { path: shotPath, fullPage: true } : { fullPage: true })
          return { data: { screenshot: true, bytes: buffer.length } }
        }
        case "eval":
        case "script": {
          const code = String(step.value ?? "")
          log(`eval "${code}"`)
          const res = await page.evaluate(code)
          return { data: (typeof res === "object" && res !== null ? res : { result: res }) as Record<string, unknown> }
        }
        default:
          throw new Error(`unknown web action: "${step.action}"`)
      }
    }

    if (step.run) {
      const webStep = await this.loadStep(step.run as string)
      const data = await webStep({ page, params: step.params ?? {}, baseUrl: this.service.url, env, log })
      log(`-> ${JSON.stringify(data ?? {})}`)
      return { data: data ?? {} }
    }

    throw new Error('web step needs "action" (e.g. navigate, click, fill) or "run" (module name)')
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
