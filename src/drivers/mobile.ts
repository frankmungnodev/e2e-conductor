import { spawnSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MobileTarget } from "../config.ts"
import { stringify } from "../context.ts"
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
    const { appId } = this.target

    if (step.launch) await this.launch(step.launch, runner, log)

    if (step.action) {
      const action = step.action.toLowerCase()
      log(`mobile action: ${action}`)

      switch (action) {
        case "tap":
        case "tapon":
        case "click": {
          const target = step.selector ?? step.value
          if (!target) throw new Error("mobile 'tap' action requires a selector or value")
          await runner.runCommands([{ tapOn: target }], appId)
          return { data: { tapped: target } }
        }
        case "type":
        case "input":
        case "inputtext":
        case "fill": {
          const text = String(step.value ?? "")
          if (step.selector) {
            await runner.runCommands([{ tapOn: step.selector }, { inputText: text }], appId)
          } else {
            await runner.runCommands([{ inputText: text }], appId)
          }
          return { data: { typed: text } }
        }
        case "erase":
        case "erasetext":
        case "clear": {
          const characters = step.ms ?? 50
          await runner.runCommands([{ eraseText: { characters } }], appId)
          return { data: { erased: characters } }
        }
        case "press":
        case "presskey": {
          const key = (step.key ?? step.value ?? "BACK") as string
          await runner.runCommands([{ pressKey: key }], appId)
          return { data: { pressed: key } }
        }
        case "back": {
          await runner.runCommands(["back"], appId)
          return { data: { back: true } }
        }
        case "hidekeyboard": {
          await runner.runCommands(["hideKeyboard"], appId)
          return { data: { keyboardHidden: true } }
        }
        case "assert_visible":
        case "assertvisible": {
          const target = step.selector ?? step.value
          if (!target) throw new Error("mobile 'assert_visible' action requires a selector or value")
          await runner.runCommands([{ assertVisible: target }], appId)
          return { data: { visible: target } }
        }
        case "assert_not_visible":
        case "assertnotvisible": {
          const target = step.selector ?? step.value
          if (!target) throw new Error("mobile 'assert_not_visible' action requires a selector or value")
          await runner.runCommands([{ assertNotVisible: target }], appId)
          return { data: { notVisible: target } }
        }
        case "wait":
        case "wait_for": {
          if (step.selector) {
            await runner.runCommands([{ assertVisible: step.selector }], appId)
          }
          if (step.ms) {
            await runner.runCommands([{ waitForAnimationToEnd: step.ms }], appId)
          }
          return { data: { waited: true } }
        }
        case "swipe": {
          const from = step.selector ?? step.value
          const direction = (step.key ?? "RIGHT").toUpperCase()
          await runner.runCommands([{ swipe: { from, direction } }], appId)
          return { data: { swiped: direction } }
        }
        case "launch":
        case "launchapp": {
          await runner.runCommands(["launchApp"], appId)
          return { data: { launched: appId } }
        }
        case "stop":
        case "stopapp": {
          await runner.runCommands(["stopApp"], appId)
          return { data: { stopped: appId } }
        }
        default:
          throw new Error(`unknown mobile action: "${step.action}"`)
      }
    }

    if (step.flow) {
      const flow = join(this.flowsDir, step.flow)
      if (!existsSync(flow)) throw new Error(`flow not found: ${flow}`)

      const vars: Record<string, string> = { APP_ID: this.target.appId }
      for (const [key, value] of Object.entries(step.params ?? {})) vars[key] = stringify(value)
      await runner.runFlow(flow, vars)
      return { data: {} }
    }

    if (!step.launch) {
      throw new Error('mobile step needs "action" (e.g. tap, type, press), "flow", or "launch"')
    }

    return { data: {} }
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!failed) return
    // Binary PNG output, so not through runAdb.
    const shot = spawnSync(this.adb, ["-s", this.device, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 })
    if (shot.status === 0) writeFileSync(join(artifactsDir, "mobile-failure.png"), shot.stdout)
  }
}
