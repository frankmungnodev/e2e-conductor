import { Loader2 } from "lucide-react"
import type React from "react"
import { forwardRef } from "react"

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline"
export type ButtonSize = "xs" | "sm" | "md" | "lg"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "secondary",
      size = "sm",
      isLoading = false,
      icon,
      iconRight,
      className = "",
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus disabled:opacity-50 disabled:pointer-events-none cursor-pointer rounded"

    const sizeStyles: Record<ButtonSize, string> = {
      xs: "text-[11px] px-2 py-0.5 gap-1.5 h-6",
      sm: "text-xs px-2.5 py-1 gap-1.5 h-7",
      md: "text-xs px-3.5 py-1.5 gap-2 h-8",
      lg: "text-sm px-4 py-2 gap-2.5 h-9",
    }

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        "bg-primary text-white hover:bg-primary-hover active:bg-primary-active border border-transparent shadow-xs",
      secondary:
        "bg-input text-fg hover:bg-hover hover:text-fg-bright border border-border-light active:bg-active",
      danger:
        "bg-error-bg text-error border border-error-border hover:bg-error hover:text-white active:brightness-90",
      ghost:
        "bg-transparent text-fg hover:bg-hover hover:text-fg-bright border border-transparent",
      outline:
        "bg-transparent text-fg hover:bg-hover hover:text-fg-bright border border-border-light hover:border-border-focus",
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          icon && <span className="inline-flex shrink-0">{icon}</span>
        )}
        {children}
        {!isLoading && iconRight && <span className="inline-flex shrink-0">{iconRight}</span>}
      </button>
    )
  },
)

Button.displayName = "Button"
