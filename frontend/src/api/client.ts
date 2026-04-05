import axios from 'axios'
import type { Folder, MessagesResponse, MessageDetail, PollResponse, FilterRule, CalendarEvent, ScheduledJob, Signature, Domain, Account } from '../types'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Don't redirect when the 401 came from the login endpoint itself —
      // that just means the submitted credentials were wrong. The caller
      // should handle it (show inline error, keep modal open, etc).
      const url: string = err.config?.url || ''
      const isLoginAttempt = url.includes('/auth/login') || url.includes('/auth/me')
      const path = window.location.pathname
      if (!isLoginAttempt && !path.startsWith('/login') && !path.startsWith('/admin')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// Auth
export interface AuthResponse {
  email: string
  name: string
  icon?: string
  iconLight?: string
  domain?: string
  isAdmin?: boolean
  adminRole?: 'owner' | 'admin'
  adminSessionActive?: boolean
  adminOnly?: boolean // true if no user mailbox (admin-only account)
  colorPrimary?: string
  colorPrimaryDim?: string
  colorBackground?: string
  colorText?: string
  colorAccent?: string
  colorPrimaryLight?: string
  colorPrimaryDimLight?: string
  colorBackgroundLight?: string
  colorTextLight?: string
  colorAccentLight?: string
}
export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/login', { email, password })
export const logout = () => api.post('/auth/logout')
export const getMe = () => api.get<AuthResponse>('/auth/me')

// Folders
export const getFolders = () => api.get<{ folders: Folder[] }>('/folders')
export const createFolder = (name: string) => api.post('/folders', { op: 'create', name })
export const deleteFolder = (name: string) => api.post('/folders', { op: 'delete', name })

// Messages
export const getMessages = (folder: string, page = 1) =>
  api.get<MessagesResponse>('/messages', { params: { folder, page } })
export const getMessage = (uid: number, folder: string) =>
  api.get<{ message: MessageDetail }>(`/messages/${uid}`, { params: { folder } })
export const messageAction = (action: string, uid: number, folder: string, target?: string) =>
  api.post('/messages/action', { action, uid, folder, target })
export const searchMessages = (q: string, folder: string) =>
  api.get<MessagesResponse>('/messages/search', { params: { q, folder } })

// Send
export const sendMessage = (data: FormData | Record<string, unknown>) => {
  if (data instanceof FormData) {
    return api.post('/send', data, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
  return api.post('/send', data)
}

// Attachments
export const getAttachmentUrl = (uid: number, part: string, folder: string) =>
  `/api/attachment/${uid}/${part}?folder=${encodeURIComponent(folder)}`

// Schedule
export const getScheduled = () => api.get<{ jobs: ScheduledJob[] }>('/schedule')
export const createScheduled = (data: Record<string, unknown>) => api.post('/schedule', data)
export const deleteScheduled = (id: string) => api.delete(`/schedule/${id}`)
export const runScheduled = () => api.post('/schedule/run')

// Filters
export const getFilters = () => api.get<{ filters: FilterRule[] }>('/filters')
export const createFilter = (data: Record<string, unknown>) => api.post('/filters', data)
export const updateFilter = (id: string, data: Record<string, unknown>) => api.put(`/filters/${id}`, data)
export const deleteFilter = (id: string) => api.delete(`/filters/${id}`)
export const applyFilters = () => api.post('/filters/apply')

// Signature
export const getSignature = () => api.get<Signature>('/signature')
export const saveSignature = (data: Record<string, unknown>) => api.post('/signature', data)

// Calendar
export const getCalendar = () => api.get<{ events: CalendarEvent[] }>('/calendar')
export const getCalendarShares = () => api.get<{ shares: string[] }>('/calendar/shares')
export const createEvent = (data: Record<string, unknown>) => api.post('/calendar', data)
export const updateEvent = (id: string, data: Record<string, unknown>) => api.put(`/calendar/${id}`, data)
export const deleteEvent = (id: string) => api.delete(`/calendar/${id}`)
export const shareCalendar = (email: string) => api.post('/calendar/share', { email })
export const unshareCalendar = (email: string) => api.delete(`/calendar/share/${encodeURIComponent(email)}`)

// Unified
export const getUnifiedInbox = (accounts: Account[], limit = 50) =>
  api.post<MessagesResponse>('/unified', { accounts, limit })
export const getUnifiedMessage = (email: string, password: string, uid: number, folder: string) =>
  api.post<{ message: MessageDetail }>('/unified/message', { email, password, uid, folder })

// Poll
export const poll = (since: number, folder: string) =>
  api.get<PollResponse>('/poll', { params: { since, folder } })

// Account
export const getAccount = () => api.get<{ email: string; name: string }>('/account')
export const changePassword = (current: string, newPass: string) =>
  api.post('/account', { action: 'change_password', currentPassword: current, newPassword: newPass })
export const updateName = (name: string) => api.post('/account', { action: 'update_name', name })

// Admin API (uses separate axios instance)
const adminApi = axios.create({
  baseURL: '/',
  withCredentials: true,
})

// Notify AdminPage when admin session expires (so it can re-show the login form)
// without a full page reload.
let onAdminUnauthorized: (() => void) | null = null
export const setAdminUnauthorizedHandler = (fn: (() => void) | null) => {
  onAdminUnauthorized = fn
}

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url: string = err.config?.url || ''
      const isLoginAttempt = url.includes('/admin/api/auth/login')
      if (!isLoginAttempt && onAdminUnauthorized) {
        onAdminUnauthorized()
      }
    }
    return Promise.reject(err)
  }
)

export const adminLogin = (username: string, password: string) =>
  adminApi.post('/admin/api/auth/login', { username, password })
export const adminLogout = () => adminApi.post('/admin/api/auth/logout')
export const adminGetMe = () =>
  adminApi.get<{ username: string; role: 'owner' | 'admin' }>('/admin/api/auth/me')
export const adminGetDomains = () => adminApi.get<{ domains: Domain[] }>('/admin/api/domains')
export const adminCreateDomain = (data: Record<string, unknown>) => adminApi.post('/admin/api/domains', data)
export const adminUpdateDomain = (id: string, data: Record<string, unknown>) =>
  adminApi.put(`/admin/api/domains/${id}`, data)
export const adminDeleteDomain = (id: string) => adminApi.delete(`/admin/api/domains/${id}`)
// adminChangePassword removed — admins use their mailbox password via /api/auth/login

// Admin Users (multi-admin)
export interface AdminUser {
  id: string
  email: string
  username: string
  role: 'owner' | 'admin'
  assignedDomains: string[]
  createdAt: string
}
export const adminListUsers = () => adminApi.get<{ users: AdminUser[] }>('/admin/api/users')
export const adminCreateUser = (data: { email: string; username?: string; role?: string; assignedDomains?: string[] }) =>
  adminApi.post('/admin/api/users', data)
export const adminUpdateUser = (id: string, data: { email?: string; username?: string; role?: string; assignedDomains?: string[] }) =>
  adminApi.put(`/admin/api/users/${id}`, data)
export const adminDeleteUser = (id: string) => adminApi.delete(`/admin/api/users/${id}`)

// Admin: user activity monitoring
export interface UserActivity {
  email: string
  domain: string
  lastLoginAt: string
  scheduledCount: number
  filterCount: number
  contactCount: number
  calendarEvents: number
  hasSignature: boolean
  openTickets: number
}
export const adminListUserActivity = () =>
  adminApi.get<{ users: UserActivity[]; total: number }>('/admin/api/user-activity')

// Support tickets (admin-side)
export interface TicketMessage {
  id: string
  author: string
  authorKind: 'user' | 'admin'
  body: string
  createdAt: string
}
export interface SupportTicket {
  id: string
  userEmail: string
  subject: string
  status: 'open' | 'closed'
  priority: string
  createdAt: string
  updatedAt: string
  messages: TicketMessage[]
}
export const adminListTickets = () => adminApi.get<{ tickets: SupportTicket[] }>('/admin/api/tickets')
export const adminReplyTicket = (id: string, data: { body?: string; close?: boolean }) =>
  adminApi.post(`/admin/api/tickets/${id}/reply`, data)

// Support tickets (user-side)
export const getUserTickets = () => api.get<{ tickets: SupportTicket[] }>('/tickets')
export const createUserTicket = (data: { subject: string; body: string; priority?: string }) =>
  api.post('/tickets', data)
export const replyUserTicket = (id: string, body: string) =>
  api.post(`/tickets/${id}/reply`, { body })

// Branding
export interface Branding {
  appName: string
  tagline: string
  logo: string
  logoLight: string
  favicon: string
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
  tickerTopLabel: string
  tickerBottomLabel: string
  showTickerTop: boolean
  showTickerBottom: boolean
  supportEmail: string
  updated?: string
}
export const getBranding = () => api.get<Branding>('/branding')
export const adminUpdateBranding = (data: Partial<Branding>) =>
  adminApi.post('/admin/api/branding', data)

// Cloud storage
export type CloudAccessMode = 'private' | 'emails' | 'domain' | 'public'
export interface CloudFile {
  id: string
  ownerEmail: string
  name: string
  size: number
  mimeType: string
  uploadedAt: string
  accessMode: CloudAccessMode
  allowedEmails?: string[]
  isPublic: boolean
  shareToken?: string
  downloadCount: number
}
export interface CloudQuota {
  storageUsed: number
  storageLimit: number
  maxFileSize: number
  domainStorageUsed: number
  domainStorageLimit: number
}
export const getCloudQuota = () => api.get<CloudQuota>('/cloud/quota')
export const listCloudFiles = () => api.get<{ files: CloudFile[] }>('/cloud/files')
export const uploadCloudFile = (file: File, onProgress?: (pct: number) => void) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post<{ ok: boolean; file: CloudFile }>('/cloud/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
    },
  })
}
export const deleteCloudFile = (id: string) => api.delete(`/cloud/files/${id}`)
export const toggleCloudPublic = (id: string, isPublic: boolean) =>
  api.post<{ ok: boolean; isPublic: boolean; shareToken?: string; shareUrl?: string }>(
    `/cloud/files/${id}/share`, { isPublic }
  )
export const setCloudAccess = (id: string, mode: CloudAccessMode, allowedEmails?: string[]) =>
  api.post<{ ok: boolean; file: CloudFile; shareUrl?: string }>(
    `/cloud/files/${id}/access`, { mode, allowedEmails: allowedEmails || [] }
  )
export const listSharedWithMe = () =>
  api.get<{ files: CloudFile[] }>('/cloud/shared-with-me')
export const cloudDownloadUrl = (id: string) => `/api/cloud/files/${id}/download`
export const cloudSharedDownloadUrl = (ownerEmail: string, id: string) =>
  `/api/cloud/shared/${encodeURIComponent(ownerEmail)}/${id}/download`
export const cloudPublicUrl = (token: string) => `/p/${token}`

// Admin: storage overview
export interface UserStorageRow {
  email: string
  domain: string
  storageUsed: number
  createdAt: string
  lastSeenAt: string
}
export const adminListStorage = () =>
  adminApi.get<{ users: UserStorageRow[] }>('/admin/api/storage')

// Contacts
export interface Contact { id: string; name: string; email: string; notes?: string; createdAt: string }
export const getContacts = () => api.get<{ contacts: Contact[] }>('/contacts')
export const addContact = (data: { name: string; email: string; notes?: string }) =>
  api.post<{ ok: boolean; contact: Contact; updated?: boolean }>('/contacts', data)
export const deleteContact = (id: string) => api.delete(`/contacts/${id}`)

// Download raw message as .eml
export const downloadMessageUrl = (uid: number, folder: string) =>
  `/api/messages/${uid}/download?folder=${encodeURIComponent(folder)}`

export default api
