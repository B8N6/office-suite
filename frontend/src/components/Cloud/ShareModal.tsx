import { useState, useEffect } from 'react'
import type { CloudFile, CloudAccessMode } from '../../api/client'

interface Props {
  file: CloudFile
  onClose: () => void
  onSave: (mode: CloudAccessMode, emails: string[]) => void
  saving: boolean
}

/**
 * Modal that lets the owner pick an access mode for a file:
 *  - Private  — only owner
 *  - Emails   — specific users (they must be logged in to download)
 *  - Domain   — anyone on the owner's email domain (logged in)
 *  - Public   — anonymous link, no login required
 */
export default function ShareModal({ file, onClose, onSave, saving }: Props) {
  const [mode, setMode] = useState<CloudAccessMode>(file.accessMode || 'private')
  const [emails, setEmails] = useState<string[]>(file.allowedEmails || [])
  const [emailInput, setEmailInput] = useState('')

  // Reset when modal swaps to a different file
  useEffect(() => {
    setMode(file.accessMode || 'private')
    setEmails(file.allowedEmails || [])
    setEmailInput('')
  }, [file.id, file.accessMode, file.allowedEmails])

  const addEmail = () => {
    const parts = emailInput.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    const valid = parts.filter((p) => p.includes('@') && !emails.includes(p.toLowerCase()))
    if (valid.length === 0) { setEmailInput(''); return }
    setEmails([...emails, ...valid.map((e) => e.toLowerCase())])
    setEmailInput('')
  }

  const removeEmail = (e: string) => setEmails(emails.filter((x) => x !== e))

  const ownerDomain = file.ownerEmail.split('@')[1] || ''

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <div>
            <div className="share-modal-title">Share file</div>
            <div className="share-modal-subtitle">{file.name}</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="share-modal-body">
          {/* Access mode radio cards */}
          <div className="share-options">
            <ShareOption
              active={mode === 'private'}
              icon="bi-lock-fill"
              title="Private"
              desc="Only you can access this file."
              onClick={() => setMode('private')}
            />
            <ShareOption
              active={mode === 'emails'}
              icon="bi-person-lines-fill"
              title="Specific emails"
              desc="Only the people you list below (logged in)."
              onClick={() => setMode('emails')}
            />
            <ShareOption
              active={mode === 'domain'}
              icon="bi-globe2"
              title={`Anyone on @${ownerDomain || 'your domain'}`}
              desc="Users logged into this domain can download."
              onClick={() => setMode('domain')}
            />
            <ShareOption
              active={mode === 'public'}
              icon="bi-link-45deg"
              title="Public link"
              desc="Anyone with the link — no login needed."
              onClick={() => setMode('public')}
            />
          </div>

          {/* Email list editor — only shown when mode=emails */}
          {mode === 'emails' && (
            <div className="share-email-editor">
              <label className="form-label">Allowed email addresses</label>
              <div className="share-email-chips">
                {emails.length === 0 && (
                  <span className="share-empty-hint">No recipients yet</span>
                )}
                {emails.map((e) => (
                  <span key={e} className="share-chip">
                    {e}
                    <button onClick={() => removeEmail(e)} title="Remove">
                      <i className="bi bi-x" />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="form-input"
                  placeholder="user@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault()
                      addEmail()
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button className="btn-ghost" onClick={addEmail}>
                  <i className="bi bi-plus" /> Add
                </button>
              </div>
              <div className="share-hint">
                Recipients must have an account on this mail server to log in and download.
              </div>
            </div>
          )}

          {/* Public link preview */}
          {mode === 'public' && file.shareToken && (
            <div className="share-link-box">
              <label className="form-label">Public link</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="form-input"
                  readOnly
                  value={window.location.origin + '/p/' + file.shareToken}
                  style={{ flex: 1 }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  className="btn-ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.origin + '/p/' + file.shareToken)
                  }}
                >
                  <i className="bi bi-clipboard" /> Copy
                </button>
              </div>
              <div className="share-hint">
                Anyone with this link can download without logging in. Revoke by switching to another access mode.
              </div>
            </div>
          )}
        </div>

        <div className="share-modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => onSave(mode, emails)}
            disabled={saving || (mode === 'emails' && emails.length === 0)}
          >
            {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : <><i className="bi bi-check" /> Apply</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ShareOption({ active, icon, title, desc, onClick }: {
  active: boolean
  icon: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      className={`share-option ${active ? 'active' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="share-option-icon">
        <i className={`bi ${icon}`} />
      </div>
      <div className="share-option-text">
        <div className="share-option-title">{title}</div>
        <div className="share-option-desc">{desc}</div>
      </div>
      <div className="share-option-radio">
        <i className={`bi ${active ? 'bi-check-circle-fill' : 'bi-circle'}`} />
      </div>
    </button>
  )
}
