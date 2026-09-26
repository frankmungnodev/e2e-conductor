import type React from "react"

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-sm bg-editor/40 ${className}`}
    >
      {icon && (
        <div className="w-10 h-10 rounded-sm bg-input border border-border-light flex items-center justify-center text-fg-muted mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-xs font-semibold text-fg-bright uppercase tracking-wide">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-fg-muted max-w-sm mt-1 leading-normal">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
