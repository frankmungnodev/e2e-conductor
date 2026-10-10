import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { prefixError } from "../assertions.ts"
import type { MobileTarget } from "../config.ts"
import { restoreKeyboards } from "../preflight.ts"
import { runAdb, sleep } from "../process.ts"
import { AdbFlowRunner } from "./adb-flow.ts"
import type { Driver, StepResult, StepRun } from "./types.ts"

export class MobileDriver implements Driver {
  constructor(
    private readonly target: MobileTarget,
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
        throw prefixError(`Step action #${i + 1} (${actionItem.action}) failed: `, err)
      }
    }
    return { data: combinedData }
  }

  private async executeAction(
    runner: AdbFlowRunner,
    step: { action?: string; selector?: string; value?: unknown; key?: string; ms?: number; timeout_ms?: number },
    appId: string,
    log: (msg: string) => void,
  ): Promise<Record<string, unknown>> {
    const action = (step.action ?? "").toLowerCase()
    log(`mobile action: ${action}`)
    const selectorOrValue = step.selector ?? (typeof step.value === "string" ? step.value : undefined)
    const requireTarget = (name: string): MobileSelector => {
      if (!selectorOrValue) throw new Error(`mobile '${name}' action requires a selector or value`)
      return parseSelector(selectorOrValue)
    }
    const timeout = step.timeout_ms

    switch (action) {
      case "tap":
      case "tapon":
      case "click": {
        const target = requireTarget("tap")
        await runner.runCommands([{ tapOn: target }], appId)
        return { tapped: target }
      }
      case "type":
      case "input":
      case "inputtext":
      case "fill": {
        const text = String(step.value ?? "")
        if (step.selector) {
          await runner.runCommands([{ tapOn: parseSelector(step.selector) }, { inputText: text }], appId)
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
        const target = requireTarget("assert_visible")
        await runner.runCommands([{ assertVisible: { ...target, timeout } }], appId)
        return { visible: target }
      }
      case "assert_not_visible":
      case "assertnotvisible": {
        const target = requireTarget("assert_not_visible")
        await runner.runCommands([{ assertNotVisible: { ...target, timeout } }], appId)
        return { notVisible: target }
      }
      case "wait":
      case "wait_for": {
        if (step.selector) {
          await runner.runCommands([{ extendedWaitUntil: { visible: parseSelector(step.selector), timeout } }], appId)
        }
        if (step.ms) {
          log(`wait ${step.ms}ms`)
          await sleep(step.ms)
        }
        return { waited: true }
      }
      case "scroll_to": {
        const target = requireTarget("scroll_to")
        const direction = (step.key ?? "DOWN").toUpperCase()
        await runner.runCommands([{ scrollUntilVisible: { element: target, direction, timeout } }], appId)
        return { scrolledTo: selectorOrValue }
      }
      case "swipe": {
        const from = selectorOrValue && parseSelector(selectorOrValue)
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

  async captureScreen(path: string) {
    // Binary PNG output, so not through runAdb.
    const shot = spawnSync(this.adb, ["-s", this.device, "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 })
    if (shot.status !== 0) throw new Error(`adb screencap failed (exit ${shot.status ?? "signal"})`)
    writeFileSync(path, shot.stdout)
  }

  async endScenario(failed: boolean, artifactsDir: string) {
    if (!failed) return
    await this.captureScreen(join(artifactsDir, "mobile-failure.png")).catch(() => {})
  }
}

type MobileSelector = { text: string } | { id: string }

/**
 * A mobile action's selector: `id=<resource id>` matches an element's resource id (a Compose
 * `testTag` exposed as one), `text=<pattern>` or any other string matches its text or content
 * description as a full regex.
 */
export function parseSelector(selector: string): MobileSelector {
  if (selector.startsWith("id=")) return { id: selector.slice(3) }
  if (selector.startsWith("text=")) return { text: selector.slice(5) }
  return { text: selector }
}
