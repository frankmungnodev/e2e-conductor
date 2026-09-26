import type React from "react"
import { forwardRef, useId, useRef } from "react"
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react"

export interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "size" | "onChange" | "value" | "defaultValue" | "prefix"
  > {
  value?: number | ""
  defaultValue?: number
  onChange?: (value: number | undefined) => void
  label?: string
  error?: string
  helperText?: string
  min?: number
  max?: number
  step?: number
  prefix?: React.ReactNode
  suffix?: string
  size?: "xs" | "sm" | "md"
  controls?: "stepper" | "buttons" | "none"
  mono?: boolean
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      label,
      error,
      helperText,
      min,
      max,
      step = 1,
      prefix,
      suffix,
      size = "sm",
      controls = "stepper",
      mono = false,
      disabled = false,
      className = "",
      id,
      placeholder,
      onKeyDown,
      ...props
    },
    forwardedRef,
  ) => {
    const generatedId = useId()
    const inputId = id || generatedId
    const localRef = useRef<HTMLInputElement>(null)

    const currentValue = value !== undefined ? (value === "" ? undefined : Number(value)) : undefined

    const clamp = (val: number): number => {
      let res = val
      if (min !== undefined && res < min) res = min
      if (max !== undefined && res > max) res = max
      return res
    }

    const stepValue = (direction: 1 | -1) => {
      if (disabled) return
      let next: number
      if (currentValue === undefined || Number.isNaN(currentValue)) {
        next = direction === 1 ? (min !== undefined ? min : step) : (max !== undefined ? max : -step)
      } else {
        next = currentValue + direction * step
      }
      const clamped = clamp(next)
      onChange?.(clamped)
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.trim()
      if (val === "" || val === "-") {
        onChange?.(undefined)
        return
      }
      const parsed = Number(val)
      if (!Number.isNaN(parsed)) {
        onChange?.(parsed)
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault()
        stepValue(1)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        stepValue(-1)
      }
      onKeyDown?.(e)
    }

    // Size variants
    const sizeConfig = {
      xs: {
        container: "h-6 text-xs",
        input: "py-0.5 px-2 text-xs",
        stepperBtn: "h-3 w-4",
        stepperIcon: "w-2.5 h-2.5",
        sideBtn: "w-6 h-6",
        sideIcon: "w-3 h-3",
      },
      sm: {
        container: "h-7 text-xs",
        input: "py-1 px-2.5 text-xs",
        stepperBtn: "h-3.5 w-4",
        stepperIcon: "w-2.5 h-2.5",
        sideBtn: "w-7 h-7",
        sideIcon: "w-3.5 h-3.5",
      },
      md: {
        container: "h-8 text-sm",
        input: "py-1.5 px-3 text-sm",
        stepperBtn: "h-4 w-5",
        stepperIcon: "w-3 h-3",
        sideBtn: "w-8 h-8",
        sideIcon: "w-4 h-4",
      },
    }[size]

    return (
      <div className={`flex flex-col gap-1 w-full ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">
            {label}
          </label>
        )}

        <div
          className={`relative flex items-center bg-input border rounded-xs transition-colors group ${
            error
              ? "border-error focus-within:border-error focus-within:ring-1 focus-within:ring-error"
              : "border-border-light focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus"
          } ${disabled ? "opacity-50 pointer-events-none bg-editor" : ""}`}
        >
          {controls === "buttons" && (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || (min !== undefined && currentValue !== undefined && currentValue <= min)}
              onClick={() => stepValue(-1)}
              className={`flex items-center justify-center shrink-0 border-r border-border text-fg-muted hover:text-fg hover:bg-hover transition-colors ${sizeConfig.sideBtn} disabled:opacity-30 disabled:pointer-events-none`}
              aria-label="Decrement"
            >
              <Minus className={sizeConfig.sideIcon} />
            </button>
          )}

          {prefix && <div className="pl-2 text-fg-muted shrink-0 select-none">{prefix}</div>}

          <input
            {...props}
            id={inputId}
            ref={(node) => {
              localRef.current = node
              if (typeof forwardedRef === "function") {
                forwardedRef(node)
              } else if (forwardedRef) {
                forwardedRef.current = node
              }
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value !== undefined ? (value === "" ? "" : String(value)) : undefined}
            defaultValue={defaultValue !== undefined ? String(defaultValue) : undefined}
            placeholder={placeholder}
            disabled={disabled}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className={`w-full bg-transparent text-fg placeholder:text-fg-muted focus:outline-none min-w-0 ${
              sizeConfig.input
            } ${mono ? "font-mono" : ""}`}
          />

          {suffix && (
            <span className="pr-2 text-[11px] text-fg-muted font-medium select-none shrink-0">{suffix}</span>
          )}

          {controls === "stepper" && (
            <div className="flex flex-col border-l border-border shrink-0 select-none">
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || (max !== undefined && currentValue !== undefined && currentValue >= max)}
                onClick={() => stepValue(1)}
                className={`flex items-center justify-center text-fg-muted hover:text-fg-bright hover:bg-hover transition-colors ${sizeConfig.stepperBtn} disabled:opacity-30 disabled:pointer-events-none`}
                aria-label="Increment"
              >
                <ChevronUp className={sizeConfig.stepperIcon} />
              </button>
              <div className="h-px bg-border w-full" />
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || (min !== undefined && currentValue !== undefined && currentValue <= min)}
                onClick={() => stepValue(-1)}
                className={`flex items-center justify-center text-fg-muted hover:text-fg-bright hover:bg-hover transition-colors ${sizeConfig.stepperBtn} disabled:opacity-30 disabled:pointer-events-none`}
                aria-label="Decrement"
              >
                <ChevronDown className={sizeConfig.stepperIcon} />
              </button>
            </div>
          )}

          {controls === "buttons" && (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || (max !== undefined && currentValue !== undefined && currentValue >= max)}
              onClick={() => stepValue(1)}
              className={`flex items-center justify-center shrink-0 border-l border-border text-fg-muted hover:text-fg hover:bg-hover transition-colors ${sizeConfig.sideBtn} disabled:opacity-30 disabled:pointer-events-none`}
              aria-label="Increment"
            >
              <Plus className={sizeConfig.sideIcon} />
            </button>
          )}
        </div>

        {error && <span className="text-[11px] text-error font-medium">{error}</span>}
        {helperText && !error && <span className="text-[11px] text-fg-muted">{helperText}</span>}
      </div>
    )
  },
)

NumberInput.displayName = "NumberInput"
