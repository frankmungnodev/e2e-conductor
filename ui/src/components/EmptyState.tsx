import type React from "react"

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  bordered?: boolean
  size?: "sm" | "md" | "lg"
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  bordered = false,
  size = "md",
}: EmptyStateProps) {
  const iconBoxSize =
    size === "sm"
      ? "w-9 h-9 rounded-xs mb-2.5"
      : size === "lg"
        ? "w-14 h-14 rounded-md mb-4 shadow-xs"
        : "w-11 h-11 rounded-xs mb-3 shadow-xs"

  const titleSize =
    size === "lg"
      ? "text-sm font-semibold text-fg-bright"
      : "text-xs font-semibold text-fg-bright"

  const maxDescWidth =
    size === "lg" ? "max-w-md mt-1.5" : size === "sm" ? "max-w-xs mt-1" : "max-w-sm mt-1"

  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 ${
        bordered
          ? "border border-dashed border-border rounded-sm bg-editor/40"
          : ""
      } ${className}`}
    >
      {icon && (
        <div
          className={`${iconBoxSize} bg-input border border-border-light flex items-center justify-center text-fg-muted shrink-0`}
        >
          {icon}
        </div>
      )}
      <h3 className={titleSize}>{title}</h3>
      {description && (
        <p className={`text-xs text-fg-muted leading-relaxed ${maxDescWidth}`}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
