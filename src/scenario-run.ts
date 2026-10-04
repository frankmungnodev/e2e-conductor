import type { DatabaseSync } from "node:sqlite"
import { checkAssert, extract, type FailureLabel, failureLabel } from "./assertions.ts"
import { type LoadedConfig, resolveFromConfig } from "./config.ts"
import { type Scope, substitute } from "./context.ts"
import { type StepRunRecord, saveStepRun } from "./db/runs.ts"
import type { Driver } from "./drivers/types.ts"
import { color, type RunLog, stripAnsi } from "./logger.ts"
import { runShell, sleep } from "./process.ts"
import type { RunEvent } from "./runner.ts"
import type { Scenario } from "./scenario.ts"

type ScenarioFailure = { step: string; error: string; label: FailureLabel }
export type ScenarioOutcome = { failure?: ScenarioFailure; recovered: number; down: string[] }

async function runFixture(config: LoadedConfig, name: string, out: RunLog) {
  const fixture = config.fixtures?.[name]
  if (!fixture) throw new Error(`unknown fixture "${name}"`)
  const log = (line: string) => out.detail(line)
  if (typeof fixture === "function") {
    await fixture({ configDir: config.configDir, env: config.env, log })
    return
  }
  const result = await runShell(fixture.cmd, { cwd: resolveFromConfig(config, fixture.cwd), log })
  if (result.exitCode !== 0) throw new Error(`fixture ${name} exited ${result.exitCode}`)
}

export async function runScenario(
  config: LoadedConfig,
  scenario: Scenario,
  run: {
    drivers: Map<string, Driver>
    dir: string
    iteration: number
    totalIterations: number
    label: string
    out: RunLog
    onEvent?: (event: RunEvent) => void
    signal?: AbortSignal
    runId: string
    db?: DatabaseSync
    /** Re-check every service and device the run prepared; returns what is down. */
    recheck: () => Promise<string[]>
  },
): Promise<ScenarioOutcome> {
  const { drivers, dir, out, onEvent, signal, runId, db } = run
  const scope: Scope = {
    ctx: { ...scenario.vars },
    env: config.env,
    run: { id: Date.now().toString(36), iteration: run.iteration },
  }
  const scenarioBegan = Date.now()
  onEvent?.({
    type: "scenario_start",
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    iteration: run.iteration,
    totalIterations: run.totalIterations,
  })

  out.line()
  out.line(color.bold(`▶ ${scenario.name}`) + color.dim(`  ${run.label}`))

  const record = (stepRun: StepRunRecord) => {
    if (!db) return
    try {
      saveStepRun(db, stepRun)
    } catch {
      // history is best-effort; a write error must not fail the step
    }
  }

  // Runs only after the final attempt, so a service that restarts mid-step gets its retries.
  // A cancel, before or during the re-check, wins and leaves the failure unlabeled.
  // Set before the re-check, so a cancel during it still ends the scenario failed (with its
  // failure artifacts kept) rather than passed.
  let failing: string | undefined
  const settle = async (error: unknown): Promise<{ label: FailureLabel; down: string[] }> => {
    failing = stripAnsi((error as Error).message).trim()
    if (signal?.aborted) throw new Error("Execution cancelled")
    out.line(color.dim("  checking services and devices after the failure…"))
    const down = await run.recheck()
    if (signal?.aborted) throw new Error("Execution cancelled")
    return { label: failureLabel(error, down), down }
  }

  const outcome: ScenarioOutcome = { recovered: 0, down: [] }
  try {
    for (const name of scenario.setup ?? []) {
      if (signal?.aborted) throw new Error("Execution cancelled")
      const began = Date.now()
      try {
        await runFixture(config, name, out)
      } catch (error) {
        const { label, down } = await settle(error)
        outcome.failure = { step: `setup: ${name}`, error: (error as Error).message, label }
        outcome.down = down
        out.line(`  ${color.red("✗")} setup ${name}  ${color.red(label)}\n      ${color.red(outcome.failure.error)}`)
        return outcome
      }
      out.line(`  ${color.green("✓")} setup ${name} ${color.dim(`${Date.now() - began}ms`)}`)
    }

    for (let index = 0; index < scenario.steps.length; index++) {
      if (signal?.aborted) throw new Error("Execution cancelled")
      const raw = scenario.steps[index]
      const began = Date.now()
      onEvent?.({
        type: "step_start",
        scenarioId: scenario.id,
        stepName: raw.name,
        target: raw.target,
        index,
        totalSteps: scenario.steps.length,
      })
      const attempts = (raw.retry?.times ?? 0) + 1
      let lastError: Error | undefined
      let lastFailedRow: StepRunRecord | undefined
      let passedOnAttempt = 0

      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (signal?.aborted) throw new Error("Execution cancelled")
        const attemptBegan = Date.now()
        const row = {
          id: `${runId}:${scenario.id}:${run.iteration}:${index}:${attempt}`,
          runId,
          stepId: raw.id || `${scenario.id}:step:${index + 1}`,
          scenarioId: scenario.id,
          iteration: run.iteration,
          attempt,
          createdAt: attemptBegan,
        }
        record({ ...row, status: "RUNNING" })
        try {
          const step = substitute(raw, scope)
          const driver = drivers.get(step.target) as Driver
          const result = await driver.run({ step, env: config.env, artifactsDir: dir, log: (line) => out.detail(line) })
          checkAssert(step, result)
          extract(step, result, scope.ctx)
          lastError = undefined
          passedOnAttempt = attempt
          record({
            ...row,
            status: "PASSED",
            durationMs: Date.now() - attemptBegan,
            statusCode: result.status ?? result.exitCode,
            resultData: result.data,
          })
          break
        } catch (error) {
          lastError = error as Error
          lastFailedRow = {
            ...row,
            status: "FAILED",
            durationMs: Date.now() - attemptBegan,
            errorMessage: lastError.message,
            artifactsPath: dir,
          }
          record(lastFailedRow)
          if (attempt < attempts) {
            out.detail(`attempt ${attempt} failed: ${lastError.message}`)
            await sleep(raw.retry?.delay_ms ?? 1000)
          }
        }
      }

      const tag = color.dim(`[${raw.target}]`)
      // Measured before the re-check, so the step's time is the step's own.
      const stepDuration = Date.now() - began
      if (lastError) {
        const { label, down } = await settle(lastError)
        if (lastFailedRow) record({ ...lastFailedRow, failureLabel: label })
        outcome.failure = { step: raw.name, error: stripAnsi(lastError.message).trim(), label }
        outcome.down = down
        out.line(`  ${color.red("✗")} ${tag} ${raw.name} ${color.dim(`${stepDuration}ms`)}  ${color.red(label)}`)
        out.line(`      ${color.red(lastError.message.split("\n").join("\n      "))}`)
        if (down.length > 0) out.line(`      ${color.red(`down: ${down.join(", ")}`)}`)
        onEvent?.({
          type: "step_fail",
          scenarioId: scenario.id,
          stepName: raw.name,
          target: raw.target,
          index,
          duration_ms: stepDuration,
          error: outcome.failure.error,
          label,
        })
        return outcome
      }
      const recovered = passedOnAttempt > 1
      if (recovered) outcome.recovered++
      const note = recovered ? color.yellow(`  recovered on attempt ${passedOnAttempt}`) : ""
      out.line(`  ${color.green("✓")} ${tag} ${raw.name} ${color.dim(`${stepDuration}ms`)}${note}`)
      onEvent?.({
        type: "step_pass",
        scenarioId: scenario.id,
        stepName: raw.name,
        target: raw.target,
        index,
        duration_ms: stepDuration,
        recovered,
      })
    }
    return outcome
  } finally {
    const failed = outcome.failure !== undefined || failing !== undefined
    onEvent?.({
      type: "scenario_end",
      scenarioId: scenario.id,
      iteration: run.iteration,
      passed: !failed,
      duration_ms: Date.now() - scenarioBegan,
      error: outcome.failure?.error ?? failing,
      label: outcome.failure?.label,
    })
    for (const driver of drivers.values()) {
      await driver.endScenario?.(failed, dir).catch(() => {})
    }
  }
}
