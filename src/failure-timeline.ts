import type { StepAttempt } from "./run-report.ts"

export type TimelineSource = "step" | "http" | "device"
export type TimelineLevel = "error" | "warning" | "info"

/** One thing that happened during a scenario-iteration, placed on the host clock. */
export type TimelineEvent = {
  /** Epoch milliseconds on the host clock. */
  at: number
  source: TimelineSource
  level: TimelineLevel
  title: string
  detail?: string
  durationMs?: number
}

/**
 * How device log times were placed: `exact` when the log carries the year and UTC times, `assumed`
 * when it carries only month and day in the device's time zone, read as this computer's.
 */
export type DeviceClock = "exact" | "assumed"

export type FailureTimeline = {
  startedAt: number
  events: TimelineEvent[]
  /** Device log entries (warnings and worse) before the cap; `events` holds the latest `MAX_DEVICE_ENTRIES`. */
  deviceEntries: number
  deviceClock?: DeviceClock
}

type Input = {
  startedAt: number
  /** The pinned steps, by position, for step names. */
  steps: Array<{ name?: string }>
  /** This scenario-iteration's step attempts, with each one's position. */
  attempts: StepAttempt[]
  /** The contents of `http-exchanges.json`, if the scenario-iteration has one. */
  httpExchanges?: string
  /** The contents of `mobile-logcat.txt`, if the scenario-iteration has one. */
  logcat?: string
}

// A device log is mostly noise; the latest warnings and errors are the ones near the failure.
const MAX_DEVICE_ENTRIES = 100
// A stack trace logs one line per frame; an entry keeps its first lines.
const MAX_ENTRY_LINES = 30
// A threadtime line, with the year when the log was captured with `-v year`.
const LOGCAT_LINE = /^(?:(\d{4})-)?(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFA])\s+(.*?)\s*: ?(.*)$/
const HALF_YEAR_MS = 183 * 86_400_000
// The logcat levels the timeline keeps; verbose, debug and info lines are left out.
const DEVICE_LEVEL: Partial<Record<string, TimelineLevel>> = { W: "warning", E: "error", F: "error", A: "error" }

/**
 * Lines up a scenario-iteration's step attempts, HTTP exchanges and device log on one clock, so a
 * failure can be read in the order things happened across drivers. Browser detail stays in the
 * Playwright trace.
 */
export function buildFailureTimeline({ startedAt, steps, attempts, httpExchanges, logcat }: Input): FailureTimeline {
  const stepEvents = attempts.map((attempt) => stepEvent(attempt, steps[attempt.index]?.name))
  const httpEvents = parseExchanges(httpExchanges)
  const device = logcat ? parseLogcat(logcat, startedAt) : undefined
  const deviceEvents = device?.entries.slice(-MAX_DEVICE_ENTRIES) ?? []
  // A stable sort keeps a step's start ahead of the requests and log lines of the same millisecond.
  const events = [...stepEvents, ...httpEvents, ...deviceEvents].sort((a, b) => a.at - b.at)
  return { startedAt, events, deviceEntries: device?.entries.length ?? 0, deviceClock: device?.clock }
}

function stepEvent(attempt: StepAttempt, name: string | undefined): TimelineEvent {
  const tries = attempt.manual ? "manual retry" : attempt.attempt > 1 ? `try ${attempt.attempt}` : undefined
  const { level, outcome } = stepOutcome(attempt)
  return {
    at: attempt.createdAt,
    source: "step",
    level,
    title: `${attempt.index + 1}. ${name ?? `Step ${attempt.index + 1}`}${tries ? ` (${tries})` : ""}`,
    detail: outcome,
    durationMs: attempt.durationMs,
  }
}

function stepOutcome(attempt: StepAttempt): { level: TimelineLevel; outcome: string } {
  switch (attempt.status) {
    case "FAILED":
      return { level: "error", outcome: `Failed: ${attempt.errorMessage?.split("\n")[0] ?? "no error message was recorded"}` }
    case "PASSED":
      return { level: "info", outcome: "Passed" }
    case "RUNNING":
      return { level: "warning", outcome: "Did not finish" }
    default:
      return { level: "warning", outcome: attempt.status }
  }
}

/** An entry of `http-exchanges.json` (`HttpExchange` in src/drivers/http.ts), every field optional because the file is read back from disk. */
type Exchange = {
  step?: string
  startedAt?: string
  durationMs?: number
  request?: { method?: string; url?: string }
  response?: { status?: number }
  error?: string
}

/** Each request in `http-exchanges.json`; a file that cannot be read gives none. */
export function parseExchanges(json: string | undefined): TimelineEvent[] {
  if (!json) return []
  let exchanges: unknown
  try {
    exchanges = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(exchanges)) return []
  return (exchanges as Exchange[]).flatMap((exchange) => {
    const at = Date.parse(exchange.startedAt ?? "")
    if (Number.isNaN(at)) return []
    const status = exchange.response?.status
    const outcome = exchange.error ? `No response: ${exchange.error}` : status !== undefined ? `${status}` : "No response"
    return [
      {
        at,
        source: "http" as const,
        level: exchange.error || status === undefined || status >= 400 ? ("error" as const) : ("info" as const),
        title: `${exchange.request?.method ?? "GET"} ${pathOf(exchange.request?.url ?? "")}`,
        detail: exchange.step ? `${outcome} · ${exchange.step}` : outcome,
        durationMs: exchange.durationMs,
      },
    ]
  })
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/**
 * The warnings and errors of a `logcat -v threadtime` dump. Consecutive lines of one thread, tag and
 * level at the same time (a stack trace) make one entry. Lines with the year are UTC (`-v year -v UTC`);
 * lines without it are read in this computer's time zone, in the year that puts them nearest `startedAt`.
 */
export function parseLogcat(text: string, startedAt: number): { entries: TimelineEvent[]; clock?: DeviceClock } {
  const entries: TimelineEvent[] = []
  let clock: DeviceClock | undefined
  let lastKey: string | undefined
  const startYear = new Date(startedAt).getFullYear()
  for (const line of text.split("\n")) {
    const match = LOGCAT_LINE.exec(line.trimEnd())
    if (!match) continue
    const [, year, month, day, hour, minute, second, millis, pid, tid, logLevel, tag, message] = match
    const level = DEVICE_LEVEL[logLevel]
    if (!level) {
      lastKey = undefined
      continue
    }
    const time = [Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(millis)] as const
    let at: number
    if (year) {
      at = Date.UTC(Number(year), ...time)
      clock ??= "exact"
    } else {
      // One line without the year makes the whole log's times assumed.
      clock = "assumed"
      at = new Date(startYear, ...time).getTime()
      if (at - startedAt > HALF_YEAR_MS) at = new Date(startYear - 1, ...time).getTime()
      else if (startedAt - at > HALF_YEAR_MS) at = new Date(startYear + 1, ...time).getTime()
    }
    const key = `${at} ${pid} ${tid} ${logLevel} ${tag}`
    const previous = entries.at(-1)
    if (key === lastKey && previous) {
      const lines = previous.detail?.split("\n") ?? []
      if (lines.length < MAX_ENTRY_LINES) previous.detail = [...lines, message].join("\n")
      continue
    }
    lastKey = key
    entries.push({ at, source: "device", level, title: tag || "(no tag)", detail: message })
  }
  return { entries, clock }
}
