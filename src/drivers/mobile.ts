import { spawnSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MobileTarget } from "../config.ts"
import { restoreKeyboards } from "../preflight.ts"
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

  private adbShell(args: string[], log: StepRun["log"]) {
    log(`adb shell ${args.join(" ")}`)
    const result = spawnSync(this.adb, ["-s", this.device, "shell", ...args], { encoding: "utf8" })
    if (result.status !== 0) throw new Error(`adb shell ${args.join(" ")} failed: ${result.stderr.trim()}`)
  }

  /**
   * Launch the app through adb. "fresh" wipes app data first; "restart" keeps it.
   */
  private launch(mode: "fresh" | "restart", log: StepRun["log"]) {
    const { appId } = this.target
    this.adbShell(["am", "force-stop", appId], log)
    if (mode === "fresh") {
      this.adbShell(["pm", "clear", appId], log)
      for (const permission of this.target.grantPermissions ?? []) {
        this.adbShell(["pm", "grant", appId, permission], log)
      }
    }
    this.adbShell(["monkey", "-p", appId, "-c", "android.intent.category.LAUNCHER", "1"], log)
  }

  async run({ step, log }: StepRun): Promise<StepResult> {
    if (step.launch) this.launch(step.launch, log)
    if (!step.flow) return { data: {} }

    const flow = join(this.flowsDir, step.flow)
    if (!existsSync(flow)) throw new Error(`flow not found: ${flow}`)

    const vars: Record<string, string> = { APP_ID: this.target.appId }
    for (const [key, value] of Object.entries(step.params ?? {})) {
      vars[key] = typeof value === "string" ? value : JSON.stringify(value)
    }
    await new AdbFlowRunner(this.adb, this.device, log).runFlow(flow, vars)
    return { data: {} }
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!failed) return
    const shot = spawnSync(this.adb, ["-s", this.device, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 })
    if (shot.status === 0) writeFileSync(join(artifactsDir, "mobile-failure.png"), shot.stdout)
  }
}
