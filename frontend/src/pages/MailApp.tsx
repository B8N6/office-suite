import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe } from '../api/client'
import { useMailStore } from '../store/mailStore'
import { usePolling } from '../hooks/usePolling'
import { useToast } from '../hooks/useToast'
import { setDomainTheme } from '../hooks/useBranding'

import Sidebar from '../components/Sidebar/Sidebar'
import MessageList from '../components/MessageList/MessageList'
import MessageDetail from '../components/MessageDetail/MessageDetail'
import ComposeModal from '../components/Compose/ComposeModal'
import type { ComposeHandle } from '../components/Compose/ComposeModal'
import CalendarPane from '../components/Calendar/CalendarPane'
import CloudPane from '../components/Cloud/CloudPane'
import SettingsModal from '../components/Settings/SettingsModal'
import AccountSwitcherModal from '../components/Accounts/AccountSwitcherModal'
import UnifiedInbox from '../components/UnifiedInbox/UnifiedInbox'

export default function MailApp() {
  const navigate = useNavigate()
  const { setAuth, view, sidebarOpen, setSidebarOpen, accounts } = useMailStore()
  const { toasts, removeToast } = useToast()
  const composeRef = useRef<ComposeHandle>(null)

  usePolling()

  // Check auth on mount + ensure Mailbox → Inbox is the default landing view
  useEffect(() => {
    // Always start users on the mail list view (not on a stale cloud/calendar
    // view from a previous navigation).
    useMailStore.setState({ view: 'mail' })
    getMe()
      .then((res) => {
        setAuth(res.data.email, res.data.name, res.data.icon)
        setDomainTheme(res.data)
        // Sync admin flags (drives the "Admin Panel" button in sidebar)
        useMailStore.getState().setAdminFlags(!!res.data.isAdmin, (res.data.adminRole as 'owner' | 'admin' | undefined) || '', !!res.data.adminSessionActive)
        // Keep the saved account's icon in sync if we have it
        if (res.data.icon) {
          const { accounts, saveAccount } = useMailStore.getState()
          const existing = accounts.find((a) => a.email === res.data.email)
          if (existing && (existing.icon !== res.data.icon || existing.iconLight !== res.data.iconLight)) {
            saveAccount({ ...existing, icon: res.data.icon, iconLight: res.data.iconLight })
          }
        }
      })
      .catch(() => {
        navigate('/login', { replace: true })
      })
  }, [setAuth, navigate])

  // If the accounts list becomes empty (user removed the last one elsewhere),
  // kick them out of the dashboard.
  useEffect(() => {
    if (accounts.length === 0) {
      navigate('/login', { replace: true })
    }
  }, [accounts.length, navigate])

  // Expose composeRef to ComposeModal open trigger from sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useMailStore.setState({ composeOpen: false, settingsOpen: false, accountSwitcherOpen: false })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="mail-layout">
      {/* Sidebar toggle button (mobile overlay close) */}
      {!sidebarOpen && (
        <button
          className="icon-btn"
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 300, background: 'var(--bk3)', border: '1px solid var(--bd)' }}
          onClick={() => setSidebarOpen(true)}
        >
          <i className="bi bi-list" />
        </button>
      )}

      <Sidebar />

      {/* Main content area */}
      {view === 'calendar' ? (
        <CalendarPane />
      ) : view === 'cloud' ? (
        <CloudPane />
      ) : (
        <>
          {view === 'unified' ? (
            <UnifiedInbox />
          ) : (
            <MessageList />
          )}
          <MessageDetail composeRef={composeRef} />
        </>
      )}

      {/* Modals */}
      <ComposeModal ref={composeRef} />
      <SettingsModal />
      <AccountSwitcherModal />

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
