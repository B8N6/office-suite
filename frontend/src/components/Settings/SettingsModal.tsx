import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  getSignature, saveSignature, getScheduled, deleteScheduled,
  getFilters, createFilter, updateFilter, deleteFilter, applyFilters,
  getFolders, createFolder, deleteFolder, updateName
} from '../../api/client'
import { useMailStore } from '../../store/mailStore'
import { toast } from '../../hooks/useToast'
import { useNotifications } from '../../hooks/useNotifications'
import SupportTab from './SupportTab'
import type { FilterRule, FilterCondition, FilterAction, ScheduledJob } from '../../types'

type Tab = 'signature' | 'account' | 'schedule' | 'filters' | 'support'

const BLANK_CONDITION: FilterCondition = { field: 'from', op: 'contains', value: '' }
const BLANK_ACTION: FilterAction = { type: 'read' }

interface NewFilter {
  name: string
  logic: 'all' | 'any'
  conditions: FilterCondition[]
  actions: FilterAction[]
}

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, setName, name: currentName, email: currentEmail } = useMailStore()
  const [tab, setTab] = useState<Tab>('signature')
  const queryClient = useQueryClient()
  const notif = useNotifications()

  // Signature
  const [sigEnabled, setSigEnabled] = useState(false)
  const [sigDisplayName, setSigDisplayName] = useState('')
  const sigEditor = useEditor({ extensions: [StarterKit], content: '' })

  // Account
  const [newDisplayName, setNewDisplayName] = useState('')

  // New folder
  const [newFolderName, setNewFolderName] = useState('')

  // Filter builder
  const [editingFilter, setEditingFilter] = useState<FilterRule | null>(null)
  const [newFilter, setNewFilter] = useState<NewFilter>({
    name: '', logic: 'all',
    conditions: [{ ...BLANK_CONDITION }],
    actions: [{ ...BLANK_ACTION }],
  })
  const [showNewFilter, setShowNewFilter] = useState(false)

  const { data: sigData } = useQuery({
    queryKey: ['signature'],
    queryFn: () => getSignature().then((r) => r.data),
    enabled: settingsOpen,
  })

  const { data: scheduledData } = useQuery({
    queryKey: ['scheduled'],
    queryFn: () => getScheduled().then((r) => r.data),
    enabled: settingsOpen && tab === 'schedule',
  })

  const { data: filtersData } = useQuery({
    queryKey: ['filters'],
    queryFn: () => getFilters().then((r) => r.data),
    enabled: settingsOpen && tab === 'filters',
  })

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => getFolders().then((r) => r.data),
    enabled: settingsOpen && tab === 'filters',
  })

  useEffect(() => {
    if (sigData) {
      setSigEnabled(sigData.enabled)
      setSigDisplayName(sigData.name || '')
      sigEditor?.commands.setContent(sigData.html || '')
    }
  }, [sigData, sigEditor])

  // Prefill display name field whenever settings modal opens
  useEffect(() => {
    if (settingsOpen) {
      setNewDisplayName(currentName || currentEmail.split('@')[0] || '')
    }
  }, [settingsOpen, currentName, currentEmail])

  const saveSigMut = useMutation({
    mutationFn: () => saveSignature({ html: sigEditor?.getHTML() || '', enabled: sigEnabled, name: sigDisplayName }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['signature'] }); toast('Signature saved', 'success') },
    onError: () => toast('Failed to save signature', 'error'),
  })

  const updateNameMut = useMutation({
    mutationFn: () => {
      const trimmed = newDisplayName.trim()
      if (!trimmed) throw new Error('Name cannot be empty')
      return updateName(trimmed)
    },
    onSuccess: () => {
      const trimmed = newDisplayName.trim()
      setName(trimmed)
      // Sync the saved account's name too
      const { accounts, saveAccount } = useMailStore.getState()
      const existing = accounts.find((a) => a.email === currentEmail)
      if (existing) saveAccount({ ...existing, name: trimmed })
      toast('Name updated', 'success')
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: string } }; message?: string }
      toast(ax.response?.data?.error || ax.message || 'Failed to update name', 'error')
    },
  })

  const deleteScheduledMut = useMutation({
    mutationFn: (id: string) => deleteScheduled(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scheduled'] }); toast('Scheduled email cancelled', 'success') },
    onError: () => toast('Failed to cancel', 'error'),
  })

  const createFilterMut = useMutation({
    mutationFn: (data: NewFilter) => createFilter(data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] })
      setShowNewFilter(false)
      setNewFilter({ name: '', logic: 'all', conditions: [{ ...BLANK_CONDITION }], actions: [{ ...BLANK_ACTION }] })
      toast('Filter created', 'success')
    },
    onError: () => toast('Failed to create filter', 'error'),
  })

  const updateFilterMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FilterRule> }) => updateFilter(id, data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] })
      setEditingFilter(null)
      toast('Filter updated', 'success')
    },
    onError: () => toast('Failed to update filter', 'error'),
  })

  const deleteFilterMut = useMutation({
    mutationFn: (id: string) => deleteFilter(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['filters'] }); toast('Filter deleted', 'success') },
    onError: () => toast('Failed to delete filter', 'error'),
  })

  const applyFiltersMut = useMutation({
    mutationFn: () => applyFilters(),
    onSuccess: () => toast('Filters applied', 'success'),
    onError: () => toast('Failed to apply filters', 'error'),
  })

  const createFolderMut = useMutation({
    mutationFn: (name: string) => createFolder(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      setNewFolderName('')
      toast('Folder created', 'success')
    },
    onError: () => toast('Failed to create folder', 'error'),
  })

  const deleteFolderMut = useMutation({
    mutationFn: (name: string) => deleteFolder(name),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['folders'] }); toast('Folder deleted', 'success') },
    onError: () => toast('Failed to delete folder', 'error'),
  })

  if (!settingsOpen) return null

  const renderFilterEditor = (filter: NewFilter, setFilter: (f: NewFilter) => void, onSave: () => void, onCancel: () => void) => (
    <div style={{ background: 'var(--bk)', border: '1px solid var(--bd)', borderRadius: 2, padding: 12, marginTop: 10 }}>
      <div className="form-group">
        <label className="form-label">Rule Name</label>
        <input className="form-input" value={filter.name} onChange={(e) => setFilter({ ...filter, name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">Match</label>
        <select className="form-input" value={filter.logic} onChange={(e) => setFilter({ ...filter, logic: e.target.value as 'all' | 'any' })}>
          <option value="all">All conditions</option>
          <option value="any">Any condition</option>
        </select>
      </div>

      <label className="form-label">Conditions</label>
      <div className="filter-conditions" style={{ marginBottom: 12 }}>
        {filter.conditions.map((cond, i) => (
          <div key={i} className="filter-condition-row">
            <select value={cond.field} onChange={(e) => {
              const c = [...filter.conditions]; c[i] = { ...c[i], field: e.target.value as FilterCondition['field'] }; setFilter({ ...filter, conditions: c })
            }}>
              <option value="from">From</option>
              <option value="to">To</option>
              <option value="subject">Subject</option>
            </select>
            <select value={cond.op} onChange={(e) => {
              const c = [...filter.conditions]; c[i] = { ...c[i], op: e.target.value as FilterCondition['op'] }; setFilter({ ...filter, conditions: c })
            }}>
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="startsWith">starts with</option>
              <option value="endsWith">ends with</option>
            </select>
            <input
              type="text"
              value={cond.value}
              placeholder="value..."
              style={{ flex: 1 }}
              onChange={(e) => {
                const c = [...filter.conditions]; c[i] = { ...c[i], value: e.target.value }; setFilter({ ...filter, conditions: c })
              }}
            />
            <button className="icon-btn" onClick={() => setFilter({ ...filter, conditions: filter.conditions.filter((_, j) => j !== i) })}>
              <i className="bi bi-x" />
            </button>
          </div>
        ))}
        <button className="btn-ghost" style={{ marginTop: 4 }} onClick={() => setFilter({ ...filter, conditions: [...filter.conditions, { ...BLANK_CONDITION }] })}>
          <i className="bi bi-plus" /> Add condition
        </button>
      </div>

      <label className="form-label">Actions</label>
      <div className="filter-actions-list" style={{ marginBottom: 12 }}>
        {filter.actions.map((action, i) => (
          <div key={i} className="filter-action-row">
            <select value={action.type} onChange={(e) => {
              const a = [...filter.actions]; a[i] = { ...a[i], type: e.target.value as FilterAction['type'] }; setFilter({ ...filter, actions: a })
            }}>
              <option value="read">Mark as read</option>
              <option value="star">Star</option>
              <option value="move">Move to folder</option>
              <option value="delete">Delete</option>
            </select>
            {action.type === 'move' && (
              <select value={action.target || ''} onChange={(e) => {
                const a = [...filter.actions]; a[i] = { ...a[i], target: e.target.value }; setFilter({ ...filter, actions: a })
              }}>
                <option value="">-- select folder --</option>
                {(foldersData?.folders || []).map((f) => (
                  <option key={f.name} value={f.name}>{f.label}</option>
                ))}
              </select>
            )}
            <button className="icon-btn" onClick={() => setFilter({ ...filter, actions: filter.actions.filter((_, j) => j !== i) })}>
              <i className="bi bi-x" />
            </button>
          </div>
        ))}
        <button className="btn-ghost" style={{ marginTop: 4 }} onClick={() => setFilter({ ...filter, actions: [...filter.actions, { ...BLANK_ACTION }] })}>
          <i className="bi bi-plus" /> Add action
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={onSave}><i className="bi bi-check" /> Save</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-header-title">SETTINGS</span>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)}><i className="bi bi-x" /></button>
        </div>

        <div className="settings-tabs">
          {(['signature', 'account', 'schedule', 'filters', 'support'] as Tab[]).map((t) => (
            <button key={t} className={`settings-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {/* ===== SIGNATURE ===== */}
          {tab === 'signature' && (
            <div>
              <div className="form-group">
                <label className="toggle">
                  <input type="checkbox" checked={sigEnabled} onChange={(e) => setSigEnabled(e.target.checked)} />
                  <span className="toggle-slider" />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Enable signature</span>
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="form-input" value={sigDisplayName} onChange={(e) => setSigDisplayName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Signature HTML</label>
                <div style={{ background: '#fff', border: '1px solid var(--bd)', borderRadius: 2, minHeight: 120, padding: 8 }}>
                  <EditorContent editor={sigEditor} />
                </div>
              </div>
              <button className="btn-primary" onClick={() => saveSigMut.mutate()}>
                <i className="bi bi-check" /> Save Signature
              </button>
            </div>
          )}

          {/* ===== ACCOUNT ===== */}
          {tab === 'account' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', marginBottom: 12 }}>
                  PASSWORD
                </div>
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(245, 196, 0, 0.05)',
                  border: '1px solid var(--bd)',
                  color: 'var(--dim)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  clipPath: 'var(--clip-md)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start'
                }}>
                  <i className="bi bi-info-circle" style={{ color: 'var(--yl)', fontSize: 18, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    Passwords are managed by your mail server. To change yours, please contact your domain administrator.
                    <div style={{ fontFamily: 'Share Tech Mono, monospace', fontSize: 11, color: 'var(--dim2)', marginTop: 6, letterSpacing: '.05em' }}>
                      DOMAIN: {currentEmail.split('@')[1] || '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 20 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', marginBottom: 12 }}>
                  DISPLAY NAME
                </div>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Your display name" />
                </div>
                <button className="btn-primary" onClick={() => updateNameMut.mutate()}>
                  <i className="bi bi-person" /> Update Name
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 20, marginTop: 20 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', marginBottom: 12 }}>
                  NOTIFICATIONS
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className={`btn-ghost ${notif.active ? 'active' : ''}`}
                    onClick={notif.toggle}
                    style={{ color: notif.active ? 'var(--yl)' : notif.permission === 'denied' ? 'var(--red)' : undefined }}
                  >
                    <i className={`bi ${notif.active ? 'bi-bell-fill' : 'bi-bell-slash'}`} />
                    {notif.permission === 'denied' ? 'Blocked by browser' :
                     notif.permission === 'default' ? 'Enable notifications' :
                     notif.active ? 'Enabled — click to mute' : 'Muted — click to enable'}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', letterSpacing: '.1em' }}>
                    {notif.active ? '● ACTIVE' : notif.permission === 'denied' ? '● BLOCKED' : '○ OFF'}
                  </span>
                </div>
                {notif.permission === 'denied' && (
                  <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>
                    To re-enable: click the padlock/info icon in your browser's address bar → Site settings → allow Notifications.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== SCHEDULE ===== */}
          {tab === 'schedule' && (
            <div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', marginBottom: 12 }}>
                SCHEDULED EMAILS
              </div>
              {(scheduledData?.jobs || []).length === 0 ? (
                <div className="empty-state">
                  <i className="bi bi-clock" />
                  <p>No scheduled emails</p>
                </div>
              ) : (
                <div>
                  {(scheduledData?.jobs || []).map((job: ScheduledJob) => (
                    <div key={job.id} style={{ background: 'var(--bk4)', border: '1px solid var(--bd)', borderRadius: 2, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{job.subject}</div>
                          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>To: {job.to}</div>
                          <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 4, fontFamily: 'Share Tech Mono' }}>
                            Scheduled: {job.scheduledAt}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Status: {job.status}</div>
                        </div>
                        <button className="btn-danger" onClick={() => deleteScheduledMut.mutate(job.id)}>
                          <i className="bi bi-x" /> Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== FILTERS ===== */}
          {tab === 'filters' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)' }}>FILTER RULES</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => applyFiltersMut.mutate()}>
                    <i className="bi bi-play" /> Apply All
                  </button>
                  <button className="btn-primary" onClick={() => setShowNewFilter(true)}>
                    <i className="bi bi-plus" /> New Rule
                  </button>
                </div>
              </div>

              {showNewFilter && renderFilterEditor(newFilter, setNewFilter, () => createFilterMut.mutate(newFilter), () => setShowNewFilter(false))}

              {(filtersData?.filters || []).map((rule: FilterRule) => (
                <div key={rule.id} className="filter-rule">
                  <div className="filter-rule-header">
                    <span className="filter-rule-name">{rule.name}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateFilterMut.mutate({ id: rule.id, data: { enabled: e.target.checked } })}
                        />
                        <span className="toggle-slider" />
                      </label>
                      <button className="icon-btn" onClick={() => setEditingFilter(rule)}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => deleteFilterMut.mutate(rule.id)}>
                        <i className="bi bi-trash3" />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                    {rule.conditions.length} condition{rule.conditions.length > 1 ? 's' : ''} · {rule.actions.length} action{rule.actions.length > 1 ? 's' : ''}
                  </div>
                  {editingFilter?.id === rule.id && renderFilterEditor(
                    editingFilter as unknown as NewFilter,
                    (f) => setEditingFilter({ ...rule, ...f }),
                    () => updateFilterMut.mutate({ id: rule.id, data: editingFilter as unknown as Record<string, unknown> }),
                    () => setEditingFilter(null)
                  )}
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 20, marginTop: 20 }}>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', marginBottom: 12 }}>
                  CUSTOM FOLDERS
                </div>
                <div style={{ marginBottom: 12 }}>
                  {(foldersData?.folders || [])
                    .filter((f) => !['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive', 'Starred'].includes(f.name))
                    .map((f) => (
                      <div key={f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
                        <span style={{ fontSize: 14 }}><i className="bi bi-folder" style={{ marginRight: 6 }} />{f.label}</span>
                        <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => deleteFolderMut.mutate(f.name)}>
                          <i className="bi bi-trash3" />
                        </button>
                      </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    placeholder="New folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && newFolderName && createFolderMut.mutate(newFolderName)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn-primary" onClick={() => newFolderName && createFolderMut.mutate(newFolderName)}>
                    <i className="bi bi-plus" /> Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'support' && <SupportTab />}
        </div>
      </div>
    </div>
  )
}
