import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  adminGetDomains, adminCreateDomain, adminUpdateDomain,
  adminDeleteDomain, adminGetMe,
  getBranding, adminUpdateBranding, type Branding,
  adminListUsers, adminCreateUser, adminUpdateUser, adminDeleteUser, type AdminUser,
  adminListUserActivity, adminListTickets,
  adminListStorage
} from '../../api/client'
import { toast } from '../../hooks/useToast'
import type { Domain } from '../../types'
import { DashCard, UsersTab, TicketsTab, StorageTab } from './AdminTabs'

interface DomainFormData {
  domain: string
  imap_host: string
  imap_port: number
  imap_ssl: boolean
  smtp_host: string
  smtp_port: number
  smtp_ssl: boolean
  active: boolean
  notes: string
  icon: string
  iconLight: string
  maxFileSizeMB: number
  maxUserStorageMB: number
  maxDomainStorageMB: number
  colorPrimary: string
  colorPrimaryDim: string
  colorBackground: string
  colorText: string
  colorAccent: string
  colorPrimaryLight: string
  colorPrimaryDimLight: string
  colorBackgroundLight: string
  colorTextLight: string
  colorAccentLight: string
}

const BLANK_DOMAIN: DomainFormData = {
  domain: '', imap_host: '', imap_port: 993, imap_ssl: true,
  smtp_host: '', smtp_port: 465, smtp_ssl: true, active: true, notes: '', icon: '', iconLight: '',
  maxFileSizeMB: 25, maxUserStorageMB: 500, maxDomainStorageMB: 10240,
  colorPrimary: '', colorPrimaryDim: '', colorBackground: '', colorText: '', colorAccent: '',
  colorPrimaryLight: '', colorPrimaryDimLight: '', colorBackgroundLight: '', colorTextLight: '', colorAccentLight: ''
}

const MAX_ICON_BYTES = 128 * 1024 // 128KB

interface DomainFormProps {
  title: string
  initial: DomainFormData
  defaults: {
    colorPrimary: string
    colorPrimaryDim: string
    colorBackground: string
    colorText: string
    colorAccent: string
    colorPrimaryLight: string
    colorPrimaryDimLight: string
    colorBackgroundLight: string
    colorTextLight: string
    colorAccentLight: string
  }
  onSave: (data: DomainFormData) => void
  onCancel: () => void
}

function DomainForm({ title, initial, defaults, onSave, onCancel }: DomainFormProps) {
  const [form, setForm] = useState<DomainFormData>(initial)
  const set = (key: keyof DomainFormData, val: unknown) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="domain-form">
      <div className="domain-form-title">{title}</div>
      <div className="form-group">
        <label className="form-label">Domain</label>
        <input className="form-input" value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="example.com" />
      </div>
      <div className="form-grid-2" style={{ marginBottom: 12 }}>
        <div>
          <label className="form-label">IMAP Host</label>
          <input className="form-input" value={form.imap_host} onChange={(e) => set('imap_host', e.target.value)} placeholder="imap.example.com" />
        </div>
        <div>
          <label className="form-label">IMAP Port</label>
          <input className="form-input" type="number" value={form.imap_port} onChange={(e) => set('imap_port', Number(e.target.value))} />
        </div>
      </div>
      <div className="form-group">
        <label className="toggle">
          <input type="checkbox" checked={form.imap_ssl} onChange={(e) => set('imap_ssl', e.target.checked)} />
          <span className="toggle-slider" />
          <span style={{ fontSize: 13 }}>IMAP SSL</span>
        </label>
      </div>
      <div className="form-grid-2" style={{ marginBottom: 12 }}>
        <div>
          <label className="form-label">SMTP Host</label>
          <input className="form-input" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.example.com" />
        </div>
        <div>
          <label className="form-label">SMTP Port</label>
          <input className="form-input" type="number" value={form.smtp_port} onChange={(e) => set('smtp_port', Number(e.target.value))} />
        </div>
      </div>
      <div className="form-group">
        <label className="toggle">
          <input type="checkbox" checked={form.smtp_ssl} onChange={(e) => set('smtp_ssl', e.target.checked)} />
          <span className="toggle-slider" />
          <span style={{ fontSize: 13 }}>SMTP SSL</span>
        </label>
      </div>
      <div className="form-group">
        <label className="form-label">Dark-mode Icon (PNG, max 128KB)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {form.icon ? (
            <img src={form.icon} alt="" style={{ width: 48, height: 48, objectFit: 'contain', border: '1px solid var(--bd)', padding: 4, background: '#050505' }} />
          ) : (
            <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--bd)', color: 'var(--dim)' }}>
              <i className="bi bi-image" />
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > MAX_ICON_BYTES) { toast('Icon must be ≤ 128KB', 'error'); return }
              const reader = new FileReader()
              reader.onload = () => set('icon', String(reader.result || ''))
              reader.readAsDataURL(file)
            }}
            style={{ flex: 1 }}
          />
          {form.icon && (
            <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => set('icon', '')}>
              <i className="bi bi-x" /> Clear
            </button>
          )}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Light-mode Icon (optional, falls back to dark)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {form.iconLight ? (
            <img src={form.iconLight} alt="" style={{ width: 48, height: 48, objectFit: 'contain', border: '1px solid var(--bd)', padding: 4, background: '#f5f5f4' }} />
          ) : (
            <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--bd)', color: 'var(--dim)' }}>
              <i className="bi bi-sun" />
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > MAX_ICON_BYTES) { toast('Icon must be ≤ 128KB', 'error'); return }
              const reader = new FileReader()
              reader.onload = () => set('iconLight', String(reader.result || ''))
              reader.readAsDataURL(file)
            }}
            style={{ flex: 1 }}
          />
          {form.iconLight && (
            <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => set('iconLight', '')}>
              <i className="bi bi-x" /> Clear
            </button>
          )}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <input className="form-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes..." />
      </div>
      <div className="form-group">
        <label className="toggle">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span className="toggle-slider" />
          <span style={{ fontSize: 13 }}>Active</span>
        </label>
      </div>

      {/* Cloud storage limits */}
      <div style={{
        borderTop: '1px solid var(--bd)', paddingTop: 16, marginTop: 16, marginBottom: 16
      }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 4 }}>
          CLOUD STORAGE LIMITS
        </div>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>
          Values in MB. Set to 0 to disable cloud storage for this domain.
        </div>
        <div className="form-grid-2" style={{ marginBottom: 10 }}>
          <div>
            <label className="form-label">Max file size (MB) <span style={{ color: 'var(--dim2)', fontSize: 10 }}>— owner</span></label>
            <input
              type="number" className="form-input" min={0}
              value={form.maxFileSizeMB}
              onChange={(e) => set('maxFileSizeMB', Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <label className="form-label">Per-user quota (MB) <span style={{ color: 'var(--dim2)', fontSize: 10 }}>— admin</span></label>
            <input
              type="number" className="form-input" min={0}
              value={form.maxUserStorageMB}
              onChange={(e) => set('maxUserStorageMB', Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Domain total cap (MB) <span style={{ color: 'var(--dim2)', fontSize: 10 }}>— owner</span></label>
          <input
            type="number" className="form-input" min={0}
            value={form.maxDomainStorageMB}
            onChange={(e) => set('maxDomainStorageMB', Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>

      {/* Per-domain theme overrides */}
      <div style={{
        borderTop: '1px solid var(--bd)', paddingTop: 16, marginTop: 16, marginBottom: 16
      }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 4 }}>
          DOMAIN THEME (optional)
        </div>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>
          Leave blank to inherit from global branding. Users of this domain see these colors when logged in.
        </div>

        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, letterSpacing: '.18em', color: 'var(--dim2)', margin: '8px 0 6px', textTransform: 'uppercase' }}>
          ◐ Dark Mode
        </div>
        <div className="form-grid-2" style={{ marginBottom: 10 }}>
          <div><label className="form-label">Primary accent</label>
            <DomainColorInput value={form.colorPrimary} fallback={defaults.colorPrimary} onChange={(v) => set('colorPrimary', v)} /></div>
          <div><label className="form-label">Primary dim</label>
            <DomainColorInput value={form.colorPrimaryDim} fallback={defaults.colorPrimaryDim} onChange={(v) => set('colorPrimaryDim', v)} /></div>
        </div>
        <div className="form-grid-2" style={{ marginBottom: 10 }}>
          <div><label className="form-label">Background</label>
            <DomainColorInput value={form.colorBackground} fallback={defaults.colorBackground} onChange={(v) => set('colorBackground', v)} /></div>
          <div><label className="form-label">Text</label>
            <DomainColorInput value={form.colorText} fallback={defaults.colorText} onChange={(v) => set('colorText', v)} /></div>
        </div>
        <div className="form-grid-2" style={{ marginBottom: 14 }}>
          <div><label className="form-label">Info accent</label>
            <DomainColorInput value={form.colorAccent} fallback={defaults.colorAccent} onChange={(v) => set('colorAccent', v)} /></div>
          <div />
        </div>

        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, letterSpacing: '.18em', color: 'var(--dim2)', margin: '8px 0 6px', textTransform: 'uppercase' }}>
          ◑ Light Mode
        </div>
        <div className="form-grid-2" style={{ marginBottom: 10 }}>
          <div><label className="form-label">Primary accent</label>
            <DomainColorInput value={form.colorPrimaryLight} fallback={defaults.colorPrimaryLight} onChange={(v) => set('colorPrimaryLight', v)} /></div>
          <div><label className="form-label">Primary dim</label>
            <DomainColorInput value={form.colorPrimaryDimLight} fallback={defaults.colorPrimaryDimLight} onChange={(v) => set('colorPrimaryDimLight', v)} /></div>
        </div>
        <div className="form-grid-2" style={{ marginBottom: 10 }}>
          <div><label className="form-label">Background</label>
            <DomainColorInput value={form.colorBackgroundLight} fallback={defaults.colorBackgroundLight} onChange={(v) => set('colorBackgroundLight', v)} /></div>
          <div><label className="form-label">Text</label>
            <DomainColorInput value={form.colorTextLight} fallback={defaults.colorTextLight} onChange={(v) => set('colorTextLight', v)} /></div>
        </div>
        <div className="form-grid-2">
          <div><label className="form-label">Info accent</label>
            <DomainColorInput value={form.colorAccentLight} fallback={defaults.colorAccentLight} onChange={(v) => set('colorAccentLight', v)} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={() => {
              set('colorPrimary', ''); set('colorPrimaryDim', ''); set('colorBackground', ''); set('colorText', ''); set('colorAccent', '')
              set('colorPrimaryLight', ''); set('colorPrimaryDimLight', ''); set('colorBackgroundLight', ''); set('colorTextLight', ''); set('colorAccentLight', '')
            }}>
              <i className="bi bi-x-circle" /> Clear all
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={() => onSave(form)}><i className="bi bi-check" /> Save</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// Color input that supports empty (= inherit from global).
// When empty, shows the inherited color as a dimmed swatch + placeholder.
function DomainColorInput({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  const inheriting = !value
  const swatchColor = value || fallback || '#000000'
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="color"
          value={swatchColor}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 44, height: 34,
            border: '1px solid var(--bd)',
            background: 'transparent',
            padding: 2,
            opacity: inheriting ? 0.5 : 1,
          }}
          title={inheriting ? `Inherited: ${fallback}` : value}
        />
      </div>
      <input
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback || 'inherit'}
        style={{
          flex: 1,
          fontFamily: 'Share Tech Mono, monospace',
          color: inheriting ? 'var(--dim2)' : 'var(--wh)',
        }}
      />
    </div>
  )
}

interface AdminPanelProps {
  onLogout?: () => void // kept for backward-compat; not used now that Logout moved out of the panel
}

type AdminTab = 'dashboard' | 'domains' | 'users' | 'tickets' | 'storage' | 'branding' | 'admins' | 'account'

export default function AdminPanel(_props: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editDomain, setEditDomain] = useState<Domain | null>(null)
  const queryClient = useQueryClient()

  // Who am I (role drives what's visible)
  const { data: meData } = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => adminGetMe().then((r) => r.data),
  })
  const isOwner = meData?.role === 'owner'
  const myUsername = meData?.username || 'admin'

  // User activity (monitoring tab)
  const { data: activityData } = useQuery({
    queryKey: ['admin-user-activity'],
    queryFn: () => adminListUserActivity().then((r) => r.data),
    enabled: tab === 'users' || tab === 'dashboard',
  })

  // Support tickets (tickets tab)
  const { data: ticketsData } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: () => adminListTickets().then((r) => r.data),
    enabled: tab === 'tickets' || tab === 'dashboard',
    refetchInterval: 30_000,
  })

  // Per-user storage usage (storage tab)
  const { data: storageData } = useQuery({
    queryKey: ['admin-storage'],
    queryFn: () => adminListStorage().then((r) => r.data),
    enabled: tab === 'storage',
  })

  // Branding state
  const { data: brandingData } = useQuery({
    queryKey: ['branding'],
    queryFn: () => getBranding().then((r) => r.data),
  })
  const [branding, setBranding] = useState<Branding | null>(null)
  useEffect(() => { if (brandingData) setBranding(brandingData) }, [brandingData])
  const bSet = <K extends keyof Branding>(key: K, val: Branding[K]) =>
    setBranding((b) => b ? { ...b, [key]: val } : b)

  const saveBrandingMut = useMutation({
    mutationFn: () => adminUpdateBranding(branding || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branding'] })
      toast('Branding saved — reload app tabs to see changes', 'success')
    },
    onError: () => toast('Failed to save branding', 'error'),
  })

  const handleFileToDataUrl = (file: File, cb: (url: string) => void) => {
    const reader = new FileReader()
    reader.onload = () => cb(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  // Admin users
  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminListUsers().then((r) => r.data),
  })
  const users: AdminUser[] = usersData?.users || []
  const [newUser, setNewUser] = useState({ email: '', username: '', role: 'admin' })

  const createUserMut = useMutation({
    mutationFn: () => adminCreateUser(newUser as { email: string; username: string; role: string }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setNewUser({ email: '', username: '', role: 'admin' })
      toast('Admin user created', 'success')
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { error?: string } } }
      toast(ax.response?.data?.error || 'Failed to create user', 'error')
    },
  })

  const deleteUserMut = useMutation({
    mutationFn: (id: string) => adminDeleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast('Admin user deleted', 'success')
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { error?: string } } }
      toast(ax.response?.data?.error || 'Failed to delete user', 'error')
    },
  })

  const updateUserMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; assignedDomains?: string[] } }) =>
      adminUpdateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast('Admin user updated', 'success')
    },
    onError: () => toast('Failed to update user', 'error'),
  })

  const { data: domainsData, isLoading } = useQuery({
    queryKey: ['admin-domains'],
    queryFn: () => adminGetDomains().then((r) => r.data),
  })

  const domains = domainsData?.domains || []
  const active = domains.filter((d) => d.active).length
  const inactive = domains.length - active

  const createMut = useMutation({
    mutationFn: (data: DomainFormData) => adminCreateDomain(data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-domains'] })
      setShowAddForm(false)
      toast('Domain added', 'success')
    },
    onError: () => toast('Failed to add domain', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DomainFormData }) => adminUpdateDomain(id, data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-domains'] })
      setEditDomain(null)
      toast('Domain updated', 'success')
    },
    onError: () => toast('Failed to update domain', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteDomain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-domains'] })
      toast('Domain deleted', 'success')
    },
    onError: () => toast('Failed to delete domain', 'error'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminUpdateDomain(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-domains'] }),
    onError: () => toast('Failed to update', 'error'),
  })


  // Sidebar nav items — filtered by role
  const navItems: { id: AdminTab; label: string; icon: string; ownerOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard',   icon: 'bi-speedometer2' },
    { id: 'domains',   label: 'Domains',     icon: 'bi-globe' },
    { id: 'users',     label: 'Users',       icon: 'bi-people' },
    { id: 'tickets',   label: 'Tickets',     icon: 'bi-life-preserver' },
    { id: 'storage',   label: 'Storage',     icon: 'bi-cloud-fill' },
    { id: 'branding',  label: 'Branding',    icon: 'bi-palette',  ownerOnly: true },
    { id: 'admins',    label: 'Admin Users', icon: 'bi-person-gear', ownerOnly: true },
    { id: 'account',   label: 'My Account',  icon: 'bi-key' },
  ]
  const visibleNav = navItems.filter((n) => !n.ownerOnly || isOwner)

  return (
    <div className="admin-wrap admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-title">
          <i className="bi bi-shield-lock" style={{ marginRight: 8 }} />
          B8N6 ADMIN
        </div>
        <div className="admin-identity">
          <div className="admin-identity-name">{myUsername}</div>
          <div className="admin-identity-role">{isOwner ? 'OWNER' : 'ADMIN'}</div>
        </div>
        <nav className="admin-nav">
          {visibleNav.map((n) => (
            <button
              key={n.id}
              className={`admin-nav-item ${tab === n.id ? 'active' : ''}`}
              onClick={() => setTab(n.id)}
            >
              <i className={`bi ${n.icon}`} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <button
          className="btn-ghost admin-logout"
          onClick={() => { window.location.href = '/' }}
          title="Back to the mail dashboard"
        >
          <i className="bi bi-arrow-left" /> Back to Mail
        </button>
      </aside>

      <main className="admin-content">

      {tab === 'dashboard' && (
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 2, color: 'var(--yl)', marginBottom: 20 }}>
            DASHBOARD
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <DashCard label="Domains" value={(domainsData?.domains || []).length} icon="bi-globe" />
            <DashCard label="Users" value={activityData?.total ?? 0} icon="bi-people" />
            <DashCard label="Open Tickets" value={(ticketsData?.tickets || []).filter(t => t.status === 'open').length} icon="bi-life-preserver" />
            <DashCard label="Admins" value={users.length} icon="bi-person-gear" />
          </div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', marginBottom: 10 }}>
            RECENT ACTIVITY
          </div>
          <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', padding: 16, fontSize: 12 }}>
            {(activityData?.users || []).slice(0, 10).map((u) => (
              <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bd3)' }}>
                <span>{u.email}</span>
                <span style={{ color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', fontSize: 11 }}>
                  {u.lastLoginAt ? `last: ${u.lastLoginAt.slice(0, 16).replace('T', ' ')}` : 'never'}
                </span>
              </div>
            ))}
            {(activityData?.users || []).length === 0 && (
              <div style={{ color: 'var(--dim)', padding: 12 }}>No user activity yet.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <UsersTab activity={activityData?.users || []} />
      )}

      {tab === 'tickets' && (
        <TicketsTab tickets={ticketsData?.tickets || []} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['admin-tickets'] })} />
      )}

      {tab === 'storage' && (
        <StorageTab rows={storageData?.users || []} />
      )}

      {tab === 'domains' && <>
      {/* Stats */}
      <div className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat-num">{domains.length}</div>
          <div className="admin-stat-label">Total</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-num" style={{ color: 'var(--green)' }}>{active}</div>
          <div className="admin-stat-label">Active</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-num" style={{ color: 'var(--dim)' }}>{inactive}</div>
          <div className="admin-stat-label">Inactive</div>
        </div>
      </div>

      {/* Add form */}
      {(() => {
        const themeDefaults = {
          colorPrimary: branding?.colorPrimary || '#F5C400',
          colorPrimaryDim: branding?.colorPrimaryDim || '#b38e00',
          colorBackground: branding?.colorBackground || '#050505',
          colorText: branding?.colorText || '#F0EDE8',
          colorAccent: branding?.colorAccent || '#38bdf8',
          colorPrimaryLight: branding?.colorPrimaryLight || '#b38200',
          colorPrimaryDimLight: branding?.colorPrimaryDimLight || '#6b5000',
          colorBackgroundLight: branding?.colorBackgroundLight || '#ffffff',
          colorTextLight: branding?.colorTextLight || '#000000',
          colorAccentLight: branding?.colorAccentLight || '#0284c7',
        }
        return showAddForm ? (
          <DomainForm
            title="ADD DOMAIN"
            initial={{ ...BLANK_DOMAIN }}
            defaults={themeDefaults}
            onSave={(data) => createMut.mutate(data)}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <div style={{ marginBottom: 16 }}>
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              <i className="bi bi-plus" /> Add Domain
            </button>
          </div>
        )
      })()}

      {/* Edit form */}
      {editDomain && (
        <DomainForm
          title="EDIT DOMAIN"
          initial={editDomain as unknown as DomainFormData}
          defaults={{
            colorPrimary: branding?.colorPrimary || '#F5C400',
            colorPrimaryDim: branding?.colorPrimaryDim || '#b38e00',
            colorBackground: branding?.colorBackground || '#050505',
            colorText: branding?.colorText || '#F0EDE8',
            colorAccent: branding?.colorAccent || '#38bdf8',
            colorPrimaryLight: branding?.colorPrimaryLight || '#b38200',
            colorPrimaryDimLight: branding?.colorPrimaryDimLight || '#6b5000',
            colorBackgroundLight: branding?.colorBackgroundLight || '#ffffff',
            colorTextLight: branding?.colorTextLight || '#000000',
            colorAccentLight: branding?.colorAccentLight || '#0284c7',
          }}
          onSave={(data) => updateMut.mutate({ id: editDomain.id, data })}
          onCancel={() => setEditDomain(null)}
        />
      )}

      {/* Domains table */}
      <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', borderRadius: 4, overflow: 'hidden', marginBottom: 32 }}>
        {isLoading ? (
          <div className="loading-state"><span className="spinner" /> Loading domains...</div>
        ) : domains.length === 0 ? (
          <div className="empty-state"><i className="bi bi-globe" /><p>No domains configured</p></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>IMAP Server</th>
                <th>SMTP Server</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {d.icon ? (
                        <img src={d.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                      ) : (
                        <i className="bi bi-globe" style={{ color: 'var(--dim)', fontSize: 18 }} />
                      )}
                      <div>
                        <strong>{d.domain}</strong>
                        {d.notes && <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{d.notes}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'Share Tech Mono', fontSize: 13 }}>
                    {d.imap_host}:{d.imap_port}
                    {d.imap_ssl && <span style={{ color: 'var(--green)', marginLeft: 4, fontSize: 11 }}>SSL</span>}
                  </td>
                  <td style={{ fontFamily: 'Share Tech Mono', fontSize: 13 }}>
                    {d.smtp_host}:{d.smtp_port}
                    {d.smtp_ssl && <span style={{ color: 'var(--green)', marginLeft: 4, fontSize: 11 }}>SSL</span>}
                  </td>
                  <td>
                    <span className={d.active ? 'badge-active' : 'badge-inactive'}>
                      {d.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="icon-btn"
                        title="Toggle active"
                        onClick={() => toggleMut.mutate({ id: d.id, active: !d.active })}
                      >
                        <i className={`bi bi-toggle-${d.active ? 'on' : 'off'}`} style={{ color: d.active ? 'var(--green)' : 'var(--dim)' }} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Edit"
                        onClick={() => setEditDomain(d)}
                      >
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        className="icon-btn"
                        title="Delete"
                        style={{ color: 'var(--red)' }}
                        onClick={() => {
                          if (confirm(`Delete domain ${d.domain}?`)) deleteMut.mutate(d.id)
                        }}
                      >
                        <i className="bi bi-trash3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      </>}

      {tab === 'branding' && branding && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 20 }}>
            APPLICATION BRANDING
          </div>

          <div className="form-group">
            <label className="form-label">App Name (browser title + sidebar)</label>
            <input className="form-input" value={branding.appName} onChange={(e) => bSet('appName', e.target.value)} placeholder="B8N6 MAIL" />
          </div>

          <div className="form-group">
            <label className="form-label">Login Tagline</label>
            <input className="form-input" value={branding.tagline} onChange={(e) => bSet('tagline', e.target.value)} placeholder="Secure · Fast · Private" />
          </div>

          <div className="form-grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="form-label">Dark-mode logo (shown on dark background)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {branding.logo ? (
                  <img src={branding.logo} alt="" style={{ height: 44, width: 'auto', objectFit: 'contain', border: '1px solid var(--bd)', padding: 4, background: '#050505' }} />
                ) : (
                  <div style={{ width: 44, height: 44, border: '1px dashed var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)' }}>
                    <i className="bi bi-image" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 200 * 1024) { toast('Logo must be ≤ 200KB', 'error'); return }
                    handleFileToDataUrl(f, (url) => bSet('logo', url))
                  }}
                  style={{ flex: 1 }}
                />
                {branding.logo && (
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bSet('logo', '')}>Clear</button>
                )}
              </div>
            </div>
            <div>
              <label className="form-label">Light-mode logo (shown on light background, optional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {branding.logoLight ? (
                  <img src={branding.logoLight} alt="" style={{ height: 44, width: 'auto', objectFit: 'contain', border: '1px solid var(--bd)', padding: 4, background: '#f5f5f4' }} />
                ) : (
                  <div style={{ width: 44, height: 44, border: '1px dashed var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11 }}>
                    <i className="bi bi-sun" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 200 * 1024) { toast('Logo must be ≤ 200KB', 'error'); return }
                    handleFileToDataUrl(f, (url) => bSet('logoLight', url))
                  }}
                  style={{ flex: 1 }}
                />
                {branding.logoLight && (
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bSet('logoLight', '')}>Clear</button>
                )}
              </div>
            </div>
            <div>
              <label className="form-label">Favicon (browser tab)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {branding.favicon ? (
                  <img src={branding.favicon} alt="" style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--bd)', padding: 2, background: 'var(--bk3)' }} />
                ) : (
                  <div style={{ width: 32, height: 32, border: '1px dashed var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 11 }}>
                    <i className="bi bi-square" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 64 * 1024) { toast('Favicon must be ≤ 64KB', 'error'); return }
                    handleFileToDataUrl(f, (url) => bSet('favicon', url))
                  }}
                  style={{ flex: 1 }}
                />
                {branding.favicon && (
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bSet('favicon', '')}>Clear</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', margin: '24px 0 12px' }}>
            COLOR THEME — ◐ DARK MODE
          </div>
          <div className="form-grid-2" style={{ marginBottom: 12 }}>
            <div><label className="form-label">Primary (accent)</label>
              <ColorInput value={branding.colorPrimary} onChange={(v) => bSet('colorPrimary', v)} /></div>
            <div><label className="form-label">Primary Dim (unread text)</label>
              <ColorInput value={branding.colorPrimaryDim} onChange={(v) => bSet('colorPrimaryDim', v)} /></div>
          </div>
          <div className="form-grid-2" style={{ marginBottom: 12 }}>
            <div><label className="form-label">Background</label>
              <ColorInput value={branding.colorBackground} onChange={(v) => bSet('colorBackground', v)} /></div>
            <div><label className="form-label">Text</label>
              <ColorInput value={branding.colorText} onChange={(v) => bSet('colorText', v)} /></div>
          </div>
          <div className="form-grid-2" style={{ marginBottom: 16 }}>
            <div><label className="form-label">Info Accent (links)</label>
              <ColorInput value={branding.colorAccent} onChange={(v) => bSet('colorAccent', v)} /></div>
            <div />
          </div>

          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', margin: '24px 0 12px' }}>
            COLOR THEME — ◑ LIGHT MODE
          </div>
          <div className="form-grid-2" style={{ marginBottom: 12 }}>
            <div><label className="form-label">Primary (accent)</label>
              <ColorInput value={branding.colorPrimaryLight} onChange={(v) => bSet('colorPrimaryLight', v)} /></div>
            <div><label className="form-label">Primary Dim (unread text)</label>
              <ColorInput value={branding.colorPrimaryDimLight} onChange={(v) => bSet('colorPrimaryDimLight', v)} /></div>
          </div>
          <div className="form-grid-2" style={{ marginBottom: 12 }}>
            <div><label className="form-label">Background</label>
              <ColorInput value={branding.colorBackgroundLight} onChange={(v) => bSet('colorBackgroundLight', v)} /></div>
            <div><label className="form-label">Text</label>
              <ColorInput value={branding.colorTextLight} onChange={(v) => bSet('colorTextLight', v)} /></div>
          </div>
          <div className="form-grid-2" style={{ marginBottom: 16 }}>
            <div><label className="form-label">Info Accent (links)</label>
              <ColorInput value={branding.colorAccentLight} onChange={(v) => bSet('colorAccentLight', v)} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={() => {
                bSet('colorPrimary', '#F5C400'); bSet('colorPrimaryDim', '#b38e00')
                bSet('colorBackground', '#050505'); bSet('colorText', '#F0EDE8'); bSet('colorAccent', '#38bdf8')
                bSet('colorPrimaryLight', '#b38200'); bSet('colorPrimaryDimLight', '#6b5000')
                bSet('colorBackgroundLight', '#ffffff'); bSet('colorTextLight', '#000000'); bSet('colorAccentLight', '#0284c7')
              }}>
                <i className="bi bi-arrow-counterclockwise" /> Reset both palettes
              </button>
            </div>
          </div>

          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', margin: '24px 0 12px' }}>
            TICKER BARS
          </div>
          <div className="form-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="form-label">Top Ticker Label</label>
              <input className="form-input" value={branding.tickerTopLabel} onChange={(e) => bSet('tickerTopLabel', e.target.value)} placeholder="▶ LIVE" />
            </div>
            <div>
              <label className="form-label">Bottom Ticker Label</label>
              <input className="form-input" value={branding.tickerBottomLabel} onChange={(e) => bSet('tickerBottomLabel', e.target.value)} placeholder="B8N6" />
            </div>
          </div>
          <div className="form-group">
            <label className="toggle">
              <input type="checkbox" checked={branding.showTickerTop} onChange={(e) => bSet('showTickerTop', e.target.checked)} />
              <span className="toggle-slider" />
              <span style={{ fontSize: 13 }}>Show top ticker</span>
            </label>
          </div>
          <div className="form-group">
            <label className="toggle">
              <input type="checkbox" checked={branding.showTickerBottom} onChange={(e) => bSet('showTickerBottom', e.target.checked)} />
              <span className="toggle-slider" />
              <span style={{ fontSize: 13 }}>Show bottom ticker</span>
            </label>
          </div>

          <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: 1, color: 'var(--yl)', margin: '24px 0 12px' }}>
            SUPPORT
          </div>
          <div className="form-group">
            <label className="form-label">Support Email (shown to end-users)</label>
            <input className="form-input" type="email" value={branding.supportEmail} onChange={(e) => bSet('supportEmail', e.target.value)} placeholder="support@example.com" />
          </div>

          <button className="btn-primary" onClick={() => saveBrandingMut.mutate()}>
            <i className="bi bi-check" /> Save Branding
          </button>
        </div>
      )}

      {tab === 'account' && (
        <div style={{ maxWidth: 520 }}>
          <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', padding: 20 }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 12 }}>
              MY ACCOUNT
            </div>
            <div style={{ fontSize: 13, color: 'var(--wh)', marginBottom: 8 }}>
              Signed in as <b style={{ color: 'var(--yl)' }}>{myUsername}</b>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 16 }}>
              {isOwner ? 'OWNER' : 'ADMIN'}
            </div>
            <div style={{
              padding: 12,
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: 'var(--dim)',
              fontSize: 12,
              lineHeight: 1.6,
              display: 'flex',
              gap: 10,
            }}>
              <i className="bi bi-info-circle" style={{ color: 'var(--blue)', fontSize: 16, flexShrink: 0, marginTop: 2 }} />
              <div>
                Admin access is granted automatically via your mailbox. There's no separate admin password — to change how you log in, update your mail password with your mail server.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'admins' && isOwner && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ background: 'var(--bk3)', border: '1px solid var(--bd)', padding: 20 }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 16 }}>
              ADMIN USERS ({users.length})
            </div>

            {users.length === 0 ? (
              <div style={{ color: 'var(--dim)', fontSize: 13 }}>No admin users</div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {users.map((u) => {
                  const assignedNames = (u.assignedDomains || [])
                    .map((id) => domains.find((d) => d.id === id)?.domain)
                    .filter(Boolean)
                  return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--bd3)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--wh)' }}>{u.username || u.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace' }}>
                        {u.email}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'Share Tech Mono, monospace', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 2 }}>
                        {u.role}{u.role === 'admin' && assignedNames.length > 0 && ` · ${assignedNames.join(', ')}`}
                        {u.role === 'admin' && assignedNames.length === 0 && ' · (no domains)'}
                      </div>
                    </div>
                    {u.role !== 'owner' && (
                      <button
                        className="icon-btn"
                        title="Assign domains"
                        onClick={() => {
                          const available = domains.map((d) => `${d.domain}=${d.id}`).join('\n')
                          const current = (u.assignedDomains || []).join(',')
                          const input = prompt(
                            `Enter comma-separated domain IDs to assign to ${u.username}.\n\nAvailable domains:\n${available}\n\nCurrent: ${current || '(none)'}`,
                            current
                          )
                          if (input === null) return
                          const ids = input.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
                          updateUserMut.mutate({ id: u.id, data: { assignedDomains: ids } })
                        }}
                      >
                        <i className="bi bi-diagram-3" />
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title="Delete user"
                      style={{ color: 'var(--red)' }}
                      onClick={() => {
                        if (confirm(`Delete admin user "${u.username}"?`)) deleteUserMut.mutate(u.id)
                      }}
                    >
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                  )
                })}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 12 }}>
                ADD NEW ADMIN
              </div>
              <div className="form-group">
                <label className="form-label">Email (login identifier)</label>
                <input
                  className="form-input"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display name (optional)</label>
                <input
                  className="form-input"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
                The email must belong to a configured mail domain. The user logs in with their mailbox password — no admin password is stored.
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-input"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
              </div>
              <button className="btn-primary" onClick={() => createUserMut.mutate()}>
                <i className="bi bi-person-plus" /> Create Admin
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}

// Color picker input with text fallback
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 44, height: 34, border: '1px solid var(--bd)', background: 'transparent', padding: 2 }}
      />
      <input
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#F5C400"
        style={{ flex: 1, fontFamily: 'Share Tech Mono, monospace' }}
      />
    </div>
  )
}
