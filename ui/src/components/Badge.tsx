import type React from "react"

export type BadgeVariant =
  | "primary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral"
  | "driver-http"
  | "driver-web"
  | "driver-mobile"
  | "driver-shell"

export type BadgeSize = "xs" | "sm" | "md"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  pulse?: boolean
  icon?: React.ReactNode
}

export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  dot = false,
  pulse = false,
  icon,
  className = "",
  ...props
}: BadgeProps) {
  const baseStyles = "inline-flex items-center font-medium border select-none rounded capitalize"

  const sizeStyles: Record<BadgeSize, string> = {
    xs: "text-xs px-1.5 py-0.5 gap-1 leading-none",
    sm: "text-xs px-2 py-0.5 gap-1.5 leading-tight",
    md: "text-xs px-2.5 py-1 gap-1.5 leading-normal",
  }

  const variantStyles: Record<BadgeVariant, string> = {
    primary: "bg-info-bg text-info border-info-border",
    success: "bg-success-bg text-success border-success-border",
    danger: "bg-error-bg text-error border-error-border",
    warning: "bg-warning-bg text-warning border-warning-border",
    info: "bg-info-bg text-info border-info-border",
    neutral: "bg-sidebar text-fg-muted border-border",
    "driver-http": "bg-[#162a3f] text-[#9cdcfe] border-[#244970]",
    "driver-web": "bg-[#132c28] text-[#4ec9b0] border-[#1c4d44]",
    "driver-mobile": "bg-[#1e2d1a] text-[#89d185] border-[#2d4926]",
    "driver-shell": "bg-[#2d2814] text-[#dcdcaa] border-[#4a401c]",
  }

  const dotColors: Record<BadgeVariant, string> = {
    primary: "bg-info",
    success: "bg-success",
    danger: "bg-error",
    warning: "bg-warning",
    info: "bg-info",
    neutral: "bg-fg-muted",
    "driver-http": "bg-[#9cdcfe]",
    "driver-web": "bg-[#4ec9b0]",
    "driver-mobile": "bg-[#89d185]",
    "driver-shell": "bg-[#dcdcaa]",
  }

  return (
    <span
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} ${pulse ? "animate-pulse" : ""}`}
        />
      )}
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
