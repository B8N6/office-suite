import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, type DragEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { useQuery, useMutation } from '@tanstack/react-query'
import { sendMessage, createScheduled, getSignature } from '../../api/client'
import { useMailStore } from '../../store/mailStore'
import { toast } from '../../hooks/useToast'
import { addHours, addDays, nextMonday, setHours, setMinutes, format } from 'date-fns'
import type { MessageDetail } from '../../types'

export interface ComposeHandle {
  open: (type: 'new' | 'reply' | 'replyall' | 'forward', refMsg?: MessageDetail) => void
}

const MAX_FILE_SIZE = 25 * 1024 * 1024

function TagInput({
  tags,
  onChange,
  placeholder,
  field,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  field?: string
}) {
  const [input, setInput] = useState('')

  const addTag = (value: string) => {
    const parts = value.split(/[,;\s]+/).filter((v) => v.includes('@'))
    const newTags = [...tags]
    for (const part of parts) {
      if (part && !newTags.includes(part)) newTags.push(part)
    }
    onChange(newTags)
    setInput('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') {
      e.preventDefault()
      if (input.trim()) addTag(input.trim())
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    addTag(text)
  }

  return (
    <div className="tag-input-wrap" data-field={field}>
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button onClick={() => onChange(tags.filter((t) => t !== tag))}>
            <i className="bi bi-x" />
          </button>
        </span>
      ))}
      <input
        className="tag-input-inner"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => { if (input.trim()) addTag(input.trim()) }}
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  )
}

const ComposeModal = forwardRef<ComposeHandle>((_, ref) => {
  const { composeOpen, setComposeOpen } = useMailStore()
  const [mode, setMode] = useState<'new' | 'reply' | 'replyall' | 'forward'>('new')
  const [minimized, setMinimized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [to, setTo] = useState<string[]>([])
  const [cc, setCc] = useState<string[]>([])
  const [bcc, setBcc] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [sending, setSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [refMsgId, setRefMsgId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: sigData } = useQuery({
    queryKey: ['signature'],
    queryFn: () => getSignature().then((r) => r.data),
    enabled: composeOpen,
  })

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle],
    content: '',
  })

  const resetForm = useCallback(() => {
    setTo([])
    setCc([])
    setBcc([])
    setSubject('')
    setAttachments([])
    setShowCc(false)
    setShowBcc(false)
    setShowSchedule(false)
    setScheduleAt('')
    setMinimized(false)
    setRefMsgId('')
    editor?.commands.setContent('')
  }, [editor])

  useImperativeHandle(ref, () => ({
    open: (type, refMsg?: MessageDetail) => {
      resetForm()
      setMode(type)
      setComposeOpen(true)
      setMinimized(false)

      if (type === 'reply' && refMsg) {
        const fromEmail = refMsg.from.match(/<(.+?)>/)?.at(1) || refMsg.from
        setTo([fromEmail])
        setSubject(`Re: ${refMsg.subject?.replace(/^Re: /i, '')}`)
        setRefMsgId(refMsg.messageId || '')
        const quoted = `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#666">
          <p><strong>From:</strong> ${refMsg.from}<br><strong>Date:</strong> ${refMsg.dateFull || refMsg.date}</p>
          ${refMsg.htmlBody || `<pre>${refMsg.textBody}</pre>`}
        </blockquote>`
        const sig = sigData?.enabled ? `<br><br>-- <br>${sigData.html}` : ''
        editor?.commands.setContent(sig + quoted)
      } else if (type === 'replyall' && refMsg) {
        const fromEmail = refMsg.from.match(/<(.+?)>/)?.at(1) || refMsg.from
        setTo([fromEmail])
        const ccList = refMsg.cc ? refMsg.cc.split(',').map((s) => s.trim()).filter(Boolean) : []
        setCc(ccList)
        if (ccList.length > 0) setShowCc(true)
        setSubject(`Re: ${refMsg.subject?.replace(/^Re: /i, '')}`)
        setRefMsgId(refMsg.messageId || '')
        const quoted = `<br><br><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#666">
          ${refMsg.htmlBody || `<pre>${refMsg.textBody}</pre>`}
        </blockquote>`
        const sig = sigData?.enabled ? `<br><br>-- <br>${sigData.html}` : ''
        editor?.commands.setContent(sig + quoted)
      } else if (type === 'forward' && refMsg) {
        setSubject(`Fwd: ${refMsg.subject?.replace(/^Fwd: /i, '')}`)
        const fwdHdr = `<br><br>---------- Forwarded message ----------<br>
          <strong>From:</strong> ${refMsg.from}<br>
          <strong>Date:</strong> ${refMsg.dateFull || refMsg.date}<br>
          <strong>Subject:</strong> ${refMsg.subject}<br>
          <strong>To:</strong> ${refMsg.to}<br><br>
          ${refMsg.htmlBody || `<pre>${refMsg.textBody}</pre>`}`
        const sig = sigData?.enabled ? `<br><br>-- <br>${sigData.html}` : ''
        editor?.commands.setContent(sig + fwdHdr)
      } else {
        const sig = sigData?.enabled ? `<br><br>-- <br>${sigData.html}` : ''
        if (sig) editor?.commands.setContent(sig)
      }
    },
  }))

  // Keyboard shortcut: c = compose new
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'c' && !composeOpen &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !(document.activeElement as HTMLElement)?.isContentEditable) {
        setComposeOpen(true)
        setMode('new')
        resetForm()
        if (sigData?.enabled) editor?.commands.setContent(`<br><br>-- <br>${sigData.html}`)
      }
      if (e.key === 'Escape' && composeOpen && !minimized) {
        // If compose has any content, minimize to bottom bar instead of discarding
        const hasContent =
          to.length > 0 || cc.length > 0 || bcc.length > 0 ||
          subject.trim().length > 0 || (editor?.getText().trim().length || 0) > 0
        if (hasContent) {
          setMinimized(true)
        } else {
          setComposeOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [composeOpen, minimized, setComposeOpen, setMode, editor, sigData, resetForm, to, cc, bcc, subject])

  const sendMut = useMutation({
    mutationFn: async (scheduled?: string) => {
      const html = editor?.getHTML() || ''
      if (scheduled) {
        await createScheduled({
          to: to.join(', '),
          cc: cc.join(', '),
          bcc: bcc.join(', '),
          subject,
          body: html,
          scheduledAt: scheduled,
          inReplyTo: refMsgId,
        })
      } else {
        const fd = new FormData()
        fd.append('to', to.join(', '))
        fd.append('cc', cc.join(', '))
        fd.append('bcc', bcc.join(', '))
        fd.append('subject', subject)
        fd.append('html', html)
        if (refMsgId) fd.append('inReplyTo', refMsgId)
        attachments.forEach((f) => fd.append('attachments', f))
        await sendMessage(fd)
      }
    },
    onSuccess: (_, scheduled) => {
      toast(scheduled ? 'Message scheduled' : 'Message sent', 'success')
      setComposeOpen(false)
      resetForm()
    },
    onError: () => toast('Failed to send message', 'error'),
  })

  const handleSend = async () => {
    if (to.length === 0) { toast('Please add at least one recipient', 'error'); return }
    setSending(true)
    try { await sendMut.mutateAsync(undefined) } finally { setSending(false) }
  }

  const handleScheduleSend = async () => {
    if (!scheduleAt) { toast('Please select a scheduled time', 'error'); return }
    if (to.length === 0) { toast('Please add at least one recipient', 'error'); return }
    setSending(true)
    try { await sendMut.mutateAsync(new Date(scheduleAt).toISOString()) } finally { setSending(false) }
  }

  const handleSaveDraft = async () => {
    const html = editor?.getHTML() || ''
    if (to.length === 0 && !subject && !html.replace(/<[^>]*>/g, '').trim()) {
      toast('Nothing to save', 'error'); return
    }
    setSavingDraft(true)
    try {
      const fd = new FormData()
      fd.append('to', to.join(', '))
      fd.append('cc', cc.join(', '))
      fd.append('bcc', bcc.join(', '))
      fd.append('subject', subject)
      fd.append('html', html)
      fd.append('draft', 'true')
      if (refMsgId) fd.append('inReplyTo', refMsgId)
      attachments.forEach((f) => fd.append('attachments', f))
      await sendMessage(fd)
      toast('Draft saved', 'success')
      setComposeOpen(false)
      resetForm()
    } catch (e) {
      toast('Failed to save draft', 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_SIZE) { toast(`${f.name} exceeds 25MB limit`, 'error'); return false }
      return true
    })
    setAttachments((prev) => [...prev, ...valid])
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const setSchedulePreset = (preset: string) => {
    const now = new Date()
    let dt: Date
    if (preset === '1h') dt = addHours(now, 1)
    else if (preset === '3h') dt = addHours(now, 3)
    else if (preset === 'tomorrow') dt = setMinutes(setHours(addDays(now, 1), 9), 0)
    else dt = setMinutes(setHours(nextMonday(now), 9), 0)
    setScheduleAt(format(dt, "yyyy-MM-dd'T'HH:mm"))
  }

  if (!composeOpen) return null

  const titleMap = { new: 'NEW MESSAGE', reply: 'REPLY', replyall: 'REPLY ALL', forward: 'FORWARD' }

  return (
    <div
      className={`compose-modal ${minimized ? 'minimized' : ''} ${fullscreen ? 'fullscreen' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      style={isDragging ? { borderColor: 'var(--yl)' } : undefined}
    >
      {/* Header */}
      <div className="compose-header" onDoubleClick={() => setMinimized((v) => !v)}>
        <span className="compose-title">{titleMap[mode]}</span>
        <div className="compose-header-btns">
          <button className="icon-btn" title="Minimize" onClick={() => setMinimized((v) => !v)}>
            <i className={`bi bi-dash`} />
          </button>
          <button className="icon-btn" title="Fullscreen" onClick={() => setFullscreen((v) => !v)}>
            <i className={`bi ${fullscreen ? 'bi-fullscreen-exit' : 'bi-fullscreen'}`} />
          </button>
          <button className="icon-btn" title="Discard" onClick={() => { setComposeOpen(false); resetForm() }}>
            <i className="bi bi-x" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="compose-body">
        <div className="compose-fields">
          {/* To */}
          <div className="compose-field">
            <span className="compose-field-label">To</span>
            <TagInput tags={to} onChange={setTo} placeholder="recipients..." field="to" />
            <button className="icon-btn" title="Add CC" onClick={() => setShowCc((v) => !v)} style={{ fontSize: 12 }}>CC</button>
            <button className="icon-btn" title="Add BCC" onClick={() => setShowBcc((v) => !v)} style={{ fontSize: 12 }}>BCC</button>
          </div>

          {/* CC */}
          {showCc && (
            <div className="compose-field">
              <span className="compose-field-label">CC</span>
              <TagInput tags={cc} onChange={setCc} placeholder="cc..." field="cc" />
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="compose-field">
              <span className="compose-field-label">BCC</span>
              <TagInput tags={bcc} onChange={setBcc} placeholder="bcc..." field="bcc" />
            </div>
          )}

          {/* Subject */}
          <div className="compose-field">
            <span className="compose-field-label">Subj</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject..."
            />
          </div>
        </div>

        {/* Editor toolbar */}
        <div className="compose-toolbar-editor">
          <button
            className={`editor-btn ${editor?.isActive('bold') ? 'is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
            title="Bold"
          ><strong>B</strong></button>
          <button
            className={`editor-btn ${editor?.isActive('italic') ? 'is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run() }}
            title="Italic"
          ><em>I</em></button>
          <button
            className={`editor-btn ${editor?.isActive('underline') ? 'is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run() }}
            title="Underline"
          ><u>U</u></button>
          <div style={{ width: 1, height: 18, background: 'var(--bd)', margin: '0 4px' }} />
          <button
            className={`editor-btn ${editor?.isActive('bulletList') ? 'is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run() }}
            title="Bullet List"
          ><i className="bi bi-list-ul" /></button>
          <button
            className={`editor-btn ${editor?.isActive('orderedList') ? 'is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run() }}
            title="Ordered List"
          ><i className="bi bi-list-ol" /></button>
          <button
            className={`editor-btn ${editor?.isActive('blockquote') ? 'is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run() }}
            title="Blockquote"
          ><i className="bi bi-quote" /></button>
          <div style={{ width: 1, height: 18, background: 'var(--bd)', margin: '0 4px' }} />
          <button
            className="editor-btn"
            onMouseDown={(e) => {
              e.preventDefault()
              const url = prompt('Enter URL:')
              if (url) editor?.chain().focus().setLink({ href: url }).run()
            }}
            title="Link"
          ><i className="bi bi-link-45deg" /></button>
          <button
            className="editor-btn"
            onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().clearNodes().unsetAllMarks().run() }}
            title="Clear formatting"
          ><i className="bi bi-eraser" /></button>
        </div>

        {/* Editor */}
        <div className="compose-editor">
          <EditorContent editor={editor} />
        </div>

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="attach-preview-list">
            {attachments.map((f, i) => (
              <div key={i} className="attach-preview-item">
                <i className="bi bi-paperclip" />
                <span>{f.name}</span>
                <span style={{ color: 'var(--dim)', fontSize: 11 }}>
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  className="icon-btn"
                  style={{ width: 16, height: 16, fontSize: 12 }}
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                >
                  <i className="bi bi-x" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Schedule panel */}
        {showSchedule && (
          <div className="schedule-panel">
            <div className="schedule-panel-title">Schedule Send</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="datetime-local"
                className="form-input"
                style={{ flex: 1, minWidth: 180 }}
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
              <button className="btn-primary" onClick={handleScheduleSend} disabled={sending}>
                <i className="bi bi-clock" /> Schedule
              </button>
            </div>
            <div className="schedule-presets">
              <button onClick={() => setSchedulePreset('1h')}>In 1 hour</button>
              <button onClick={() => setSchedulePreset('3h')}>In 3 hours</button>
              <button onClick={() => setSchedulePreset('tomorrow')}>Tomorrow 9am</button>
              <button onClick={() => setSchedulePreset('nextweek')}>Next Monday 9am</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="compose-footer">
          <div className="compose-footer-left">
            <button className="btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? (
                <><span className="spinner" style={{ width: 12, height: 12 }} /> Sending...</>
              ) : (
                <><i className="bi bi-send" /> Send</>
              )}
            </button>
            <button className="btn-ghost" onClick={handleSaveDraft} disabled={savingDraft}>
              {savingDraft ? (
                <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving...</>
              ) : (
                <><i className="bi bi-save" /> Draft</>
              )}
            </button>
          </div>
          <div className="compose-footer-right">
            <button
              className={`icon-btn ${showSchedule ? 'active' : ''}`}
              title="Schedule send"
              onClick={() => setShowSchedule((v) => !v)}
            >
              <i className="bi bi-clock" />
            </button>
            <button
              className="icon-btn"
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="bi bi-paperclip" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              className="icon-btn"
              title="Discard"
              style={{ color: 'var(--red)' }}
              onClick={() => { setComposeOpen(false); resetForm() }}
            >
              <i className="bi bi-trash3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

ComposeModal.displayName = 'ComposeModal'
export default ComposeModal
