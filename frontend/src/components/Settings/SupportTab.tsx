import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUserTickets, createUserTicket, replyUserTicket } from '../../api/client'
import { toast } from '../../hooks/useToast'

/**
 * User-facing support ticket tab. Users can:
 *  - Open a new support ticket (subject + body + priority)
 *  - View their existing tickets sorted by most recent
 *  - Reply to an open thread
 * Admins reply from the admin panel; replies show up here.
 */
export default function SupportTab() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'normal' | 'high'>('normal')
  const [reply, setReply] = useState('')

  const { data } = useQuery({
    queryKey: ['user-tickets'],
    queryFn: () => getUserTickets().then((r) => r.data),
    refetchInterval: 30_000, // poll for admin replies
  })
  const tickets = data?.tickets || []
  const selected = tickets.find((t) => t.id === selectedId)

  const createMut = useMutation({
    mutationFn: () => createUserTicket({ subject: newSubject.trim(), body: newBody.trim(), priority: newPriority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-tickets'] })
      setShowNew(false)
      setNewSubject(''); setNewBody(''); setNewPriority('normal')
      toast('Ticket opened', 'success')
    },
    onError: () => toast('Failed to open ticket', 'error'),
  })

  const replyMut = useMutation({
    mutationFn: (body: string) => replyUserTicket(selectedId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-tickets'] })
      setReply('')
      toast('Reply sent', 'success')
    },
    onError: () => toast('Failed to send reply', 'error'),
  })

  const send = () => {
    if (!reply.trim()) { toast('Reply is empty', 'error'); return }
    if (selectedId) replyMut.mutate(reply.trim())
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)' }}>
          SUPPORT
        </div>
        {!showNew && (
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            <i className="bi bi-plus" /> New ticket
          </button>
        )}
      </div>

      {showNew && (
        <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', padding: 16, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <input className="form-input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Brief summary..." />
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-input" value={newPriority} onChange={(e) => setNewPriority(e.target.value as 'low' | 'normal' | 'high')}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea
              className="form-input"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Describe the issue..."
              rows={5}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              onClick={() => createMut.mutate()}
              disabled={!newSubject.trim() || !newBody.trim() || createMut.isPending}
            >
              <i className="bi bi-send" /> Submit
            </button>
            <button className="btn-ghost" onClick={() => { setShowNew(false); setNewSubject(''); setNewBody('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {tickets.length === 0 && !showNew && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--dim)', fontSize: 13 }}>
          <i className="bi bi-life-preserver" style={{ fontSize: 32, display: 'block', marginBottom: 10, opacity: 0.4 }} />
          No support tickets yet.
        </div>
      )}

      {tickets.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, minHeight: 360 }}>
          <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', overflowY: 'auto', maxHeight: 420 }}>
            {tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--bd3)',
                  cursor: 'pointer',
                  background: selectedId === t.id ? 'rgba(245,196,0,0.08)' : 'transparent',
                  borderLeft: `3px solid ${selectedId === t.id ? 'var(--yl)' : 'transparent'}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wh)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.subject}
                </div>
                <div style={{ fontSize: 10, color: t.status === 'open' ? 'var(--yl)' : 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', letterSpacing: '.08em', marginTop: 2 }}>
                  ● {t.status.toUpperCase()} · {t.messages.length} msg
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', maxHeight: 420 }}>
            {!selected ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 13 }}>
                Select a ticket to view messages.
              </div>
            ) : (
              <>
                <div style={{ padding: 12, borderBottom: '1px solid var(--bd)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--wh)' }}>{selected.subject}</div>
                  <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace' }}>
                    {selected.status.toUpperCase()} · {selected.priority}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.messages.map((m) => (
                    <div key={m.id} style={{
                      padding: '8px 10px',
                      background: m.authorKind === 'admin' ? 'rgba(245,196,0,0.08)' : 'var(--bk4)',
                      borderLeft: `2px solid ${m.authorKind === 'admin' ? 'var(--yl)' : 'var(--dim2)'}`,
                      fontSize: 12,
                    }}>
                      <div style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 3, fontFamily: 'Share Tech Mono, monospace', letterSpacing: '.08em' }}>
                        {m.authorKind === 'admin' ? 'SUPPORT' : 'YOU'} · {m.createdAt.slice(0, 16).replace('T', ' ')}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', color: 'var(--wh)', lineHeight: 1.5 }}>{m.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 10, borderTop: '1px solid var(--bd)' }}>
                  <textarea
                    className="form-input"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply..."
                    rows={2}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                  <button
                    className="btn-primary"
                    onClick={send}
                    disabled={replyMut.isPending || !reply.trim()}
                    style={{ marginTop: 6 }}
                  >
                    <i className="bi bi-send" /> Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
