import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getFolders } from '../../api/client'
import { useMailStore } from '../../store/mailStore'
import { toast } from '../../hooks/useToast'
import { useEffect, useState } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import { useBranding, setColorScheme } from '../../hooks/useBranding'
import { accountColorFor } from '../../constants'

export default function Sidebar() {
  const {
    currentFolder,
    setFolder,
    view,
    setView,
    sidebarOpen,
    setSidebarOpen,
    setComposeOpen,
    setSettingsOpen,
    setAccountSwitcherOpen,
    email,
    name,
    icon: authIcon,
    badges,
    accounts,
    theme,
    toggleTheme,
    isAdmin,
    adminRole,
    adminSessionActive,
  } = useMailStore()

  // Sync colour scheme to the branding system whenever the store theme changes
  useEffect(() => {
    setColorScheme(theme)
  }, [theme])

  // Collapsible sidebar groups — state persisted in localStorage
  const [mailboxOpen, setMailboxOpen] = useState<boolean>(() => {
    return localStorage.getItem('b8n6-group-mailbox') !== '0'
  })
  const [cloudOpen, setCloudOpen] = useState<boolean>(() => {
    return localStorage.getItem('b8n6-group-cloud') !== '0'
  })
  const toggleMailbox = () => {
    const next = !mailboxOpen
    setMailboxOpen(next)
    localStorage.setItem('b8n6-group-mailbox', next ? '1' : '0')
  }
  const toggleCloud = () => {
    const next = !cloudOpen
    setCloudOpen(next)
    localStorage.setItem('b8n6-group-cloud', next ? '1' : '0')
  }

  const accountIndex = accounts.findIndex((a) => a.email === email)
  const avatarColor = accountColorFor(accountIndex)
  const acc = accounts[accountIndex]
  // Pick the right domain icon variant for the current colour scheme,
  // falling back to the other variant if the chosen one isn't uploaded.
  const domainIcon = theme === 'light'
    ? (acc?.iconLight || acc?.icon || authIcon || '')
    : (authIcon || acc?.icon || acc?.iconLight || '')

  const queryClient = useQueryClient()

  const { data: foldersData, isLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: () => getFolders().then((r) => r.data),
    refetchInterval: 60_000,
  })

  // When folders load, make sure the active folder matches a real IMAP
  // mailbox name so the sidebar highlights correctly. Backend may return
  // the Inbox under a slightly different name (e.g. "INBOX" vs "Inbox").
  useEffect(() => {
    const list = foldersData?.folders || []
    if (list.length === 0) return
    const matches = list.some((f: { name: string }) => f.name === currentFolder)
    if (!matches) {
      // Pick the Inbox (sort: 0) or the first folder as a safe default
      const inbox = list.find((f: { label: string }) => f.label === 'Inbox') || list[0]
      setFolder(inbox.name, inbox.label)
    }
  }, [foldersData, currentFolder, setFolder])

  const handleFolderClick = (folderName: string, folderLabel: string) => {
    setFolder(folderName, folderLabel)
    setView('mail')
    useMailStore.setState({ currentPage: 1, currentMessage: null })
    queryClient.invalidateQueries({ queryKey: ['messages', folderName] })
  }

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['messages', currentFolder] })
    await queryClient.invalidateQueries({ queryKey: ['folders'] })
    toast('Refreshed', 'success')
  }

  const notif = useNotifications()
  const branding = useBranding()

  const initial = (name || email || '?').charAt(0).toUpperCase()

  return (
    <div className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <img src={branding.logo || '/logo.png'} alt="" className="sidebar-logo-img" />
        <span className="sidebar-logo-text">{branding.appName.replace(/^B8N6\s*/i, '') || 'MAIL'}</span>
        <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar" style={{ marginLeft: 'auto' }}>
          <i className="bi bi-list" />
        </button>
      </div>

      {/* Compose button */}
      <div className="sidebar-compose">
        <button
          className="compose-btn"
          onClick={() => {
            setComposeOpen(true)
          }}
        >
          <i className="bi bi-pencil-square" />
          Compose
        </button>
      </div>

      {/* Nav */}
      <div className="sidebar-nav">
        {/* ============ MAILBOX group ============ */}
        <button
          className={`nav-group-header ${mailboxOpen ? 'open' : ''}`}
          onClick={toggleMailbox}
          aria-expanded={mailboxOpen}
        >
          <i className={`bi ${mailboxOpen ? 'bi-chevron-down' : 'bi-chevron-right'} nav-group-chevron`} />
          <i className="bi bi-envelope-fill nav-group-icon" />
          <span>Mailbox</span>
        </button>

        {mailboxOpen && (
          <div className="nav-group-body">
            <div
              className={`folder-item ${view === 'unified' ? 'active' : ''}`}
              onClick={() => setView('unified')}
            >
              <i className="bi bi-grid-1x2" />
              <span className="folder-item-name">All Inboxes</span>
            </div>

            {/* IMAP folders for the currently-active account */}
            {isLoading ? (
              <div style={{ padding: '10px 16px 10px 30px' }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
              </div>
            ) : (
              (foldersData?.folders || [])
                .sort((a, b) => a.sort - b.sort)
                .map((folder) => {
                  const unread = badges[folder.name] ?? folder.unread
                  return (
                    <div
                      key={folder.name}
                      className={`folder-item ${currentFolder === folder.name && view === 'mail' ? 'active' : ''}`}
                      onClick={() => handleFolderClick(folder.name, folder.label)}
                    >
                      <i className={`bi ${folder.icon || 'bi-folder-fill'}`} />
                      <span className="folder-item-name">{folder.label}</span>
                      {unread > 0 && (
                        <span className="folder-badge">{unread > 99 ? '99+' : unread}</span>
                      )}
                    </div>
                  )
                })
            )}

            <div className="folder-item" onClick={handleRefresh}>
              <i className="bi bi-arrow-clockwise" />
              <span className="folder-item-name">Refresh</span>
            </div>
          </div>
        )}

        {/* ============ CLOUD group ============ */}
        <button
          className={`nav-group-header ${cloudOpen ? 'open' : ''}`}
          onClick={toggleCloud}
          aria-expanded={cloudOpen}
        >
          <i className={`bi ${cloudOpen ? 'bi-chevron-down' : 'bi-chevron-right'} nav-group-chevron`} />
          <i className="bi bi-cloud-fill nav-group-icon" />
          <span>Cloud</span>
        </button>

        {cloudOpen && (
          <div className="nav-group-body">
            <div
              className={`folder-item ${view === 'cloud' ? 'active' : ''}`}
              onClick={() => setView('cloud')}
            >
              <i className="bi bi-folder-fill" />
              <span className="folder-item-name">Files</span>
            </div>
            <div
              className={`folder-item ${view === 'calendar' ? 'active' : ''}`}
              onClick={() => setView('calendar')}
            >
              <i className="bi bi-calendar3" />
              <span className="folder-item-name">Calendar</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <button
          className={`icon-btn ${notif.active ? 'active' : ''}`}
          title={
            notif.permission === 'denied' ? 'Notifications blocked by browser' :
            notif.permission === 'default' ? 'Click to enable notifications' :
            notif.active ? 'Notifications: ON (click to mute)' : 'Notifications: OFF (click to enable)'
          }
          onClick={notif.toggle}
          style={{ color: notif.active ? 'var(--yl)' : notif.permission === 'denied' ? 'var(--red)' : undefined }}
        >
          <i className={`bi ${notif.active ? 'bi-bell-fill' : 'bi-bell-slash'}`} />
        </button>
        <button
          className="icon-btn"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
          aria-label="Toggle colour scheme"
        >
          <i className={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} />
        </button>
        <button
          className="icon-btn"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <i className="bi bi-gear" />
        </button>
        {isAdmin && adminSessionActive && (
          <button
            className="icon-btn admin-badge-btn"
            title={`Admin Panel (${adminRole || 'admin'})`}
            onClick={() => { window.location.href = '/admin' }}
            style={{ color: '#ef4444' }}
          >
            <i className="bi bi-shield-lock-fill" />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div
          className="sidebar-avatar"
          title={email || 'Accounts'}
          onClick={() => setAccountSwitcherOpen(true)}
          style={{
            background: domainIcon ? 'transparent' : avatarColor,
            color: '#050505',
            padding: domainIcon ? 2 : undefined,
            border: domainIcon ? '1px solid var(--bd2)' : undefined,
          }}
        >
          {domainIcon ? (
            <img src={domainIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : initial}
        </div>
      </div>
    </div>
  )
}
