import type { BadgeVariant } from "../../components/Badge.tsx"

export function getTargetBadgeVariant(target: string): BadgeVariant {
  if (target === "shell") return "driver-shell"
  if (target.includes("api") || target.includes("http")) return "driver-http"
  if (target.includes("mobile") || target.includes("app")) return "driver-mobile"
  return "driver-web"
}
