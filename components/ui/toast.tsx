"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToastProps {
  id: string
  title?: string
  description?: string
  type?: "success" | "error" | "warning" | "info"
  duration?: number
  onClose: (id: string) => void
}

export function Toast({ id, title, description, type = "info", duration = 5000, onClose }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id)
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  const typeStyles = {
    success: "bg-green-900/90 border-green-700 text-green-100",
    error: "bg-red-900/90 border-red-700 text-red-100",
    warning: "bg-yellow-900/90 border-yellow-700 text-yellow-100",
    info: "bg-blue-900/90 border-blue-700 text-blue-100",
  }

  return (
    <div
      className={cn("fixed top-4 right-4 z-50 w-96 rounded-lg border p-4 shadow-lg backdrop-blur-sm", typeStyles[type])}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {title && <div className="font-semibold mb-1">{title}</div>}
          {description && <div className="text-sm opacity-90">{description}</div>}
        </div>
        <button onClick={() => onClose(id)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastProps[]>([])

  const addToast = React.useCallback((toast: Omit<ToastProps, "id" | "onClose">) => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts((prev) => [...prev, { ...toast, id, onClose: removeToast }])
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const ToastContainer = React.useCallback(
    () => (
      <>
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </>
    ),
    [toasts],
  )

  return { addToast, ToastContainer }
}
