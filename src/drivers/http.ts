import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ServiceConfig } from "../config.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

/** One request and its response, kept until the scenario ends and written only when it failed. */
type HttpExchange = {
  step: string
  startedAt: string
  durationMs: number
  request: { method: string; url: string; headers: Record<string, string>; body?: unknown }
  response?: { status: number; headers: Record<string, string>; body: unknown }
  error?: string
}

// Header and field names whose values are credentials. Their values never reach a file.
const SECRET_NAME = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i
// A `name=value` or `"name": "value"` pair inside text, such as a form-encoded token response.
// It only starts where a name starts, so a long run of word characters costs linear time, not quadratic.
const NAMED_PAIR = /(?<![\w.-])("?)([\w.-]+)\1(\s*[=:]\s*)("[^"]*"|[^&\s,;"]*)/g
// A response body longer than this is cut, so one large download does not bloat the evidence.
const MAX_BODY_CHARS = 64 * 1024
// Only the latest exchanges of a long scenario are kept.
const MAX_EXCHANGES = 200

/** Keeps cookies between the steps of one scenario, like a browser session. */
export class HttpDriver implements Driver {
  private readonly cookies = new Map<string, string>()
  private exchanges: HttpExchange[] = []

  constructor(private readonly service: ServiceConfig) {}

  async run({ step, log }: StepRun): Promise<StepResult> {
    if (step.actions && step.actions.length > 0) {
      let lastResult: StepResult = { data: {} }
      for (const act of step.actions) {
        const method = (act.method ?? (act.action.startsWith("http_") ? act.action.replace("http_", "") : "GET")).toUpperCase()
        lastResult = await this.request(step.name, log, {
          method,
          url: act.url ?? step.url ?? "/",
          headers: { ...step.headers, ...act.headers },
          body: act.body ?? step.body,
          timeoutMs: step.timeout_ms,
        })
      }
      return lastResult
    }
    return this.request(step.name, log, {
      method: step.method ?? "GET",
      url: step.url ?? "/",
      headers: step.headers,
      body: step.body,
      timeoutMs: step.timeout_ms,
    })
  }

  private async request(
    stepName: string,
    log: StepRun["log"],
    req: { method: string; url: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number },
  ): Promise<StepResult> {
    const url = /^https?:\/\//.test(req.url) ? req.url : new URL(req.url, this.service.url).href
    const hasBody = req.body !== undefined
    log(`${req.method} ${url}`)
    if (hasBody) log(`body ${JSON.stringify(req.body)}`)
    const headers: Record<string, string> = {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(this.cookies.size > 0 ? { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
      ...req.headers,
    }
    const began = Date.now()
    const exchange: HttpExchange = {
      step: stepName,
      startedAt: new Date(began).toISOString(),
      durationMs: 0,
      request: { method: req.method, url: redactUrl(url), headers: redact(headers) as Record<string, string>, ...(hasBody ? { body: redact(req.body) } : {}) },
    }
    this.exchanges.push(exchange)
    if (this.exchanges.length > MAX_EXCHANGES) this.exchanges.shift()

    try {
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(req.timeoutMs ?? 30_000),
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
      // Redact before cutting, so a cut body never holds a credential the redaction would have caught.
      const body = redact(data)
      const shown = typeof body === "string" ? body : JSON.stringify(body)
      exchange.response = {
        status: response.status,
        headers: redact(Object.fromEntries(response.headers)) as Record<string, string>,
        body: shown.length > MAX_BODY_CHARS ? `${shown.slice(0, MAX_BODY_CHARS)}… (${shown.length} chars, cut)` : body,
      }
      return { data, status: response.status, output: text }
    } catch (error) {
      exchange.error = (error as Error).message
      throw error
    } finally {
      exchange.durationMs = Date.now() - began
    }
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

  /** On failure, writes the scenario's requests and responses to `http-exchanges.json`, with credentials redacted. */
  async endScenario(failed: boolean, artifactsDir: string) {
    this.cookies.clear()
    const exchanges = this.exchanges
    this.exchanges = []
    if (failed && exchanges.length > 0) {
      writeFileSync(join(artifactsDir, "http-exchanges.json"), `${JSON.stringify(exchanges, null, 2)}\n`)
    }
  }
}

/**
 * A copy with the value of every header or field named like a credential replaced, at any depth.
 * In text, the value of every `name=value` or `"name": "value"` pair named like a credential is replaced.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (typeof value === "string") return redactText(value)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, field]) => [key, SECRET_NAME.test(key) ? "[redacted]" : redact(field)]),
  )
}

function redactText(text: string): string {
  return text.replace(NAMED_PAIR, (pair, quote: string, name: string, separator: string, value: string) =>
    SECRET_NAME.test(name) ? `${quote}${name}${quote}${separator}${value.startsWith('"') ? '"[redacted]"' : "[redacted]"}` : pair,
  )
}

function redactUrl(url: string): string {
  const parsed = new URL(url)
  for (const name of [...parsed.searchParams.keys()]) {
    if (SECRET_NAME.test(name)) parsed.searchParams.set(name, "[redacted]")
  }
  return parsed.href
}
