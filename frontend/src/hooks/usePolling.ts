import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { poll, runScheduled } from '../api/client'
import { useMailStore } from '../store/mailStore'
import { notificationsActive } from './useNotifications'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function usePolling() {
  const { currentFolder, lastUid, setLastUid, setBadge } = useMailStore()
  const queryClient = useQueryClient()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const folderRef = useRef(currentFolder)
  const lastUidRef = useRef(lastUid)

  useEffect(() => {
    folderRef.current = currentFolder
  }, [currentFolder])

  useEffect(() => {
    lastUidRef.current = lastUid
  }, [lastUid])

  useEffect(() => {
    const doPoll = async () => {
      try {
        const res = await poll(lastUidRef.current, folderRef.current)
        const data = res.data as {
          unread?: number
          messages?: Array<{ uid: number; subject: string; from: string }>
          latestUid?: number
        }

        // Update lastUid cursor
        if (data.latestUid && data.latestUid > lastUidRef.current) {
          setLastUid(data.latestUid)
        }

        const newMessages = data.messages || []
        if (newMessages.length > 0) {
          // Update folder badge to reflect unread count
          if (typeof data.unread === 'number') {
            setBadge(folderRef.current, data.unread)
          }

          // Silently refresh the current folder's message list + folder badges
          queryClient.invalidateQueries({ queryKey: ['messages', folderRef.current] })
          queryClient.invalidateQueries({ queryKey: ['folders'] })

          // Browser notification — only if user hasn't muted
          if (notificationsActive()) {
            const first = newMessages[0]
            const body = newMessages.length === 1
              ? `${first.from} — ${first.subject || '(no subject)'}`
              : `${newMessages.length} new messages in ${folderRef.current}`
            new Notification('B8N6 MAIL', {
              body,
              icon: '/favicon.ico',
              silent: false,
            })
          }
        } else if (typeof data.unread === 'number') {
          // Just update the badge count silently
          setBadge(folderRef.current, data.unread)
        }

        // Run scheduled email processor in background
        runScheduled().catch(() => {})
      } catch {
        // Silently ignore poll errors (network hiccups, temporary IMAP issues)
      }
    }

    // Initial poll after short delay, then every 5 minutes
    const initialTimer = setTimeout(doPoll, 3000)
    intervalRef.current = setInterval(doPoll, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimer)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [setLastUid, setBadge, queryClient])
}
