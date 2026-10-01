import { AlertTriangle, Info } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { Button } from "./Button.tsx"
import { Modal } from "./Modal.tsx"

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: React.ReactNode
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "primary"
  isLoading?: boolean
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText,
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
}: ConfirmModalProps) {
  const [internalLoading, setInternalLoading] = useState(false)
  const isBusy = isLoading || internalLoading

  const handleConfirm = async () => {
    try {
      setInternalLoading(true)
      await onConfirm()
      onClose()
    } finally {
      setInternalLoading(false)
    }
  }

  const defaultConfirmText =
    confirmText || (variant === "danger" ? "Delete" : "Confirm")

  const iconColor = variant === "danger" ? "text-error" : "text-primary"

  return (
    <Modal
      isOpen={isOpen}
      onClose={isBusy ? () => {} : onClose}
      maxWidth="sm"
      title={
        <div className="flex items-center gap-2">
          {variant === "danger" ? (
            <AlertTriangle className={`w-4 h-4 ${iconColor} shrink-0`} />
          ) : (
            <Info className={`w-4 h-4 ${iconColor} shrink-0`} />
          )}
          <span>{title}</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            size="xs"
            variant="ghost"
            onClick={onClose}
            disabled={isBusy}
          >
            {cancelText}
          </Button>
          <Button
            size="xs"
            variant={variant}
            onClick={handleConfirm}
            isLoading={isBusy}
          >
            {defaultConfirmText}
          </Button>
        </div>
      }
    >
      <div className="text-xs text-fg leading-relaxed">
        {message}
      </div>
    </Modal>
  )
}

export interface UseConfirmDialogOptions {
  title?: React.ReactNode
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "primary"
  onConfirm: () => void | Promise<void>
}

export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState<
    UseConfirmDialogOptions & { isOpen: boolean }
  >({
    isOpen: false,
    title: "Confirm Action",
    message: "",
    onConfirm: () => {},
  })

  const confirm = (options: UseConfirmDialogOptions) => {
    setDialogState({
      ...options,
      isOpen: true,
    })
  }

  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, isOpen: false }))
  }

  const ConfirmDialog = () => (
    <ConfirmModal
      isOpen={dialogState.isOpen}
      onClose={handleClose}
      onConfirm={dialogState.onConfirm}
      title={dialogState.title}
      message={dialogState.message}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      variant={dialogState.variant}
    />
  )

  return { confirm, ConfirmDialog }
}
