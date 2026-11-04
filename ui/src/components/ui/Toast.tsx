import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export type ToastMessage = {
  id: string
  type: ToastType
  text: string
}

type ToastListener = (toasts: ToastMessage[]) => void

let toasts: ToastMessage[] = []
const listeners: Set<ToastListener> = new Set()

function notify() {
  listeners.forEach((l) => l([...toasts]))
}

export const toast = {
  show(type: ToastType, text: string, durationMs = 3500) {
    const id = Math.random().toString(36).slice(2, 9)
    const newToast: ToastMessage = { id, type, text }
    toasts = [newToast, ...toasts.slice(0, 3)]
    notify()

    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
      notify()
    }, durationMs)
  },
  success(text: string, durationMs?: number) {
    this.show('success', text, durationMs)
  },
  error(text: string, durationMs?: number) {
    this.show('error', text, durationMs)
  },
  info(text: string, durationMs?: number) {
    this.show('info', text, durationMs)
  },
  dismiss(id: string) {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  },
}

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const listener: ToastListener = (updated) => setCurrentToasts(updated)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  if (currentToasts.length === 0) return null

  return (
    <div className="toast-portal-container" aria-live="polite">
      {currentToasts.map((item) => (
        <div key={item.id} className={`toast-bubble toast-bubble--${item.type}`}>
          <span className="toast-icon">
            {item.type === 'success' && '✓'}
            {item.type === 'error' && '✕'}
            {item.type === 'info' && 'ℹ'}
          </span>
          <span className="toast-text">{item.text}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => toast.dismiss(item.id)}
            aria-label="Dismiss toast"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
