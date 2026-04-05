import { useCallback, useEffect, useState } from 'react'
import { toast } from './useToast'

const STORAGE_KEY = 'b8n6-notif-enabled'

export type NotifState = {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  enabled: boolean       // user's on/off preference (respected only when permission === 'granted')
  active: boolean        // true if notifications will actually fire right now
  toggle: () => Promise<void>
}

export function useNotifications(): NotifState {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported'
  )
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) !== '0'
  })

  // Re-read permission on window focus (user may have changed site settings)
  useEffect(() => {
    if (!supported) return
    const sync = () => setPermission(Notification.permission)
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [supported])

  const toggle = useCallback(async () => {
    if (!supported) {
      toast('Notifications not supported in this browser', 'error')
      return
    }

    // Case 1: permission not yet decided — ask the browser
    if (permission === 'default') {
      try {
        const result = await Notification.requestPermission()
        setPermission(result)
        if (result === 'granted') {
          setEnabled(true)
          localStorage.setItem(STORAGE_KEY, '1')
          toast('Notifications enabled', 'success')
          // Fire a confirmation notification
          try {
            new Notification('B8N6 MAIL', { body: 'Desktop notifications are now active', icon: '/favicon.ico' })
          } catch { /* noop */ }
        } else {
          toast('Notifications blocked', 'error')
        }
      } catch {
        toast('Permission request failed', 'error')
      }
      return
    }

    // Case 2: permission denied by browser — user must change site settings
    if (permission === 'denied') {
      toast('Blocked by browser — enable in site settings', 'error')
      return
    }

    // Case 3: permission granted — flip the app-level on/off toggle
    const next = !enabled
    setEnabled(next)
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    toast(next ? 'Notifications enabled' : 'Notifications muted', 'success')
  }, [supported, permission, enabled])

  const active = supported && permission === 'granted' && enabled

  return { supported, permission, enabled, active, toggle }
}

// Helper for non-React code (polling hook) to check the current state
export function notificationsActive(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  return localStorage.getItem(STORAGE_KEY) !== '0'
}
