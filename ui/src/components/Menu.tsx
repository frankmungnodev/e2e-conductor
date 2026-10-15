import { MoreHorizontal } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  /** Error styling, for actions that delete. */
  danger?: boolean
  disabled?: boolean
}

export interface MenuProps {
  /** The trigger's accessible name, e.g. `More actions for Login`. */
  label: string
  items: MenuItem[]
  className?: string
}

/**
 * A ⋯ button that opens a short list of actions. It closes on Escape, on a click outside and after a
 * selection. Up and Down move between items; Escape returns focus to the trigger.
 */
export function Menu({ label, items, className = "" }: MenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) itemRefs.current.find((item) => item && !item.disabled)?.focus()
  }, [isOpen])

  const close = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const moveFocus = (step: number) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled))
    if (enabled.length === 0) return
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    enabled[(current + step + enabled.length) % enabled.length].focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      e.preventDefault()
      close()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (isOpen) moveFocus(1)
      else setIsOpen(true)
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault()
      moveFocus(-1)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${isOpen ? "z-30" : ""} ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((open) => !open)
        }}
        className="inline-flex items-center justify-center h-6 w-6 rounded text-fg-muted hover:text-fg-bright hover:bg-hover transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-full mt-1 right-0 min-w-36 w-max z-50 bg-sidebar border border-border-light rounded-xs shadow-2xl shadow-black/80 py-1 select-none"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
                item.onSelect()
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer transition-colors focus:outline-none disabled:opacity-40 disabled:pointer-events-none ${
                item.danger
                  ? "text-error hover:bg-error-bg focus:bg-error-bg"
                  : "text-fg hover:bg-hover hover:text-fg-bright focus:bg-hover focus:text-fg-bright"
              }`}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
