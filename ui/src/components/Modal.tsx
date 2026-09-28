import { X } from "lucide-react"
import type React from "react"
import { useEffect } from "react"

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full"
  dismissable?: boolean
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "lg",
  dismissable = true,
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && dismissable) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, dismissable])

  if (!isOpen) return null

  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    full: "max-w-4xl",
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      {/* Backdrop */}
      <div
        className="fixed inset-0 -z-10"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        className={`w-full ${maxWidthStyles[maxWidth]} bg-sidebar border border-border-light rounded-sm shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-titlebar flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-xs font-semibold text-fg-bright">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-fg-muted mt-0.5">{description}</p>
            )}
          </div>
          {dismissable && (
            <button
              onClick={onClose}
              className="p-1 rounded-xs text-fg-muted hover:text-fg-bright hover:bg-hover transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[75vh] text-xs text-fg bg-editor/50">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-4 py-2.5 border-t border-border bg-titlebar flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
