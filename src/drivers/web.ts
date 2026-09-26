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
    const webStep = await this.loadStep(step.run as string)
    const data = await webStep({ page, params: step.params ?? {}, baseUrl: this.service.url, env, log })
    log(`-> ${JSON.stringify(data ?? {})}`)
    return { data: data ?? {} }
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
