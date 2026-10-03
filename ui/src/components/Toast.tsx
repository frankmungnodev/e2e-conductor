import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import type React from "react"
import { createContext, useCallback, useContext, useState } from "react"

export type ToastType = "info" | "success" | "warning" | "error"

export interface ToastMessage {
  id: string
  type: ToastType
  title?: string
  message: string
  duration?: number
}

interface ToastContextType {
  toast: (options: Omit<ToastMessage, "id">) => void
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
  warning: (message: string, title?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).substring(2, 9)
      const newToast: ToastMessage = { id, type, title, message, duration }

      setToasts((prev) => [...prev, newToast])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast],
  )

  const success = useCallback(
    (message: string, title?: string) => addToast({ type: "success", title, message }),
    [addToast],
  )
  const error = useCallback(
    (message: string, title?: string) => addToast({ type: "error", title, message, duration: 6000 }),
    [addToast],
  )
  const info = useCallback(
    (message: string, title?: string) => addToast({ type: "info", title, message }),
    [addToast],
  )
  const warning = useCallback(
    (message: string, title?: string) => addToast({ type: "warning", title, message }),
    [addToast],
  )

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info, warning }}>
      {children}
      {/* Toast Notification Container (VS Code bottom right notifications) */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
        {toasts.map((t) => {
          const icons = {
            info: <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />,
            success: <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />,
            warning: <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />,
            error: <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />,
          }

          const borderColors = {
            info: "border-info/50",
            success: "border-success/50",
            warning: "border-warning/50",
            error: "border-error/50",
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xs bg-sidebar border ${borderColors[t.type]} shadow-xl shadow-black/60 text-xs text-fg animate-in slide-in-from-right-4 duration-150`}
            >
              {icons[t.type]}
              <div className="flex-1 min-w-0">
                {t.title && (
                  <div className="font-semibold text-fg-bright text-xs leading-tight mb-0.5">
                    {t.title}
                  </div>
                )}
                <div className="text-xs text-fg leading-relaxed wrap-break-word">{t.message}</div>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-fg-muted hover:text-fg-bright p-0.5 rounded-xs transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}
