import type { DatabaseSync } from "node:sqlite"
import { checkAssert, extract, type FailureLabel, failureLabel } from "./assertions.ts"
import { type LoadedConfig, resolveFromConfig } from "./config.ts"
import { type Scope, substitute } from "./context.ts"
import { type StepRunRecord, saveStepRun } from "./db/runs.ts"
import type { Driver } from "./drivers/types.ts"
import type { PausedStep, PauseHook } from "./hold.ts"
import { color, type RunLog, stripAnsi } from "./logger.ts"
import { runShell, sleep } from "./process.ts"
import type { RunEvent } from "./runner.ts"
import type { Scenario, Step } from "./scenario.ts"

type ScenarioFailure = { step: string; error: string; label: FailureLabel }
export type ScenarioOutcome = {
  failure?: ScenarioFailure
  recovered: number
  down: string[]
  /** Paused on a failure, and the user continued after a manual retry passed. */
  fixed?: boolean
}
type Held = { kind: "continue" | "end" } | { kind: "down"; failure: ScenarioFailure; down: string[] }

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
    /** Set when the run pauses on a failed step instead of ending the scenario. */
    pause?: PauseHook
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

  // One attempt of a step: runs it, records its row, and returns the error when it fails.
  const attemptStep = async (raw: Step, index: number, attempt: number, manual: boolean) => {
    const attemptBegan = Date.now()
    const row = {
      id: `${runId}:${scenario.id}:${run.iteration}:${index}:${attempt}`,
      runId,
      stepId: raw.id || `${scenario.id}:step:${index + 1}`,
      scenarioId: scenario.id,
      iteration: run.iteration,
      attempt,
      createdAt: attemptBegan,
      manual,
    }
    record({ ...row, status: "RUNNING" })
    try {
      const step = substitute(raw, scope)
      const driver = drivers.get(step.target)
      if (!driver) throw new Error(`target "${step.target}" was not prepared for this run`)
      const result = await driver.run({ step, env: config.env, artifactsDir: dir, log: (line) => out.detail(line) })
      checkAssert(step, result)
      extract(step, result, scope.ctx)
      const passedRow: StepRunRecord = {
        ...row,
        status: "PASSED",
        durationMs: Date.now() - attemptBegan,
        statusCode: result.status ?? result.exitCode,
        resultData: result.data,
      }
      record(passedRow)
      return { error: undefined, row: passedRow }
    } catch (error) {
      const failedRow: StepRunRecord = {
        ...row,
        status: "FAILED",
        durationMs: Date.now() - attemptBegan,
        errorMessage: (error as Error).message,
        artifactsPath: dir,
      }
      record(failedRow)
      return { error: error as Error, row: failedRow }
    }
  }

  // Holds a failed step open, on its live page or app screen, until the user continues past it or gives up.
  // Manual retries run once each, numbered after the automatic attempts.
  const holdStep = async (pause: PauseHook, index: number, failure: ScenarioFailure, firstAttempt: number): Promise<Held> => {
    let paused: PausedStep = {
      scenarioId: scenario.id,
      iteration: run.iteration,
      index,
      step: scenario.steps[index],
      error: failure.error,
      label: failure.label,
      retryPassed: false,
      targets: [...drivers.keys()],
    }
    out.line(color.yellow("  paused: fix the step and retry it, or end the scenario"))
    onEvent?.({ type: "hold_start", ...paused, stepName: paused.step.name })
    for (let attempt = firstAttempt; ; attempt++) {
      const decision = await pause(paused)
      if (decision.kind !== "retry") {
        onEvent?.({ type: "hold_end", scenarioId: scenario.id, index, how: decision.kind })
        return { kind: decision.kind }
      }
      const step = decision.step
      const tag = color.dim(`[${step.target}]`)
      const tried = await attemptStep(step, index, attempt, true)
      const duration = tried.row.durationMs ?? 0
      if (!tried.error) {
        // Later iterations of this run use the fix too.
        scenario.steps[index] = step
        paused = { ...paused, step, retryPassed: true }
        out.line(`  ${color.green("✓")} ${tag} ${step.name} ${color.dim(`${duration}ms`)}${color.yellow("  fixed by a manual retry")}`)
        onEvent?.({ type: "hold_retry", scenarioId: scenario.id, index, step, passed: true, duration_ms: duration })
        continue
      }
      const { label, down } = await settle(tried.error)
      record({ ...tried.row, failureLabel: label })
      const error = stripAnsi(tried.error.message).trim()
      out.line(`  ${color.red("✗")} ${tag} ${step.name} ${color.dim(`${duration}ms`)}  ${color.red(label)}`)
      out.line(`      ${color.red(error.split("\n").join("\n      "))}`)
      onEvent?.({ type: "hold_retry", scenarioId: scenario.id, index, step, passed: false, duration_ms: duration, error, label })
      if (down.length > 0) {
        out.line(`      ${color.red(`down: ${down.join(", ")}`)}`)
        onEvent?.({ type: "hold_end", scenarioId: scenario.id, index, how: "stopped" })
        return { kind: "down", failure: { step: step.name, error, label }, down }
      }
      paused = { ...paused, step, error, label, retryPassed: false }
    }
  }

  const outcome: ScenarioOutcome = { recovered: 0, down: [] }
  let completed = false
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
        const tried = await attemptStep(raw, index, attempt, false)
        lastError = tried.error
        if (!tried.error) {
          passedOnAttempt = attempt
          break
        }
        lastFailedRow = tried.row
        if (attempt < attempts) {
          out.detail(`attempt ${attempt} failed: ${tried.error.message}`)
          await sleep(raw.retry?.delay_ms ?? 1000)
        }
      }

      const tag = color.dim(`[${raw.target}]`)
      // Measured before the re-check, so the step's time is the step's own.
      const stepDuration = Date.now() - began
      if (lastError) {
        const { label, down } = await settle(lastError)
        if (lastFailedRow) record({ ...lastFailedRow, failureLabel: label })
        const failure = { step: raw.name, error: stripAnsi(lastError.message).trim(), label }
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
          error: failure.error,
          label,
        })
        // An environment-down failure never pauses: there is no live screen left to fix things on.
        const held = down.length === 0 && run.pause ? await holdStep(run.pause, index, failure, attempts + 1) : undefined
        if (held?.kind === "continue") {
          outcome.fixed = true
          continue
        }
        outcome.failure = held?.kind === "down" ? held.failure : failure
        outcome.down = held?.kind === "down" ? held.down : down
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
    completed = true
    return outcome
  } finally {
    // Fixed only when every pause ended in Continue and the scenario ran to its end; a cancel is never fixed.
    const fixed = completed && outcome.fixed === true && outcome.failure === undefined
    const failed = !fixed && (outcome.failure !== undefined || failing !== undefined)
    onEvent?.({
      type: "scenario_end",
      scenarioId: scenario.id,
      iteration: run.iteration,
      passed: !failed && !fixed,
      fixed,
      duration_ms: Date.now() - scenarioBegan,
      error: fixed ? undefined : (outcome.failure?.error ?? failing),
      label: outcome.failure?.label,
    })
    // A fixed scenario keeps its failure screenshot and trace, like a failed one.
    for (const driver of drivers.values()) {
      await driver.endScenario?.(failed || fixed, dir).catch(() => {})
    }
  }
}
