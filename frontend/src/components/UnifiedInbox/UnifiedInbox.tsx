import { useQuery } from '@tanstack/react-query'
import { getUnifiedInbox, getUnifiedMessage, getMessage } from '../../api/client'
import { useMailStore } from '../../store/mailStore'
import { formatMsgDate } from '../../utils/dateFormat'
import { toast } from '../../hooks/useToast'
import type { Message } from '../../types'

import { ACCOUNT_COLORS } from '../../constants'

export default function UnifiedInbox() {
  const { accounts, email: currentEmail, setCurrentMessage } = useMailStore()

  const { data, isLoading } = useQuery({
    queryKey: ['unified', accounts.map((a) => a.email)],
    queryFn: () => getUnifiedInbox(accounts, 50).then((r) => r.data),
    enabled: accounts.length > 0,
  })

  const messages: Message[] = data?.messages || []

  const accountColorMap = new Map(
    accounts.map((acc, i) => [acc.email, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]])
  )

  const openMessage = async (msg: Message) => {
    try {
      const folder = msg.folder || 'INBOX'
      const owner = msg.accountEmail || currentEmail
      // Message belongs to the currently-active session → use the plain endpoint.
      if (owner.toLowerCase() === currentEmail.toLowerCase()) {
        const res = await getMessage(msg.uid, folder)
        setCurrentMessage({ ...res.data.message, accountEmail: owner })
        return
      }
      // Cross-account read — find the saved password for that account
      // and hit the unified-message endpoint. Mark the result as read-only
      // so MessageDetail disables single-mailbox actions (reply/flag/etc).
      const acc = accounts.find((a) => a.email.toLowerCase() === owner.toLowerCase())
      if (!acc || !acc.password) {
        toast(`No saved credentials for ${owner} — sign in to that account`, 'error')
        return
      }
      const res = await getUnifiedMessage(acc.email, acc.password, msg.uid, folder)
      setCurrentMessage({ ...res.data.message, accountEmail: owner, readOnly: true })
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      toast(ax.response?.data?.error || 'Failed to load message', 'error')
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="msg-list-pane">
        <div className="msg-list-header">
          <div className="msg-list-title">
            <i className="bi bi-grid-1x2" style={{ marginRight: 8 }} />
            All Inboxes
          </div>
        </div>
        <div className="empty-state">
          <i className="bi bi-person-plus" />
          <p>No accounts configured</p>
          <span style={{ fontSize: 13 }}>Add accounts in the account switcher</span>
        </div>
      </div>
    )
  }

  return (
    <div className="msg-list-pane">
      <div className="msg-list-header">
        <div className="msg-list-title">
          <i className="bi bi-grid-1x2" style={{ marginRight: 8 }} />
          All Inboxes
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
          {accounts.length} account{accounts.length > 1 ? 's' : ''}
          {accounts.map((acc, i) => (
            <span key={acc.email} style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length], display: 'inline-block' }} />
              {acc.email}
            </span>
          ))}
        </div>
      </div>

      <div className="msg-list-body">
        {isLoading ? (
          <div className="loading-state">
            <span className="spinner" />
            Loading all inboxes...
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-inbox" />
            <p>No messages</p>
          </div>
        ) : (
          messages.map((msg) => {
            const color = msg.accountEmail
              ? (accountColorMap.get(msg.accountEmail) || 'var(--dim)')
              : 'var(--dim)'
            return (
              <div
                key={`${msg.accountEmail}-${msg.uid}`}
                className={`msg-item ${msg.seen ? '' : 'unread'}`}
                onClick={() => openMessage(msg)}
              >
                <div className="unified-dot" style={{ background: color, color }} />
                <div className="msg-item-content">
                  <div className="msg-from">{msg.from}</div>
                  <div className="msg-subject">{msg.subject || '(no subject)'}</div>
                  <div className="msg-preview">
                    {msg.accountEmail && (
                      <span style={{ color, marginRight: 6 }}>● {msg.accountEmail}</span>
                    )}
                    {msg.preview}
                  </div>
                </div>
                <div className="msg-meta">
                  <span className="msg-date">{formatMsgDate(msg.dateRaw || msg.date)}</span>
                  <div className="msg-icons">
                    {msg.flagged && <i className="bi bi-star-fill flagged" />}
                    {msg.hasAttach && <i className="bi bi-paperclip attach" />}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
