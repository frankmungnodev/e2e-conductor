import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { type LoadedConfig, resolveFromConfig, SHELL_TARGET, serviceOf } from "./config.ts"
import { getPath, mismatch, type Scope, substitute } from "./context.ts"
import { HttpDriver } from "./drivers/http.ts"
import { MobileDriver } from "./drivers/mobile.ts"
import { ShellDriver } from "./drivers/shell.ts"
import type { Driver, StepResult } from "./drivers/types.ts"
import { WebDriver } from "./drivers/web.ts"
import { color, RunLog, stripAnsi } from "./logger.ts"
import { prepareMobile, prepareServices, type StartedService, stopService } from "./preflight.ts"
import { runShell, sleep } from "./process.ts"
import { loadScenarios, type Scenario, type Step, targetsUsed } from "./scenario.ts"

export type RunOptions = {
  scenarios: string[]
  repeat: number
  start: boolean
  install: boolean
  /** Preflight only; leave started services running, except exclusive ones. */
  checkOnly: boolean
}

type Failure = { scenario: string; iteration: number; step: string; error: string }

export type Summary = {
  status: "PASSED" | "FAILED"
  total: number
  passed: number
  failed: number
  duration_ms: number
  failures: Failure[]
  artifacts: string
}

function checkAssert(step: Step, result: StepResult) {
  const expect = step.assert ?? {}
  const errors: string[] = []

  if (expect.status !== undefined && result.status !== expect.status) {
    errors.push(`status: expected ${expect.status}, got ${result.status}`)
  } else if (expect.status === undefined && result.status !== undefined && result.status >= 400) {
    errors.push(`status ${result.status} (add assert.status to expect an error)`)
  }
  if (result.exitCode !== undefined && result.exitCode !== (expect.exit_code ?? 0)) {
    errors.push(`exit code: expected ${expect.exit_code ?? 0}, got ${result.exitCode}`)
  }
  if (expect.output_contains !== undefined && !(result.output ?? "").includes(expect.output_contains)) {
    errors.push(`output does not contain "${expect.output_contains}"`)
  }
  for (const [path, expected] of Object.entries(expect.json_match ?? {})) {
    const problem = mismatch(getPath(result.data, path), expected)
    if (problem) errors.push(`${path}: ${problem}`)
  }
  if (errors.length > 0) throw new Error(errors.join("; "))
}

function extract(step: Step, result: StepResult, ctx: Record<string, unknown>) {
  for (const [name, path] of Object.entries(step.extract ?? {})) {
    const value = getPath(result.data, path)
    if (value === undefined) throw new Error(`extract ${name}: nothing at "${path}"`)
    ctx[name] = value
  }
}

async function runFixture(config: LoadedConfig, name: string, out: RunLog) {
  const fixture = config.fixtures?.[name]
  if (!fixture) throw new Error(`unknown fixture "${name}"`)
  const log = (line: string) => out.detail(line)
  if (typeof fixture === "function") {
    await fixture({ configDir: config.configDir, env: config.env, log })
    return
  }
  const result = await runShell(fixture.cmd, { cwd: resolve(config.configDir, fixture.cwd ?? "."), log })
  if (result.exitCode !== 0) throw new Error(`fixture ${name} exited ${result.exitCode}`)
}

export async function run(config: LoadedConfig, options: RunOptions): Promise<Summary> {
  const startedAt = Date.now()
  const runId = new Date(startedAt).toISOString().replace(/[:.]/g, "-")
  const resultsDir = resolveFromConfig(config, config.results)
  const artifactsRoot = join(resultsDir, "artifacts", runId)
  const out = new RunLog(join(resultsDir, "run.log"))

  const scenarios = loadScenarios(config, options.scenarios)
  const used = targetsUsed(scenarios)
  const drivers = new Map<string, Driver>()
  let services: StartedService[] = []
  const summary: Summary = {
    status: "PASSED",
    total: 0,
    passed: 0,
    failed: 0,
    duration_ms: 0,
    failures: [],
    artifacts: artifactsRoot,
  }

  const cleanup = async () => {
    for (const driver of drivers.values()) await driver.close?.().catch(() => {})
    // An exclusive service left running would make the next run refuse to start.
    for (const started of services) {
      if (!options.checkOnly || config.services?.[started.name]?.exclusive) stopService(started)
    }
  }
  const onInterrupt = () => {
    void cleanup().finally(() => process.exit(130))
  }
  process.once("SIGINT", onInterrupt)

  try {
    out.line(color.bold("Preflight"))
    const serviceNames = new Set<string>()
    for (const name of used) {
      const target = config.targets[name]
      if (target && target.driver !== "mobile") serviceNames.add(target.service)
    }

    for (const name of used) {
      const target = config.targets[name]
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
        drivers.set(
          name,
          new MobileDriver(target, resolveFromConfig(config, target.flows), setup.device, setup.adb),
        )
      }
    }

    // After the devices: their preflight also undoes device changes left by a crashed run,
    // which must not be skipped because a service check failed.
    services = await prepareServices(config, serviceNames, { start: options.start, logsDir: join(resultsDir, "services") }, out)

    if (options.checkOnly) {
      out.line(color.green("Ready."))
      return summary
    }

    for (let iteration = 1; iteration <= options.repeat; iteration++) {
      for (const scenario of scenarios) {
        const label = options.repeat > 1 ? `${scenario.id} (${iteration}/${options.repeat})` : scenario.id
        const dir = join(artifactsRoot, options.repeat > 1 ? `${scenario.id}-${iteration}` : scenario.id)
        mkdirSync(dir, { recursive: true })
        const failure = await runScenario(config, scenario, { drivers, dir, runId, iteration, label, out })
        summary.total++
        if (failure) {
          summary.failed++
          summary.failures.push({ scenario: scenario.id, iteration, ...failure })
        } else {
          summary.passed++
        }
      }
    }
  } finally {
    process.removeListener("SIGINT", onInterrupt)
    await cleanup()
  }

  summary.status = summary.failed === 0 ? "PASSED" : "FAILED"
  summary.duration_ms = Date.now() - startedAt
  writeFileSync(join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)

  out.line()
  const counts = `${summary.passed}/${summary.total} passed in ${(summary.duration_ms / 1000).toFixed(1)}s`
  out.line(summary.failed === 0 ? color.green(`PASSED ${counts}`) : color.red(`FAILED ${counts}`))
  if (summary.failed > 0) out.line(color.dim(`artifacts: ${artifactsRoot}`))
  return summary
}

async function runScenario(
  config: LoadedConfig,
  scenario: Scenario,
  run: { drivers: Map<string, Driver>; dir: string; runId: string; iteration: number; label: string; out: RunLog },
): Promise<{ step: string; error: string } | undefined> {
  const { drivers, dir, out } = run
  const scope: Scope = {
    ctx: { ...scenario.vars },
    env: config.env,
    run: { id: Date.now().toString(36), iteration: run.iteration },
  }
  out.line()
  out.line(color.bold(`▶ ${scenario.name}`) + color.dim(`  ${run.label}`))

  let failure: { step: string; error: string } | undefined
  try {
    for (const name of scenario.setup ?? []) {
      const began = Date.now()
      try {
        await runFixture(config, name, out)
      } catch (error) {
        failure = { step: `setup: ${name}`, error: (error as Error).message }
        out.line(`  ${color.red("✗")} setup ${name}\n      ${color.red(failure.error)}`)
        return failure
      }
      out.line(`  ${color.green("✓")} setup ${name} ${color.dim(`${Date.now() - began}ms`)}`)
    }

    for (const raw of scenario.steps) {
      const began = Date.now()
      const attempts = (raw.retry?.times ?? 0) + 1
      let lastError: Error | undefined

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const step = substitute(raw, scope)
          const driver = drivers.get(step.target) as Driver
          const result = await driver.run({ step, env: config.env, artifactsDir: dir, log: (line) => out.detail(line) })
          checkAssert(step, result)
          extract(step, result, scope.ctx)
          lastError = undefined
          break
        } catch (error) {
          lastError = error as Error
          if (attempt < attempts) {
            out.detail(`attempt ${attempt} failed: ${lastError.message}`)
            await sleep(raw.retry?.delay_ms ?? 1000)
          }
        }
      }

      const tag = color.dim(`[${raw.target}]`)
      const took = color.dim(`${Date.now() - began}ms`)
      if (lastError) {
        failure = { step: raw.name, error: stripAnsi(lastError.message).trim() }
        out.line(`  ${color.red("✗")} ${tag} ${raw.name} ${took}`)
        out.line(`      ${color.red(lastError.message.split("\n").join("\n      "))}`)
        return failure
      }
      out.line(`  ${color.green("✓")} ${tag} ${raw.name} ${took}`)
    }
    return undefined
  } finally {
    for (const driver of drivers.values()) {
      await driver.endScenario?.(failure !== undefined, dir).catch(() => {})
    }
  }
}
