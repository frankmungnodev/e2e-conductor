import type React from "react"
import { forwardRef } from "react"

export type InputSize = "xs" | "sm" | "md"

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
  mono?: boolean
  size?: InputSize
}

const inputSizeConfig: Record<
  InputSize,
  {
    input: string
    iconContainer: string
    iconPadding: string
  }
> = {
  xs: {
    input: "h-6 px-2 text-xs",
    iconContainer: "left-2",
    iconPadding: "pl-7",
  },
  sm: {
    input: "h-7 px-2.5 text-xs",
    iconContainer: "left-2.5",
    iconPadding: "pl-8",
  },
  md: {
    input: "h-8 px-3 text-xs md:text-sm",
    iconContainer: "left-3",
    iconPadding: "pl-9",
  },
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      mono = false,
      size = "sm",
      className = "",
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)
    const currentSize = inputSizeConfig[size]

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-fg-bright">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <span
              className={`absolute ${currentSize.iconContainer} text-fg-muted pointer-events-none shrink-0 flex items-center justify-center`}
            >
              {icon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-input text-fg border rounded-xs transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:bg-editor placeholder:text-fg-muted ${
              currentSize.input
            } ${
              error ? "border-error focus:border-error focus:ring-error" : "border-border-light"
            } ${icon ? currentSize.iconPadding : ""} ${mono ? "font-mono" : ""} ${className}`}
            {...props}
          />
        </div>
        {error && <span className="text-xs text-error font-medium">{error}</span>}
        {helperText && !error && (
          <span className="text-xs text-fg-muted leading-normal">{helperText}</span>
        )}
      </div>
    )
  },
)

Input.displayName = "Input"

export type TextareaSize = "xs" | "sm" | "md"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  mono?: boolean
  size?: TextareaSize
}

const textareaSizeConfig: Record<TextareaSize, string> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3 py-2 text-xs md:text-sm",
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      mono = false,
      size = "sm",
      className = "",
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-fg-bright">
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          className={`w-full bg-input text-fg border rounded-xs transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:bg-editor placeholder:text-fg-muted ${
            textareaSizeConfig[size]
          } ${
            error ? "border-error focus:border-error focus:ring-error" : "border-border-light"
          } ${mono ? "font-mono" : ""} ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-error font-medium">{error}</span>}
        {helperText && !error && (
          <span className="text-xs text-fg-muted leading-normal">{helperText}</span>
        )}
      </div>
    )
  },
)

Textarea.displayName = "Textarea"

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
