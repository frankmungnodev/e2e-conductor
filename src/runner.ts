import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import type { FailureLabel } from "./assertions.ts"
import { type LoadedConfig, resolveFromConfig, type ServiceConfig, SHELL_TARGET, serviceOf } from "./config.ts"
import { openDatabase } from "./db/connection.ts"
import { resolveDbPath } from "./db/paths.ts"
import { saveRun } from "./db/runs.ts"
import { HttpDriver } from "./drivers/http.ts"
import { MobileDriver } from "./drivers/mobile.ts"
import { ShellDriver } from "./drivers/shell.ts"
import type { Driver } from "./drivers/types.ts"
import { WebDriver } from "./drivers/web.ts"
import { findDown, listDevicesBounded } from "./health.ts"
import type { PausedStep, PauseHook } from "./hold.ts"
import { color, RunLog } from "./logger.ts"
import { prepareMobile, prepareServices, type StartedService, stopService } from "./preflight.ts"
import { ENVIRONMENT_DOWN, type NotRun, notRunAfter, type RunReason, resultLine, settleStatus } from "./run-result.ts"
import { loadScenarios, type Step, targetsUsed } from "./scenario.ts"
import { runScenario } from "./scenario-run.ts"

export type RunEvent =
  | { type: "preflight_start" }
  | { type: "preflight_done" }
  | { type: "run_start"; runId: string; totalScenarios: number; repeat: number; scenarios: Array<{ id: string; name: string; stepsCount: number }> }
  | { type: "scenario_start"; scenarioId: string; scenarioName: string; iteration: number; totalIterations: number }
  | { type: "step_start"; scenarioId: string; stepName: string; target: string; index: number; totalSteps: number }
  | { type: "step_pass"; scenarioId: string; stepName: string; target: string; index: number; duration_ms: number; recovered: boolean }
  | {
      type: "step_fail"
      scenarioId: string
      stepName: string
      target: string
      index: number
      duration_ms: number
      error: string
      label: FailureLabel
    }
  // `label` is the scenario's failure label; a failed setup fixture has no step_fail, so this is where its label shows.
  // `fixed` marks a scenario that paused on a failure and passed after a manual retry; it is neither passed nor failed.
  | {
      type: "scenario_end"
      scenarioId: string
      iteration: number
      passed: boolean
      fixed?: boolean
      duration_ms: number
      error?: string
      label?: FailureLabel
    }
  | ({ type: "hold_start"; stepName: string } & PausedStep)
  // `step` is the step the retry ran, so the next edit starts from it. The server sets `savedTo`, the
  // scenario's name, when it saved a passing retry to the stored scenario.
  | {
      type: "hold_retry"
      scenarioId: string
      index: number
      step: Step
      /** The name the stored step had when the run last saved or loaded it. */
      replaces: string
      passed: boolean
      duration_ms: number
      error?: string
      label?: FailureLabel
      savedTo?: string
    }
  | { type: "hold_end"; scenarioId: string; index: number; how: "continue" | "end" | "stopped" }
  | { type: "log"; text: string; level: "info" | "detail" }
  | { type: "finish"; summary: Summary }

export type RunOptions = {
  scenarios: string[]
  repeat: number
  start: boolean
  install: boolean
  /** Preflight only; leave started services running, except exclusive ones. */
  checkOnly: boolean
  /** Optional callback for UI / monitoring events */
  onEvent?: (event: RunEvent) => void
  /** Optional abort signal to cancel a running execution */
  signal?: AbortSignal
  /** Fail a run whose only issue is steps that passed on a retry. */
  strict?: boolean  /** Pause on a failed step so the user can fix and retry it; see `src/hold.ts`. */
  pause?: PauseHook
}

// `label` is optional only because summaries written before labels existed lack it.
type Failure = { scenario: string; iteration: number; step: string; error: string; label?: FailureLabel }

export type Summary = {
  status: "PASSED" | "FAILED"
  /** Scenario-iterations in the run, including the ones `notRun` lists. */
  total: number
  passed: number
  failed: number
  /** Scenario-iterations that paused on a failure and passed after a manual retry; neither passed nor failed. */
  fixed: number
  duration_ms: number
  failures: Failure[]
  artifacts: string
  /** Why the run failed when no single failure explains it: "environment down", "fixed during run" or "recovered steps (strict)". */
  reason?: RunReason
  /** What the re-check found down when the run stopped. */
  down?: string[]
  /** Step executions that passed only on a retry. */
  recovered: number
  notRun: NotRun[]
  /** Set when the run was started with --strict. */
  strict?: boolean
}


export async function run(config: LoadedConfig, options: RunOptions): Promise<Summary> {
  const startedAt = Date.now()
  const runId = new Date(startedAt).toISOString().replace(/[:.]/g, "-")
  const resultsDir = resolveFromConfig(config, config.results)
  const artifactsRoot = join(resultsDir, "artifacts", runId)
  const out = new RunLog(join(resultsDir, "run.log"), (line, isDetail) => {
    options.onEvent?.({ type: "log", text: line, level: isDetail ? "detail" : "info" })
  })

  let db: DatabaseSync | undefined
  const dbPath = resolveDbPath(config.configDir)
  if (existsSync(dbPath)) {
    try {
      db = openDatabase(dbPath)
    } catch {
      // ignore db open error
    }
  }

  const scenarios = loadScenarios(config, options.scenarios)
  const used = targetsUsed(scenarios)
  const drivers = new Map<string, Driver>()
  let services: StartedService[] = []
  const summary: Summary = {
    status: "PASSED",
    total: 0,
    passed: 0,
    failed: 0,
    fixed: 0,
    duration_ms: 0,
    failures: [],
    artifacts: artifactsRoot,
    recovered: 0,
    notRun: [],
  }
  // What preflight prepared, kept so a final failure can re-check the whole run's environment.
  const serviceNames = new Set<string>()
  const devices: string[] = []
  let adb: string | undefined
  const recheck = () => {
    const prepared: Record<string, ServiceConfig> = {}
    for (const name of serviceNames) {
      const service = config.services?.[name]
      if (service) prepared[name] = service
    }
    return findDown(prepared, devices, () => listDevicesBounded(adb))
  }

  const cleanup = async () => {
    for (const driver of drivers.values()) await driver.close?.().catch(() => {})
    // An exclusive service left running would make the next run refuse to start.
    for (const started of services) {
      if (!options.checkOnly || config.services?.[started.name]?.exclusive) stopService(started)
    }
    if (db) {
      try {
        db.close()
      } catch {
        // ignore
      }
    }
  }
  const onInterrupt = () => {
    void cleanup().finally(() => process.exit(130))
  }
  process.once("SIGINT", onInterrupt)

  try {
    options.onEvent?.({ type: "preflight_start" })
    out.line(color.bold("Preflight"))
    for (const name of used) {
      const target = config.targets[name]
      if (target && target.driver !== "mobile") serviceNames.add(target.service)
      if (name === SHELL_TARGET) {
        drivers.set(name, new ShellDriver(config.configDir))
      } else if (target.driver === "http") {
        drivers.set(name, new HttpDriver(serviceOf(config, target.service)))
      } else if (target.driver === "web") {
        const service = serviceOf(config, target.service)
        drivers.set(name, new WebDriver(target, service, resolveFromConfig(config, target.modules)))
      } else if (target.driver === "mobile") {
        const setup = await prepareMobile(config, name, target, { install: options.install }, out)
        // Shell steps can then run plain `adb ...` against the device the run picked,
        // even with several devices connected.
        process.env.ANDROID_SERIAL ??= setup.device
        devices.push(setup.device)
        adb = setup.adb
        drivers.set(name, new MobileDriver(target, setup.device, setup.adb))
      }
    }

    // After the devices: their preflight also undoes device changes left by a crashed run,
    // which must not be skipped because a service check failed.
    services = await prepareServices(config, serviceNames, { start: options.start, logsDir: join(resultsDir, "services") }, out)
    options.onEvent?.({ type: "preflight_done" })

    if (options.checkOnly) {
      out.line(color.green("Ready."))
      return summary
    }

    if (db) {
      try {
        saveRun(db, {
          id: runId,
          environmentName: config.activeEnvironment || config.env?.APP_ENV || "dev",
          status: "RUNNING",
          totalScenarios: scenarios.length * options.repeat,
          passedScenarios: 0,
          failedScenarios: 0,
          artifactsDir: artifactsRoot,
          startedAt,
        })
      } catch {
        // ignore
      }
    }

    options.onEvent?.({
      type: "run_start",
      runId,
      totalScenarios: scenarios.length * options.repeat,
      repeat: options.repeat,
      scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, stepsCount: s.steps.length })),
    })

    // An environment-down stop breaks out here instead of throwing like a cancel, so the run
    // still writes summary.json, prints its result and sends `finish`.
    iterations: for (let iteration = 1; iteration <= options.repeat; iteration++) {
      for (const [index, scenario] of scenarios.entries()) {
        if (options.signal?.aborted) throw new Error("Execution cancelled")
        const label = options.repeat > 1 ? `${scenario.id} (${iteration}/${options.repeat})` : scenario.id
        const dir = join(artifactsRoot, options.repeat > 1 ? `${scenario.id}-${iteration}` : scenario.id)
        mkdirSync(dir, { recursive: true })
        const outcome = await runScenario(config, scenario, {
          drivers,
          dir,
          iteration,
          totalIterations: options.repeat,
          label,
          out,
          onEvent: options.onEvent,
          signal: options.signal,
          runId,
          db,
          recheck,
          pause: options.pause,
        })
        summary.total++
        summary.recovered += outcome.recovered
        if (outcome.failure) {
          summary.failed++
          summary.failures.push({ scenario: scenario.id, iteration, ...outcome.failure })
        } else if (outcome.fixed) {
          summary.fixed++
        } else {
          summary.passed++
        }
        if (outcome.down.length > 0) {
          summary.reason = ENVIRONMENT_DOWN
          summary.down = outcome.down
          summary.notRun = notRunAfter(
            scenarios.map((s) => s.id),
            options.repeat,
            iteration,
            index,
          )
          summary.total += summary.notRun.length
          break iterations
        }
      }
    }
  } finally {
    process.removeListener("SIGINT", onInterrupt)
    settleStatus(summary, options.strict === true)
    summary.duration_ms = Date.now() - startedAt
    if (db && !options.checkOnly) {
      try {
        saveRun(db, {
          id: runId,
          environmentName: config.activeEnvironment || config.env?.APP_ENV || "dev",
          status: options.signal?.aborted ? "CANCELLED" : summary.status,
          totalScenarios: summary.total,
          passedScenarios: summary.passed,
          failedScenarios: summary.failed,
          durationMs: summary.duration_ms,
          artifactsDir: artifactsRoot,
          startedAt,
          completedAt: Date.now(),
          reason: summary.reason,
          recoveredSteps: summary.recovered,
          notRunScenarios: summary.notRun.length,
          fixedScenarios: summary.fixed,
        })
      } catch {
        // ignore
      }
    }
    await cleanup()
  }

  writeFileSync(join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)

  out.line()
  const result = resultLine(summary)
  out.line(summary.status === "PASSED" ? color.green(result) : color.red(result))
  if (summary.notRun.length > 0) {
    const names = summary.notRun.map((entry) => (options.repeat > 1 ? `${entry.scenario} (${entry.iteration})` : entry.scenario))
    out.line(color.dim(`not run: ${names.join(", ")}`))
  }
  if (summary.failed > 0) out.line(color.dim(`artifacts: ${artifactsRoot}`))
  options.onEvent?.({ type: "finish", summary })
  return summary
}
