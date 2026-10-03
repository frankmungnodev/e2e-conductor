import type { ConfigMeta } from "./types.ts"

export type StepDriver = "http" | "web" | "mobile" | "shell"

/** The driver a step target runs on: its configured driver, else a guess from the target's name. */
export function getTargetDriver(target: string, config?: ConfigMeta): StepDriver {
  if (target === "shell") return "shell"
  const targetObj = config?.targets?.[target]
  if (targetObj) return targetObj.driver
  if (target.includes("web") || target.includes("browser")) return "web"
  if (target.includes("mobile") || target.includes("app")) return "mobile"
  return "http"
}

/** The `Badge` variant for a target's driver. */
export function getTargetBadgeVariant(target: string, config?: ConfigMeta): `driver-${StepDriver}` {
  return `driver-${getTargetDriver(target, config)}`
}
