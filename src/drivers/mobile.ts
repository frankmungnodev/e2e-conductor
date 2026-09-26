import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MobileTarget } from "../config.ts"
import { restoreKeyboards } from "../preflight.ts"
import { runCommand } from "../process.ts"
import { AdbFlowRunner } from "./adb-flow.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

export class MobileDriver implements Driver {
  constructor(
    private readonly target: MobileTarget,
    private readonly flowsDir: string,
    private readonly device: string,
    private readonly adb: string,
    /** Maestro CLI path; undefined when the target uses the adb engine. */
    private readonly maestro: string | undefined,
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
   * Launch through adb instead of Maestro's launchApp, which hangs on some devices.
   * "fresh" wipes app data first; "restart" keeps it.
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

  async run({ step, artifactsDir, log }: StepRun): Promise<StepResult> {
    if (step.launch) this.launch(step.launch, log)
    if (!step.flow) return { data: {} }

    const flow = join(this.flowsDir, step.flow)
    if (!existsSync(flow)) throw new Error(`flow not found: ${flow}`)

    const vars: Record<string, string> = { APP_ID: this.target.appId }
    for (const [key, value] of Object.entries(step.params ?? {})) {
      vars[key] = typeof value === "string" ? value : JSON.stringify(value)
    }
    if (this.target.engine === "adb") {
      await new AdbFlowRunner(this.adb, this.device, log).runFlow(flow, vars)
      return { data: {} }
    }

    // An interrupted run can leave Maestro's on-device driver (or a uiautomator dump) holding
    // UiAutomation; every later call then hangs until a 120s gRPC timeout. Start clean.
    spawnSync(this.adb, ["-s", this.device, "shell", "am", "force-stop", "dev.mobile.maestro"])
    spawnSync(this.adb, ["-s", this.device, "shell", "pkill", "-f", "uiautomator"])

    const debugDir = join(artifactsDir, "maestro", step.flow as string)
    mkdirSync(debugDir, { recursive: true })

    const args = ["--device", this.device, "test", "--no-reinstall-driver", flow, "--debug-output", debugDir]
    for (const [key, value] of Object.entries(vars)) args.push("-e", `${key}=${value}`)
    log(`maestro ${args.join(" ")}`)

    const result = await runCommand(this.maestro as string, args, { timeoutMs: step.timeout_ms ?? 300_000, log })
    if (result.exitCode !== 0) {
      const tail = (result.stdout + result.stderr).trim().split("\n").slice(-8).join("\n")
      throw new Error(`Maestro flow ${step.flow} failed (exit ${result.exitCode}):\n${tail}`)
    }
    return { data: {}, exitCode: result.exitCode, output: result.stdout }
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!failed) return
    const shot = spawnSync(this.adb, ["-s", this.device, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 })
    if (shot.status === 0) writeFileSync(join(artifactsDir, "mobile-failure.png"), shot.stdout)
  }
}
