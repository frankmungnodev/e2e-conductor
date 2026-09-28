import type React from "react"

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "editor" | "sidebar" | "subtle"
  bordered?: boolean
}

export function Panel({
  children,
  variant = "sidebar",
  bordered = true,
  className = "",
  ...props
}: PanelProps) {
  const bgStyles = {
    editor: "bg-editor",
    sidebar: "bg-sidebar",
    subtle: "bg-activity",
  }

  return (
    <div
      className={`${bgStyles[variant]} ${bordered ? "border border-border" : ""} rounded-sm overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export interface PanelHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
}

export function PanelHeader({
  title,
  description,
  icon,
  actions,
  children,
  className = "",
  ...props
}: PanelHeaderProps) {
  return (
    <div
      className={`px-3 py-2 border-b border-border bg-titlebar/50 flex items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children || (
        <>
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-fg-muted shrink-0">{icon}</span>}
            <div className="truncate">
              {title && (
                <div className="text-xs font-semibold text-fg-bright">
                  {title}
                </div>
              )}
              {description && (
                <div className="text-xs text-fg-muted truncate">{description}</div>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </>
      )}
    </div>
  )
}

export interface PanelBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean
}

export function PanelBody({
  children,
  noPadding = false,
  className = "",
  ...props
}: PanelBodyProps) {
  return (
    <div className={`${noPadding ? "" : "p-3"} ${className}`} {...props}>
      {children}
    </div>
  )
}

