import type { BadgeVariant } from "../../components/Badge.tsx"
import type { ConfigMeta, ScenarioStep, StepAction } from "../../types.ts"
import { HTTP_ACTION_OPTIONS, MOBILE_ACTION_OPTIONS, SHELL_ACTION_OPTIONS, WEB_ACTION_OPTIONS } from "./constants.tsx"

export type StepDriver = "http" | "web" | "mobile" | "shell"

export const capitalize = (str: string) => (str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "")

/** The driver a step target runs on: its configured driver, else a guess from the target's name. */
export function getTargetDriver(target: string, config?: ConfigMeta): StepDriver {
  if (target === "shell") return "shell"
  const targetObj = config?.targets?.[target]
  if (targetObj) return targetObj.driver
  if (target.includes("web") || target.includes("browser")) return "web"
  if (target.includes("mobile") || target.includes("app")) return "mobile"
  return "http"
}

export function getTargetBadgeVariant(target: string, config?: ConfigMeta): BadgeVariant {
  const driver = getTargetDriver(target, config)
  if (driver === "shell") return "driver-shell"
  if (driver === "http") return "driver-http"
  if (driver === "mobile") return "driver-mobile"
  return "driver-web"
}

export function getActionOptions(driver: string) {
  if (driver === "http") return HTTP_ACTION_OPTIONS
  if (driver === "shell") return SHELL_ACTION_OPTIONS
  if (driver === "mobile") return MOBILE_ACTION_OPTIONS
  return WEB_ACTION_OPTIONS
}

/** Gives every step at least one action, derived from its legacy top-level fields, so the action editor always shows. */
export function withDefaultActions(steps: ScenarioStep[], config?: ConfigMeta): ScenarioStep[] {
  return steps.map((st, i) => {
    if (!st.actions || st.actions.length === 0) {
      const driver = getTargetDriver(st.target, config)
      let defaultAct: StepAction
      if (driver === "http") {
        const method = (st.method ?? "GET").toLowerCase()
        defaultAct = {
          id: `act_${Date.now()}_${i}`,
          action: `http_${method}`,
          method: st.method ?? "GET",
          url: st.url ?? "/api",
          status: st.assert?.status ?? 200,
        }
      } else if (driver === "shell") {
        defaultAct = {
          id: `act_${Date.now()}_${i}`,
          action: "shell",
          command: st.command ?? "echo 'Step execution'",
          exit_code: st.assert?.exit_code ?? 0,
        }
      } else if (driver === "mobile") {
        defaultAct = {
          id: `act_${Date.now()}_${i}`,
          action: "tap",
          selector: "Button",
        }
      } else {
        defaultAct = {
          id: `act_${Date.now()}_${i}`,
          action: "navigate",
          url: st.url ?? "/",
        }
      }
      return { ...st, actions: [defaultAct] }
    }
    return st
  })
}

/** A new action of the given type with its type-specific defaults. */
export function newStepAction(actType: string): StepAction {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action: actType,
    url: actType === "navigate" || actType.startsWith("http_") ? "/" : undefined,
    command: actType === "shell" ? "echo 'Step execution'" : undefined,
    selector: actType === "tap" ? "Button" : undefined,
    width: actType === "set_viewport" ? 1280 : undefined,
    height: actType === "set_viewport" ? 720 : undefined,
    ms: actType === "wait_for" || actType === "wait" ? 1000 : undefined,
  }
}

/** The action type a new action defaults to on each driver. */
export function defaultActionType(driver: StepDriver): string {
  if (driver === "http") return "http_get"
  if (driver === "shell") return "shell"
  if (driver === "mobile") return "tap"
  return "navigate"
}

/** A new step for the chosen driver, aimed at the given target, with one starter action. */
export function newStep(driverType: StepDriver, target: string): ScenarioStep {
  const step: ScenarioStep = {
    id: `step_${Date.now()}`,
    name: `New ${capitalize(driverType)} Step`,
    target,
  }

  if (driverType === "web") {
    step.actions = [
      {
        id: `act_${Date.now()}_1`,
        action: "navigate",
        url: "/",
      },
    ]
  } else if (driverType === "mobile") {
    step.actions = [
      {
        id: `act_${Date.now()}_1`,
        action: "tap",
        selector: "Button",
      },
    ]
  } else if (driverType === "http") {
    step.actions = [
      {
        id: `act_${Date.now()}_1`,
        action: "http_get",
        url: "/api/status",
        status: 200,
      },
    ]
  } else if (driverType === "shell") {
    step.actions = [
      {
        id: `act_${Date.now()}_1`,
        action: "shell",
        command: "echo 'Step execution'",
        exit_code: 0,
      },
    ]
  }
  return step
}
