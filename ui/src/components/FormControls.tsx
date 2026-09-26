import type React from "react"
import { forwardRef } from "react"

export * from "./Checkbox.tsx"
export * from "./NumberInput.tsx"
export * from "./Select.tsx"

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
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label htmlFor={inputId} className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">
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
            className={`w-full bg-input text-fg border rounded-xs px-2.5 py-1.5 text-xs transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:bg-editor placeholder:text-fg-muted ${
              error ? "border-error focus:border-error focus:ring-error" : "border-border-light"
            } ${icon ? "pl-8" : ""} ${mono ? "font-mono" : ""} ${className}`}
            {...props}
          />
        </div>
        {error && <span className="text-[11px] text-error font-medium">{error}</span>}
        {helperText && !error && <span className="text-[11px] text-fg-muted">{helperText}</span>}
      </div>
    )
  },
)

Input.displayName = "Input"

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  mono?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, helperText, mono = false, className = "", id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)

    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label htmlFor={inputId} className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          className={`w-full bg-input text-fg border rounded-xs px-2.5 py-1.5 text-xs transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:bg-editor placeholder:text-fg-muted ${
            error ? "border-error focus:border-error focus:ring-error" : "border-border-light"
          } ${mono ? "font-mono" : ""} ${className}`}
          {...props}
        />
        {error && <span className="text-[11px] text-error font-medium">{error}</span>}
        {helperText && !error && <span className="text-[11px] text-fg-muted">{helperText}</span>}
      </div>
    )
  },
)

TextArea.displayName = "TextArea"
