import { useState, useCallback, useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

let toastCounter = 0
let globalShowToast: ((msg: string, type: ToastType) => void) | null = null

export function toast(msg: string, type: ToastType = 'info') {
  if (globalShowToast) {
    globalShowToast(msg, type)
  }
}

// Attach to window for global usage
if (typeof window !== 'undefined') {
  ;(window as unknown as { toast: typeof toast }).toast = toast
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((msg: string, type: ToastType = 'info') => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, message: msg, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    globalShowToast = showToast
    return () => {
      globalShowToast = null
    }
  }, [showToast])

  return { toasts, showToast, removeToast }
}
