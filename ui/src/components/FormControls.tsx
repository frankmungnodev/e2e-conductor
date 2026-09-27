import type React from "react"
import { forwardRef } from "react"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
  mono?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, mono = false, className = "", id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-fg-bright">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <span className="absolute left-2.5 text-fg-muted pointer-events-none shrink-0">
              {icon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-input text-fg border rounded-xs px-3 py-2 text-xs md:text-sm transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:bg-editor placeholder:text-fg-muted ${
              error ? "border-error focus:border-error focus:ring-error" : "border-border-light"
            } ${icon ? "pl-8" : ""} ${mono ? "font-mono" : ""} ${className}`}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-error font-medium">{error}</span>}
        {helperText && !error && <span className="text-xs text-fg-muted leading-normal">{helperText}</span>}
      </div>
    )
  },
)

Input.displayName = "Input"

export interface FormFieldProps {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}

export function FormField({ label, hint, required, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs font-semibold text-fg-bright">
          {label} {required && <span className="text-error font-normal">*</span>}
        </label>
        {hint && <span className="text-xs text-fg-muted font-sans leading-normal">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
