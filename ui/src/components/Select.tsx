import { Check, ChevronDown } from "lucide-react"
import type React from "react"
import { Children, forwardRef, isValidElement, useEffect, useId, useRef, useState } from "react"

export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  disabled?: boolean
}

export interface SelectProps {
  options?: SelectOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label?: string
  placeholder?: string
  error?: string
  helperText?: string
  size?: "xs" | "sm" | "md"
  disabled?: boolean
  mono?: boolean
  className?: string
  triggerClassName?: string
  menuClassName?: string
  id?: string
  children?: React.ReactNode
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      options: optionsProp,
      value: controlledValue,
      defaultValue,
      onChange,
      label,
      placeholder = "Select...",
      error,
      helperText,
      size = "sm",
      disabled = false,
      mono = false,
      className = "",
      triggerClassName = "",
      menuClassName = "",
      id,
      children,
    },
    forwardedRef,
  ) => {
    const generatedId = useId()
    const selectId = id || generatedId
    const containerRef = useRef<HTMLDivElement>(null)

    // Parse options from props or children (<option value="...">...</option>)
    const options: SelectOption[] = []
    if (optionsProp && optionsProp.length > 0) {
      options.push(...optionsProp)
    } else if (children) {
      // Support native <option> children
      Children.forEach(children, (child) => {
        if (isValidElement(child)) {
          const props = child.props as any
          options.push({
            value: String(props.value ?? ""),
            label: typeof props.children === "string" ? props.children : String(props.value ?? ""),
            disabled: Boolean(props.disabled),
          })
        }
      })
    }

    const isControlled = controlledValue !== undefined
    const [internalValue, setInternalValue] = useState<string>(
      defaultValue ?? (options.length > 0 && !placeholder ? options[0].value : ""),
    )
    const currentValue = isControlled ? controlledValue : internalValue

    const [isOpen, setIsOpen] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const [openUpward, setOpenUpward] = useState(false)

    // Find current option
    const selectedOption = options.find((opt) => opt.value === currentValue)

    // Handle outside clicks
    useEffect(() => {
      if (!isOpen) return
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false)
        }
      }
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [isOpen])

    // Detect if dropdown should flip upwards when space below is tight
    useEffect(() => {
      if (!isOpen || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setOpenUpward(spaceBelow < 220 && spaceAbove > spaceBelow)
    }, [isOpen])

    const handleSelect = (val: string) => {
      if (!isControlled) {
        setInternalValue(val)
      }
      onChange?.(val)
      setIsOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        if (isOpen) {
          if (highlightedIndex >= 0 && highlightedIndex < options.length) {
            const opt = options[highlightedIndex]
            if (!opt.disabled) handleSelect(opt.value)
          } else {
            setIsOpen(false)
          }
        } else {
          setIsOpen(true)
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          setHighlightedIndex(0)
        } else {
          setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0))
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          setHighlightedIndex(options.length - 1)
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1))
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        setIsOpen(false)
      }
    }

    const sizeConfig = {
      xs: {
        trigger: "h-6 px-2 text-xs",
        icon: "w-3 h-3",
        option: "px-2 py-1 text-xs",
      },
      sm: {
        trigger: "h-7 px-2.5 text-xs",
        icon: "w-3.5 h-3.5",
        option: "px-2.5 py-1.5 text-xs",
      },
      md: {
        trigger: "h-8 px-3 text-sm",
        icon: "w-4 h-4",
        option: "px-3 py-2 text-sm",
      },
    }[size]

    const hasCustomWidth = /(?:^|\s)w-\S+/.test(className)

    return (
      <div
        id={selectId}
        ref={(node) => {
          containerRef.current = node
          if (typeof forwardedRef === "function") {
            forwardedRef(node)
          } else if (forwardedRef) {
            forwardedRef.current = node
          }
        }}
        className={`relative flex flex-col gap-1 ${isOpen ? "z-30" : ""} ${hasCustomWidth ? "" : "w-full"} ${className}`}
      >
        {label && (
          <label className="text-xs font-medium text-fg-muted select-none">
            {label}
          </label>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={`w-full flex items-center justify-between gap-1.5 rounded-xs bg-input border transition-colors select-none text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-border-focus focus:border-border-focus ${
            error ? "border-error focus:border-error focus:ring-error" : "border-border-light hover:border-fg-muted/40"
          } ${disabled ? "opacity-50 cursor-not-allowed bg-editor" : ""} ${sizeConfig.trigger} ${
            mono ? "font-mono" : ""
          } ${triggerClassName}`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
            {selectedOption ? (
              <span className="truncate text-fg">{selectedOption.label}</span>
            ) : (
              <span className="truncate text-fg-muted">{placeholder}</span>
            )}
          </div>
          <ChevronDown
            className={`shrink-0 text-fg-muted transition-transform duration-150 ${sizeConfig.icon} ${
              isOpen ? "rotate-180 text-fg" : ""
            }`}
          />
        </button>

        {isOpen && (
          <div
            role="listbox"
            tabIndex={-1}
            className={`absolute ${
              openUpward ? "bottom-full mb-1" : "top-full mt-1"
            } left-0 min-w-full w-max max-w-xs z-50 bg-sidebar border border-border-light rounded-xs shadow-2xl shadow-black/80 py-1 max-h-60 overflow-y-auto select-none ${
              mono ? "font-mono" : ""
            } ${menuClassName}`}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-fg-muted italic">No options available</div>
            ) : (
              options.map((option, idx) => {
                const isSelected = option.value === currentValue
                const isHighlighted = idx === highlightedIndex

                return (
                  <div
                    key={option.value}
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    onClick={() => {
                      if (!option.disabled) {
                        handleSelect(option.value)
                      }
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      sizeConfig.option
                    } ${
                      option.disabled
                        ? "opacity-40 pointer-events-none"
                        : isSelected
                        ? "bg-selection text-white font-medium"
                        : isHighlighted
                        ? "bg-hover text-fg-bright"
                        : "text-fg"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {option.icon && <span className="shrink-0">{option.icon}</span>}
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span
                          className={`text-xs truncate ${
                            isSelected ? "text-white/80" : "text-fg-muted"
                          }`}
                        >
                          {option.description}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5] text-white" />
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {error && <span className="text-xs text-error font-medium">{error}</span>}
        {helperText && !error && <span className="text-xs text-fg-muted">{helperText}</span>}
      </div>
    )
  },
)

Select.displayName = "Select"
