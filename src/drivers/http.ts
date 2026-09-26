import type { ServiceConfig } from "../config.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

/** Keeps cookies between the steps of one scenario, like a browser session. */
export class HttpDriver implements Driver {
  private readonly cookies = new Map<string, string>()

  constructor(private readonly service: ServiceConfig) {}

  async run({ step, log }: StepRun): Promise<StepResult> {
    const url = /^https?:\/\//.test(step.url ?? "") ? (step.url as string) : new URL(step.url ?? "/", this.service.url).href
    const method = step.method ?? "GET"
    const hasBody = step.body !== undefined
    log(`${method} ${url}`)
    if (hasBody) log(`body ${JSON.stringify(step.body)}`)

    const response = await fetch(url, {
      method,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(this.cookies.size > 0 ? { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
        ...step.headers,
      },
      body: hasBody ? JSON.stringify(step.body) : undefined,
      signal: AbortSignal.timeout(step.timeout_ms ?? 30_000),
    })
    this.storeCookies(response.headers.getSetCookie())
    const text = await response.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      // not JSON; keep the text
    }
    log(`-> ${response.status} ${text.slice(0, 300)}`)
    return { data, status: response.status, output: text }
  }

  private storeCookies(setCookies: string[]) {
    for (const header of setCookies) {
      const [pair, ...attributes] = header.split(";")
      const name = pair.slice(0, pair.indexOf("=")).trim()
      const value = pair.slice(pair.indexOf("=") + 1).trim()
      const expired = attributes.some((attribute) => {
        const [key, arg = ""] = attribute.split("=").map((part) => part.trim().toLowerCase())
        return (key === "max-age" && Number(arg) <= 0) || (key === "expires" && Date.parse(arg) <= Date.now())
      })
      if (expired || value === "") this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async endScenario() {
    this.cookies.clear()
  }
}
