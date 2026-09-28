import { resolve } from "node:path"
import { runShell } from "../process.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

export class ShellDriver implements Driver {
  constructor(private readonly configDir: string) {}

  async run({ step, log }: StepRun): Promise<StepResult> {
    if (step.actions && step.actions.length > 0) {
      let lastResult: StepResult = { data: {} }
      for (let i = 0; i < step.actions.length; i++) {
        const act = step.actions[i]
        const cmd = act.command ?? act.value ?? step.command ?? "true"
        const cwd = resolve(this.configDir, act.cwd ?? step.cwd ?? ".")
        log(`$ ${cmd} (in ${cwd})`)
        const result = await runShell(String(cmd), { cwd, timeoutMs: step.timeout_ms ?? 120_000, log })
        const output = result.stdout + result.stderr
        lastResult = {
          data: { stdout: result.stdout.trim(), stderr: result.stderr.trim(), exit_code: result.exitCode },
          exitCode: result.exitCode,
          output,
        }
      }
      return lastResult
    }

    const cwd = resolve(this.configDir, step.cwd ?? ".")
    log(`$ ${step.command} (in ${cwd})`)
    const result = await runShell(step.command as string, { cwd, timeoutMs: step.timeout_ms ?? 120_000, log })
    const output = result.stdout + result.stderr
    return {
      data: { stdout: result.stdout.trim(), stderr: result.stderr.trim(), exit_code: result.exitCode },
      exitCode: result.exitCode,
      output,
    }
  }
}
