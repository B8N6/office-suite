import { useState } from 'react'
import {
  adminReplyTicket,
  type UserActivity,
  type SupportTicket,
  type UserStorageRow,
} from '../../api/client'
import { toast } from '../../hooks/useToast'

// -------------------- Dashboard stat card --------------------
export function DashCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      background: 'var(--bk3)',
      border: '1px solid var(--bd)',
      padding: '16px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      clipPath: 'var(--clip-md)',
    }}>
      <i className={`bi ${icon}`} style={{ fontSize: 26, color: 'var(--yl)' }} />
      <div>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--wh)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 10, color: 'var(--dim)', letterSpacing: '.15em', textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </div>
  )
}

// -------------------- User activity monitoring --------------------
export function UsersTab({ activity }: { activity: UserActivity[] }) {
  const [filter, setFilter] = useState('')
  const filtered = activity.filter((u) =>
    !filter ||
    u.email.toLowerCase().includes(filter.toLowerCase()) ||
    u.domain.includes(filter.toLowerCase())
  )
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 2, color: 'var(--yl)' }}>
          USERS ({activity.length})
        </div>
        <input
          className="form-input"
          placeholder="Filter by email or domain..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 260 }}
        />
      </div>
      <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', overflow: 'auto' }}>
        <table className="admin-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Domain</th>
              <th>Last login</th>
              <th title="Scheduled emails">SCH</th>
              <th title="Filter rules">FLT</th>
              <th title="Contacts">CON</th>
              <th title="Calendar events">CAL</th>
              <th title="Has signature">SIG</th>
              <th title="Open support tickets">TIX</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.email}>
                <td style={{ fontWeight: 600 }}>{u.email}</td>
                <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>{u.domain}</td>
                <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>
                  {u.lastLoginAt ? u.lastLoginAt.slice(0, 16).replace('T', ' ') : '—'}
                </td>
                <td>{u.scheduledCount || '—'}</td>
                <td>{u.filterCount || '—'}</td>
                <td>{u.contactCount || '—'}</td>
                <td>{u.calendarEvents || '—'}</td>
                <td>{u.hasSignature ? '✓' : '—'}</td>
                <td style={{ color: u.openTickets > 0 ? 'var(--yl)' : 'var(--dim)', fontWeight: u.openTickets > 0 ? 700 : 400 }}>
                  {u.openTickets || '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>No users match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -------------------- Support tickets tab --------------------
export function TicketsTab({ tickets, onRefresh }: {
  tickets: SupportTicket[]
  onRefresh: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open')
  const [sending, setSending] = useState(false)

  const filtered = tickets.filter((t) => statusFilter === 'all' || t.status === statusFilter)
  const selected = tickets.find((t) => t.id === selectedId)

  const sendReply = async (close: boolean) => {
    if (!selected) return
    if (!close && !reply.trim()) { toast('Reply body is empty', 'error'); return }
    setSending(true)
    try {
      await adminReplyTicket(selected.id, { body: reply.trim(), close })
      setReply('')
      toast(close ? 'Ticket closed' : 'Reply sent', 'success')
      onRefresh()
    } catch {
      toast('Failed to send reply', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 2, color: 'var(--yl)' }}>
          SUPPORT TICKETS ({tickets.length})
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['open', 'closed', 'all'] as const).map((s) => (
            <button
              key={s}
              className={`btn-ghost ${statusFilter === s ? 'active' : ''}`}
              style={{ fontSize: 10, padding: '4px 10px' }}
              onClick={() => setStatusFilter(s)}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 500 }}>
        <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', overflow: 'auto', maxHeight: '70vh' }}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--dim)', padding: 18, textAlign: 'center', fontSize: 13 }}>No tickets.</div>
          ) : filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--bd3)',
                cursor: 'pointer',
                background: selectedId === t.id ? 'rgba(185, 28, 28, 0.12)' : 'transparent',
                borderLeft: `3px solid ${selectedId === t.id ? 'var(--yl)' : 'transparent'}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wh)', marginBottom: 2 }}>{t.subject}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace' }}>{t.userEmail}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10 }}>
                <span style={{
                  color: t.status === 'open' ? 'var(--yl)' : 'var(--dim)',
                  fontFamily: 'Share Tech Mono, monospace',
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                }}>
                  ● {t.status} · {t.priority}
                </span>
                <span style={{ color: 'var(--dim2)' }}>{t.messages.length} msg</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 13 }}>
              Select a ticket to view the conversation.
            </div>
          ) : (
            <>
              <div style={{ padding: 14, borderBottom: '1px solid var(--bd)' }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--wh)' }}>{selected.subject}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                  {selected.userEmail} · {selected.status} · {selected.priority}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selected.messages.map((m) => (
                  <div key={m.id} style={{
                    padding: '10px 12px',
                    background: m.authorKind === 'admin' ? 'rgba(185, 28, 28, 0.12)' : 'var(--bk4)',
                    borderLeft: `2px solid ${m.authorKind === 'admin' ? 'var(--yl)' : 'var(--dim2)'}`,
                    fontSize: 13,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4, fontFamily: 'Share Tech Mono, monospace', letterSpacing: '.08em' }}>
                      {m.authorKind.toUpperCase()} · {m.author} · {m.createdAt.slice(0, 16).replace('T', ' ')}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', color: 'var(--wh)', lineHeight: 1.5 }}>{m.body}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 12, borderTop: '1px solid var(--bd)' }}>
                <textarea
                  className="form-input"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-primary" onClick={() => sendReply(false)} disabled={sending}>
                    <i className="bi bi-send" /> Send reply
                  </button>
                  <button className="btn-ghost" onClick={() => sendReply(true)} disabled={sending}>
                    <i className="bi bi-check2-circle" /> {selected.status === 'open' ? 'Send & close' : 'Close ticket'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// -------------------- Storage usage tab --------------------
function fmtBytes(n: number): string {
  if (!n || n < 1024) return (n || 0) + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

export function StorageTab({ rows }: { rows: UserStorageRow[] }) {
  const [filter, setFilter] = useState('')
  const filtered = rows.filter((u) =>
    !filter || u.email.toLowerCase().includes(filter.toLowerCase()) || u.domain.includes(filter.toLowerCase())
  )
  const totalUsed = filtered.reduce((sum, r) => sum + r.storageUsed, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 2, color: 'var(--yl)' }}>
          STORAGE USAGE ({rows.length} users · {fmtBytes(totalUsed)} total)
        </div>
        <input
          className="form-input"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 260 }}
        />
      </div>
      <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', overflow: 'auto' }}>
        <table className="admin-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Domain</th>
              <th>Storage used</th>
              <th>Created</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.email}>
                <td style={{ fontWeight: 600 }}>{u.email}</td>
                <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>{u.domain}</td>
                <td style={{ color: u.storageUsed > 0 ? 'var(--yl)' : 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}>
                  {fmtBytes(u.storageUsed)}
                </td>
                <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 11 }}>
                  {u.createdAt ? u.createdAt.slice(0, 10) : '—'}
                </td>
                <td style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 11 }}>
                  {u.lastSeenAt ? u.lastSeenAt.slice(0, 16).replace('T', ' ') : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>No users.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
