import { useEffect, useRef, useState, type RefObject } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { messageAction, getAttachmentUrl, getFolders, addContact, downloadMessageUrl, sendMessage } from '../../api/client'
import { getCachedBranding } from '../../hooks/useBranding'
import { useMailStore } from '../../store/mailStore'
import { toast } from '../../hooks/useToast'
import { formatFileSize } from '../../utils/dateFormat'
import type { Attachment, MessageDetail as MessageDetailType } from '../../types'
import type { ComposeHandle } from '../Compose/ComposeModal'

interface MessageDetailProps {
  composeRef?: RefObject<ComposeHandle | null>
}

/** Max number of original-message lines included in a quoted reply. */
const MAX_QUOTED_LINES = 50

function getAttachIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'bi-file-image'
  if (mimeType.startsWith('video/')) return 'bi-file-play'
  if (mimeType.startsWith('audio/')) return 'bi-file-music'
  if (mimeType.includes('pdf')) return 'bi-file-pdf'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'bi-file-zip'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'bi-file-word'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'bi-file-excel'
  return 'bi-file-earmark'
}

// Parse "Name <email@host.tld>" into { name, email }.
function parseAddress(raw: string): { name: string; email: string } {
  const s = (raw || '').trim()
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim(), email: m[2].trim() }
  return { name: '', email: s }
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label} copied`, 'success')
  } catch {
    toast('Copy failed', 'error')
  }
}

/**
 * Light HTML sanitization for email bodies rendered inside a sandboxed iframe.
 * The sandbox already blocks scripts and same-origin access, but we additionally
 * strip <script>, <iframe>, <object>, <embed>, inline event handlers (onload=, onclick=…)
 * and javascript: URLs so that rendered content is safe even if the sandbox
 * attribute ever gets dropped or relaxed.
 */
function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    // strip inline on*= event handlers
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, '')
    // neutralize javascript: URIs
    .replace(/javascript:/gi, 'about:blank#')
}

export default function MessageDetail({ composeRef }: MessageDetailProps) {
  const { currentMessage, currentFolder, setCurrentMessage, email: myEmail } = useMailStore()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // Inline quick-reply state
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyMode, setReplyMode] = useState<'reply' | 'replyall'>('reply')
  const [sendingReply, setSendingReply] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const queryClient = useQueryClient()

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => getFolders().then((r) => r.data),
  })

  const actionMut = useMutation({
    mutationFn: ({ action, target }: { action: string; target?: string }) =>
      messageAction(action, currentMessage!.uid, currentMessage!.folder || currentFolder, target),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      if (vars.action === 'trash' || vars.action === 'delete' || vars.action === 'spam' || vars.action === 'move') {
        setCurrentMessage(null)
      }
      toast(`Message ${vars.action === 'read' ? 'marked as read' : vars.action === 'unread' ? 'marked as unread' : vars.action + 'd'}`, 'success')
    },
    onError: () => toast('Action failed', 'error'),
  })

  const addContactMut = useMutation({
    mutationFn: (c: { name: string; email: string }) => addContact(c).then((r) => r.data),
    onSuccess: (d) => {
      toast(d.updated ? 'Contact updated' : 'Contact added', 'success')
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: () => toast('Failed to add contact', 'error'),
  })

  // Close the quick-reply and discard draft text whenever the user opens a
  // different message (prevents reply text leaking between messages).
  useEffect(() => {
    setReplyOpen(false)
    setReplyText('')
    setReplyMode('reply')
  }, [currentMessage?.uid])

  useEffect(() => {
    if (!currentMessage || !iframeRef.current) return
    const iframe = iframeRef.current
    const doc = iframe.contentDocument
    if (!doc) return

    // Prefer HTML if present (sanitized), otherwise fall back to escaped text
    const body = currentMessage.htmlBody
      ? sanitizeEmailHtml(currentMessage.htmlBody)
      : `<pre style="font-family:monospace;white-space:pre-wrap;padding:16px;color:#333">${(currentMessage.textBody || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))}</pre>`
    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body { margin: 16px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; cursor: default; }
  img { max-width: 100%; height: auto; }
  a { color: #0066cc; }
  pre { white-space: pre-wrap; word-break: break-word; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 12px; color: #666; }
</style>
</head>
<body>
${body}
</body>
</html>`)
    doc.close()
  }, [currentMessage])

  if (!currentMessage) {
    // useBranding() already resolves the right logo for the active theme
    const logo = getCachedBranding().logo || '/logo.png'
    return (
      <div className="msg-detail-pane">
        <div className="msg-detail-empty">
          <img src={logo} alt="" className="msg-detail-empty-logo" />
          <p>Select a message to read</p>
        </div>
      </div>
    )
  }

  const msg = currentMessage
  const isReadOnly = !!msg.readOnly

  // Wrapper used by every mutation-bound toolbar button: in cross-account
  // read-only mode, show a "switch account" toast instead of performing
  // the action against the wrong mailbox.
  const requireOwnerSession = (): boolean => {
    if (!isReadOnly) return true
    toast(`Switch to ${msg.accountEmail || 'that account'} to perform actions`, 'error')
    return false
  }

  // Extract just the email part from a "Name <email>" header.
  // Delegates to the shared RFC-style parser to keep behaviour consistent
  // with the header address-action buttons.
  const extractEmail = (raw: string): string => parseAddress(raw).email

  const handleQuickReplySend = async () => {
    if (!requireOwnerSession()) return
    const text = replyText.trim()
    if (!text) { toast('Reply is empty', 'error'); return }
    const toEmail = extractEmail(msg.from)
    if (!toEmail) { toast('Could not determine sender address', 'error'); return }

    setSendingReply(true)
    try {
      // Build "Re: ..." subject if not already prefixed
      const subject = /^re:\s/i.test(msg.subject || '')
        ? msg.subject
        : `Re: ${msg.subject || ''}`

      // Simple quoted original as HTML
      const originalText = msg.textBody || msg.htmlBody?.replace(/<[^>]+>/g, '') || ''
      const quoted = originalText
        .split('\n')
        .slice(0, MAX_QUOTED_LINES)
        .map((l) => `&gt; ${l.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))}`)
        .join('<br>')
      const html = `<div>${text.replace(/\n/g, '<br>')}</div>
<br><br>
<div style="color:#666;font-size:13px;border-left:3px solid #ccc;padding-left:12px;margin-top:8px">
<b>On ${msg.dateFull || msg.date}, ${msg.from} wrote:</b><br>
${quoted}
</div>`

      // CC line for reply-all (original To+CC minus our own address and the sender)
      const cc = replyMode === 'replyall'
        ? [msg.to, msg.cc].filter(Boolean).join(', ')
            .split(/[,;]/)
            .map((e) => e.trim())
            .filter((raw) => {
              const em = extractEmail(raw).toLowerCase()
              return em && em !== myEmail.toLowerCase() && em !== toEmail.toLowerCase()
            })
            .join(', ')
        : ''

      await sendMessage({
        to: toEmail,
        cc,
        subject,
        html,
        text,
        inReplyTo: msg.messageId || '',
        references: msg.references ? `${msg.references} ${msg.messageId || ''}`.trim() : msg.messageId || '',
      })

      toast('Reply sent', 'success')
      setReplyOpen(false)
      setReplyText('')
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      toast(ax.response?.data?.error || 'Failed to send reply', 'error')
    } finally {
      setSendingReply(false)
    }
  }

  const handlePrint = () => {
    // Sandboxed iframes block window.print(), so we open a fresh window
    // containing the message headers + sanitized body and print from there.
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) { toast('Popup blocked — allow popups to print', 'error'); return }
    const bodyHTML = msg.htmlBody
      ? sanitizeEmailHtml(msg.htmlBody)
      : `<pre style="white-space:pre-wrap;word-break:break-word;font-family:monospace">${(msg.textBody || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))}</pre>`
    const safeSubject = (msg.subject || '(no subject)').replace(/</g, '&lt;')
    const safeFrom = (msg.from || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const safeTo = (msg.to || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const safeCc = (msg.cc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const safeDate = (msg.dateFull || msg.date || '').replace(/</g, '&lt;')
    win.document.open()
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${safeSubject}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; padding: 24px; max-width: 780px; margin: 0 auto; }
  .h { border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 16px; }
  .h h1 { font-size: 18px; margin: 0 0 8px; }
  .h .row { font-size: 12px; color: #555; margin: 2px 0; }
  .h .row b { color: #333; display: inline-block; width: 48px; }
  .body { font-size: 14px; line-height: 1.6; }
  img { max-width: 100%; height: auto; }
  a { color: #0066cc; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="h">
    <h1>${safeSubject}</h1>
    <div class="row"><b>From:</b> ${safeFrom}</div>
    <div class="row"><b>To:</b> ${safeTo}</div>
    ${safeCc ? `<div class="row"><b>CC:</b> ${safeCc}</div>` : ''}
    <div class="row"><b>Date:</b> ${safeDate}</div>
  </div>
  <div class="body">${bodyHTML}</div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });</script>
</body></html>`)
    win.document.close()
  }

  const handleCopyBody = async () => {
    // Prefer plain text, fall back to stripping HTML
    const text = msg.textBody ||
      (msg.htmlBody || '').replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .trim()
    await copyToClipboard(text, 'Body')
  }

  const handleCopyFull = async () => {
    const text = msg.textBody ||
      (msg.htmlBody || '').replace(/<[^>]+>/g, '').trim()
    const full = `From: ${msg.from}\nTo: ${msg.to}${msg.cc ? `\nCC: ${msg.cc}` : ''}\nSubject: ${msg.subject}\nDate: ${msg.dateFull || msg.date}\n\n${text}`
    await copyToClipboard(full, 'Full message')
  }

  const handleDownloadEml = () => {
    const url = downloadMessageUrl(msg.uid, msg.folder || currentFolder)
    const a = document.createElement('a')
    a.href = url
    a.download = `message-${msg.uid}.eml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleAddContact = (raw: string) => {
    const { name, email } = parseAddress(raw)
    if (!email) { toast('No address found', 'error'); return }
    addContactMut.mutate({ name: name || email.split('@')[0], email })
  }

  const handleComposeTo = (raw: string) => {
    const { email } = parseAddress(raw)
    if (!email) return
    composeRef?.current?.open('new')
    // Give modal a tick to mount, then prefill To
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.tag-input-wrap[data-field="to"] input')
      if (input) {
        input.value = email
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    }, 120)
  }

  // Address row with per-address action buttons
  const AddressRow = ({ label, value }: { label: string; value: string }) => {
    const { name, email } = parseAddress(value)
    return (
      <div className="msg-detail-row">
        <span className="msg-detail-row-label">{label}</span>
        <span className="msg-detail-row-value">
          <span className="msg-addr-text">{name ? `${name} ` : ''}<span className="msg-addr-email">&lt;{email}&gt;</span></span>
          <span className="msg-addr-actions">
            <button className="addr-action-btn" title="Copy address" onClick={() => copyToClipboard(email, 'Address')}>
              <i className="bi bi-clipboard" />
            </button>
            <button className="addr-action-btn" title="New message to" onClick={() => handleComposeTo(value)}>
              <i className="bi bi-envelope-plus" />
            </button>
            <button className="addr-action-btn" title="Add to contacts" onClick={() => handleAddContact(value)}>
              <i className="bi bi-person-plus" />
            </button>
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="msg-detail-pane">
      {/* Read-only banner for cross-account (Unified Inbox) messages */}
      {isReadOnly && (
        <div className="readonly-banner">
          <i className="bi bi-eye" />
          <span>Read-only · from <b>{msg.accountEmail}</b>. Switch accounts to reply, flag, or delete.</span>
          <button
            className="btn-ghost"
            onClick={() => useMailStore.setState({ accountSwitcherOpen: true })}
            style={{ fontSize: 10, padding: '4px 10px', marginLeft: 'auto' }}
          >
            <i className="bi bi-arrow-left-right" /> Switch account
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div className="msg-toolbar">
        <button className="icon-btn" title="Reply" onClick={() => requireOwnerSession() && composeRef?.current?.open("reply", msg as MessageDetailType)}>
          <i className="bi bi-reply" />
        </button>
        <button className="icon-btn" title="Reply All" onClick={() => requireOwnerSession() && composeRef?.current?.open("replyall", msg as MessageDetailType)}>
          <i className="bi bi-reply-all" />
        </button>
        <button className="icon-btn" title="Forward" onClick={() => requireOwnerSession() && composeRef?.current?.open('forward', msg as MessageDetailType)}>
          <i className="bi bi-forward" />
        </button>
        <div className="toolbar-sep" />
        <button
          className={`icon-btn ${msg.flagged ? 'active' : ''}`}
          title={msg.flagged ? 'Unflag' : 'Flag'}
          onClick={() => requireOwnerSession() && actionMut.mutate({ action: msg.flagged ? "unflag" : "flag" })}
        >
          <i className={`bi ${msg.flagged ? 'bi-star-fill' : 'bi-star'}`} />
        </button>
        <button className="icon-btn" title="Mark Unread" onClick={() => requireOwnerSession() && actionMut.mutate({ action: "unread" })}>
          <i className="bi bi-envelope" />
        </button>
        <div className="toolbar-sep" />
        <button className="icon-btn" title="Move to Spam" onClick={() => requireOwnerSession() && actionMut.mutate({ action: "spam" })}>
          <i className="bi bi-shield-slash" />
        </button>
        <button className="icon-btn" title="Move to Trash" onClick={() => requireOwnerSession() && actionMut.mutate({ action: "trash" })}>
          <i className="bi bi-trash3" />
        </button>
        <button
          className="icon-btn"
          title="Delete permanently"
          style={{ color: 'var(--red)' }}
          onClick={() => {
            if (!requireOwnerSession()) return
            if (confirm('Permanently delete this message?')) actionMut.mutate({ action: 'delete' })
          }}
        >
          <i className="bi bi-x-circle" />
        </button>
        <div className="toolbar-sep" />
        <button className="icon-btn" title="Print" onClick={handlePrint}>
          <i className="bi bi-printer" />
        </button>
        <button className="icon-btn" title="Copy body" onClick={handleCopyBody}>
          <i className="bi bi-clipboard-check" />
        </button>

        {/* More-actions dropdown */}
        <div className="move-dropdown" style={{ marginLeft: 'auto' }}>
          <button className="icon-btn" title="More actions" onClick={() => setShowMoreMenu((v) => !v)}>
            <i className="bi bi-three-dots-vertical" />
          </button>
          {showMoreMenu && (
            <div className="move-dropdown-menu" onClick={() => setShowMoreMenu(false)}>
              <div className="move-dropdown-item" onClick={handleCopyFull}>
                <i className="bi bi-clipboard2-plus" /> Copy full message
              </div>
              <div className="move-dropdown-item" onClick={() => copyToClipboard(msg.subject || '', 'Subject')}>
                <i className="bi bi-type" /> Copy subject
              </div>
              <div className="move-dropdown-item" onClick={handleDownloadEml}>
                <i className="bi bi-download" /> Download .eml
              </div>
              <div className="move-dropdown-item" onClick={() => setShowSource((v) => !v)}>
                <i className="bi bi-code-slash" /> {showSource ? 'Hide' : 'View'} source
              </div>
              <div className="move-dropdown-item" onClick={() => handleAddContact(msg.from)}>
                <i className="bi bi-person-plus" /> Add sender to contacts
              </div>
            </div>
          )}
        </div>

        {/* Move-to dropdown */}
        <div className="move-dropdown">
          <button className="icon-btn" title="Move to folder" onClick={() => setShowMoveDropdown((v) => !v)}>
            <i className="bi bi-folder-symlink" />
          </button>
          {showMoveDropdown && (
            <div className="move-dropdown-menu">
              {(foldersData?.folders || []).map((f) => (
                <div
                  key={f.name}
                  className="move-dropdown-item"
                  onClick={() => {
                    if (!requireOwnerSession()) return
                    actionMut.mutate({ action: 'move', target: f.name })
                    setShowMoveDropdown(false)
                  }}
                >
                  <i className={`bi ${f.icon || 'bi-folder-fill'}`} />
                  {f.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="msg-detail-header" onClick={() => { setShowMoveDropdown(false); setShowMoreMenu(false) }}>
        <div className="msg-detail-subject">
          {msg.subject || '(no subject)'}
          <button className="addr-action-btn" title="Copy subject" style={{ marginLeft: 8 }} onClick={() => copyToClipboard(msg.subject || '', 'Subject')}>
            <i className="bi bi-clipboard" />
          </button>
        </div>
        <div className="msg-detail-meta">
          <AddressRow label="From" value={msg.from} />
          <AddressRow label="To" value={msg.to} />
          {msg.cc && <AddressRow label="CC" value={msg.cc} />}
          <div className="msg-detail-date">{msg.dateFull || msg.date}</div>
        </div>
      </div>

      {/* Body / Source */}
      <div className="msg-detail-body" onClick={() => { setShowMoveDropdown(false); setShowMoreMenu(false) }}>
        {showSource ? (
          <pre className="msg-source-view">{JSON.stringify({
            uid: msg.uid,
            messageId: msg.messageId,
            inReplyTo: msg.inReplyTo,
            references: msg.references,
            threadKey: msg.threadKey,
            from: msg.from,
            to: msg.to,
            cc: msg.cc,
            subject: msg.subject,
            date: msg.dateFull || msg.date,
            hasAttachments: (msg.attachments || []).length > 0,
          }, null, 2)}</pre>
        ) : msg.htmlBody ? (
          <iframe
            ref={iframeRef}
            className="msg-body-iframe"
            sandbox="allow-same-origin allow-popups"
            title="Message body"
          />
        ) : (
          <div className="msg-body-text">{msg.textBody}</div>
        )}
      </div>

      {/* Attachments */}
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="msg-attachments">
          <div className="msg-attach-title">
            <i className="bi bi-paperclip" style={{ marginRight: 4 }} />
            {msg.attachments.length} Attachment{msg.attachments.length > 1 ? 's' : ''}
          </div>
          <div className="attach-list">
            {msg.attachments.map((att: Attachment) => (
              <a
                key={att.part}
                href={getAttachmentUrl(msg.uid, att.part, msg.folder || currentFolder)}
                className="attach-item"
                target="_blank"
                rel="noopener noreferrer"
                download={att.name}
              >
                <i className={`bi ${getAttachIcon(att.mimeType)}`} />
                <span>{att.name}</span>
                <span className="attach-size">{formatFileSize(att.size)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Inline quick-reply */}
      <div className="quick-reply">
        {!replyOpen ? (
          <div className="quick-reply-cta">
            <button className="btn-ghost" onClick={() => { if (!requireOwnerSession()) return; setReplyOpen(true); setReplyMode('reply') }}>
              <i className="bi bi-reply" /> Reply
            </button>
            <button className="btn-ghost" onClick={() => { if (!requireOwnerSession()) return; setReplyOpen(true); setReplyMode('replyall') }}>
              <i className="bi bi-reply-all" /> Reply all
            </button>
            <button className="btn-ghost" onClick={() => requireOwnerSession() && composeRef?.current?.open('forward', msg as MessageDetailType)}>
              <i className="bi bi-forward" /> Forward
            </button>
          </div>
        ) : (
          <div className="quick-reply-form">
            <div className="quick-reply-head">
              <span className="quick-reply-label">
                <i className={`bi ${replyMode === 'replyall' ? 'bi-reply-all' : 'bi-reply'}`} />
                {replyMode === 'replyall' ? 'Reply all to' : 'Reply to'} <b>{extractEmail(msg.from) || msg.from}</b>
              </span>
              <button
                className="icon-btn"
                title="Open full compose"
                onClick={() => {
                  if (!requireOwnerSession()) return
                  // Carry over any typed text into the full compose modal
                  composeRef?.current?.open(replyMode, msg as MessageDetailType)
                  setReplyOpen(false)
                }}
              >
                <i className="bi bi-arrows-angle-expand" />
              </button>
              <button className="icon-btn" title="Discard" onClick={() => { setReplyOpen(false); setReplyText('') }}>
                <i className="bi bi-x" />
              </button>
            </div>
            <textarea
              className="quick-reply-textarea"
              placeholder="Type your reply…  (Ctrl+Enter to send)"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handleQuickReplySend()
                }
              }}
              rows={4}
              autoFocus
            />
            <div className="quick-reply-actions">
              <button
                className="btn-primary"
                onClick={handleQuickReplySend}
                disabled={sendingReply || !replyText.trim()}
              >
                {sendingReply ? (
                  <><span className="spinner" style={{ width: 12, height: 12 }} /> Sending…</>
                ) : (
                  <><i className="bi bi-send" /> Send</>
                )}
              </button>
              <span className="quick-reply-hint">Press Ctrl+Enter to send</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
