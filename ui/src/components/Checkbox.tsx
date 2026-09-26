import { Check, Minus } from "lucide-react"
import type React from "react"
import { forwardRef, useEffect, useId, useRef, useState } from "react"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: React.ReactNode
  description?: React.ReactNode
  error?: string
  size?: "sm" | "md"
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      error,
      size = "sm",
      indeterminate = false,
      checked: controlledChecked,
      defaultChecked = false,
      disabled = false,
      onChange,
      onCheckedChange,
      className = "",
      id,
      ...props
    },
    forwardedRef,
  ) => {
    const generatedId = useId()
    const inputId = id || generatedId
    const isControlled = controlledChecked !== undefined
    const [internalChecked, setInternalChecked] = useState(defaultChecked)
    const isChecked = isControlled ? Boolean(controlledChecked) : internalChecked

    const localRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      const inputEl = localRef.current
      if (inputEl) {
        inputEl.indeterminate = Boolean(indeterminate)
      }
    }, [indeterminate])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return
      if (!isControlled) {
        setInternalChecked(e.target.checked)
      }
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    const boxSizeClass = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
    const iconSizeClass = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"

    return (
      <div className={`flex flex-col gap-0.5 ${className}`}>
        <label
          htmlFor={inputId}
          className={`inline-flex items-start gap-2 select-none group ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          {/* Hidden native input for 100% accessible keyboard navigation and form binding */}
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
            type="checkbox"
            checked={isChecked}
            disabled={disabled}
            onChange={handleChange}
            className="sr-only peer"
          />

          {/* Custom Styled Checkbox Surface */}
          <div
            className={`mt-0.5 shrink-0 rounded-xs flex items-center justify-center transition-all border ${boxSizeClass} ${
              isChecked || indeterminate
                ? "bg-primary border-primary text-white"
                : "bg-input border-border-light text-transparent group-hover:border-fg-muted/60"
            } peer-focus-visible:ring-1 peer-focus-visible:ring-border-focus peer-focus-visible:border-border-focus ${
              error ? "border-error" : ""
            }`}
            aria-hidden="true"
          >
            {indeterminate ? (
              <Minus className={`${iconSizeClass} stroke-[3]`} />
            ) : isChecked ? (
              <Check className={`${iconSizeClass} stroke-[3]`} />
            ) : null}
          </div>

          {(label || description) && (
            <div className="flex flex-col leading-tight">
              {label && (
                <span
                  className={`text-xs font-medium text-fg ${
                    disabled ? "" : "group-hover:text-fg-bright"
                  }`}
                >
                  {label}
                </span>
              )}
              {description && (
                <span className="text-[11px] text-fg-muted mt-0.5">
                  {description}
                </span>
              )}
            </div>
          )}
        </label>
        {error && <span className="text-[11px] text-error font-medium">{error}</span>}
      </div>
    )
  },
)

Checkbox.displayName = "Checkbox"
