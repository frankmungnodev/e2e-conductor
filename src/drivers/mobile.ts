import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MobileTarget } from "../config.ts"
import { restoreKeyboards } from "../preflight.ts"
import { runAdb } from "../process.ts"
import { AdbFlowRunner } from "./adb-flow.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

export class MobileDriver implements Driver {
  constructor(
    private readonly target: MobileTarget,
    _flowsDir: string,
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

    if (!step.actions || step.actions.length === 0) {
      if (step.launch) return { data: { launched: appId } }
      throw new Error('mobile step requires an "actions" list or "launch"')
    }

    log(`running mobile step "${step.name}" with ${step.actions.length} action(s)`)
    const combinedData: Record<string, unknown> = {}
    for (let i = 0; i < step.actions.length; i++) {
      const actionItem = step.actions[i]
      const label = actionItem.name ? `"${actionItem.name}" (${actionItem.action})` : `action #${i + 1} (${actionItem.action})`
      log(`executing action ${label}`)
      try {
        const res = await this.executeAction(runner, actionItem, appId, log)
        Object.assign(combinedData, res)
      } catch (err) {
        throw new Error(`Step action #${i + 1} (${actionItem.action}) failed: ${(err as Error).message}`)
      }
    }
    return { data: combinedData }
  }

  private async executeAction(
    runner: AdbFlowRunner,
    step: { action?: string; selector?: string; value?: unknown; key?: string; ms?: number },
    appId: string,
    log: (msg: string) => void,
  ): Promise<Record<string, unknown>> {
    const action = (step.action ?? "").toLowerCase()
    log(`mobile action: ${action}`)

    switch (action) {
      case "tap":
      case "tapon":
      case "click": {
        const target = step.selector ?? (typeof step.value === "string" ? step.value : undefined)
        if (!target) throw new Error("mobile 'tap' action requires a selector or value")
        await runner.runCommands([{ tapOn: target }], appId)
        return { tapped: target }
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
        return { typed: text }
      }
      case "erase":
      case "erasetext":
      case "clear": {
        const characters = step.ms ?? 50
        await runner.runCommands([{ eraseText: { characters } }], appId)
        return { erased: characters }
      }
      case "press":
      case "presskey": {
        const key = (step.key ?? (typeof step.value === "string" ? step.value : undefined) ?? "BACK") as string
        await runner.runCommands([{ pressKey: key }], appId)
        return { pressed: key }
      }
      case "back": {
        await runner.runCommands(["back"], appId)
        return { back: true }
      }
      case "hidekeyboard": {
        await runner.runCommands(["hideKeyboard"], appId)
        return { keyboardHidden: true }
      }
      case "assert_visible":
      case "assertvisible": {
        const target = step.selector ?? (typeof step.value === "string" ? step.value : undefined)
        if (!target) throw new Error("mobile 'assert_visible' action requires a selector or value")
        await runner.runCommands([{ assertVisible: target }], appId)
        return { visible: target }
      }
      case "assert_not_visible":
      case "assertnotvisible": {
        const target = step.selector ?? (typeof step.value === "string" ? step.value : undefined)
        if (!target) throw new Error("mobile 'assert_not_visible' action requires a selector or value")
        await runner.runCommands([{ assertNotVisible: target }], appId)
        return { notVisible: target }
      }
      case "wait":
      case "wait_for": {
        if (step.selector) {
          await runner.runCommands([{ assertVisible: step.selector }], appId)
        }
        if (step.ms) {
          await runner.runCommands([{ waitForAnimationToEnd: step.ms }], appId)
        }
        return { waited: true }
      }
      case "swipe": {
        const from = step.selector ?? (typeof step.value === "string" ? step.value : undefined)
        const direction = (step.key ?? "RIGHT").toUpperCase()
        await runner.runCommands([{ swipe: { from, direction } }], appId)
        return { swiped: direction }
      }
      case "launch":
      case "launchapp": {
        await runner.runCommands(["launchApp"], appId)
        return { launched: appId }
      }
      case "stop":
      case "stopapp": {
        await runner.runCommands(["stopApp"], appId)
        return { stopped: appId }
      }
      default:
        throw new Error(`unknown mobile action: "${step.action}"`)
    }
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!failed) return
    // Binary PNG output, so not through runAdb.
    const shot = spawnSync(this.adb, ["-s", this.device, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 })
    if (shot.status === 0) writeFileSync(join(artifactsDir, "mobile-failure.png"), shot.stdout)
  }
}
