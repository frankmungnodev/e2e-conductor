import { spawnSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MobileTarget } from "../config.ts"
import { restoreKeyboards } from "../preflight.ts"
import { runAdb } from "../process.ts"
import { AdbFlowRunner } from "./adb-flow.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

export class MobileDriver implements Driver {
  constructor(
    private readonly target: MobileTarget,
    private readonly flowsDir: string,
    private readonly device: string,
    private readonly adb: string,
  ) {}

  async close() {
    restoreKeyboards(this.adb, this.device)
  }

  /**
   * Launch the app through adb. "fresh" wipes app data first; "restart" keeps it.
   */
  private async launch(mode: "fresh" | "restart", runner: AdbFlowRunner, log: StepRun["log"]) {
    const { appId } = this.target
    await runner.runCommands(mode === "fresh" ? ["stopApp", "clearState"] : ["stopApp"], appId)
    for (const permission of mode === "fresh" ? (this.target.grantPermissions ?? []) : []) {
      log(`pm grant ${appId} ${permission}`)
      runAdb(this.adb, this.device, ["shell", "pm", "grant", appId, permission])
    }
    await runner.runCommands(["launchApp"], appId)
  }

  async run({ step, log }: StepRun): Promise<StepResult> {
    const runner = new AdbFlowRunner(this.adb, this.device, log)
    if (step.launch) await this.launch(step.launch, runner, log)
    if (!step.flow) return { data: {} }

    const flow = join(this.flowsDir, step.flow)
    if (!existsSync(flow)) throw new Error(`flow not found: ${flow}`)

    const vars: Record<string, string> = { APP_ID: this.target.appId }
    for (const [key, value] of Object.entries(step.params ?? {})) {
      vars[key] = typeof value === "string" ? value : JSON.stringify(value)
    }
    await runner.runFlow(flow, vars)
    return { data: {} }
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!failed) return
    // Binary PNG output, so not through runAdb.
    const shot = spawnSync(this.adb, ["-s", this.device, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 })
    if (shot.status === 0) writeFileSync(join(artifactsDir, "mobile-failure.png"), shot.stdout)
  }
}
