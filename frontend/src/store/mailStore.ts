import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message, MessageDetail, Account } from '../types'

interface MailState {
  // Auth
  email: string
  name: string
  icon: string
  setAuth: (email: string, name: string, icon?: string) => void
  setName: (name: string) => void
  clearAuth: () => void

  // Theme (persisted)
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
  toggleTheme: () => void

  // Admin flags (set after login / getMe)
  isAdmin: boolean              // email is registered as admin
  adminRole: 'owner' | 'admin' | ''
  adminSessionActive: boolean   // admin session is currently live
  setAdminFlags: (isAdmin: boolean, role: 'owner' | 'admin' | '', sessionActive: boolean) => void

  // Saved accounts (persisted)
  accounts: Account[]
  saveAccount: (acc: Account) => void
  removeAccount: (email: string) => void

  // Navigation
  currentFolder: string
  currentFolderLabel: string
  setFolder: (name: string, label: string) => void

  // Messages
  messages: Message[]
  setMessages: (msgs: Message[]) => void
  currentPage: number
  totalPages: number
  setPagination: (page: number, total: number) => void
  selectedUids: number[]
  toggleSelect: (uid: number) => void
  selectAll: (uids: number[]) => void
  clearSelected: () => void

  // Current message
  currentMessage: MessageDetail | null
  setCurrentMessage: (msg: MessageDetail | null) => void

  // Folder badges
  badges: Record<string, number>
  setBadge: (folder: string, count: number) => void

  // Poll state
  lastUid: number
  setLastUid: (uid: number) => void

  // UI
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  view: 'mail' | 'calendar' | 'unified' | 'cloud'
  setView: (v: 'mail' | 'calendar' | 'unified' | 'cloud') => void

  // Compose modal
  composeOpen: boolean
  setComposeOpen: (open: boolean) => void

  // Settings modal
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void

  // Account switcher modal
  accountSwitcherOpen: boolean
  setAccountSwitcherOpen: (open: boolean) => void
}

export const useMailStore = create<MailState>()(
  persist(
    (set) => ({
      // Auth
      email: '',
      name: '',
      icon: '',
      setAuth: (email, name, icon) => set({ email, name, icon: icon ?? '' }),
      setName: (name) => set({ name }),
      clearAuth: () => set({ email: '', name: '', icon: '' }),

      // Theme (dark by default, persisted)
      theme: 'dark',
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      // Admin flags (not persisted — re-derived from /auth/me on every mount)
      isAdmin: false,
      adminRole: '',
      adminSessionActive: false,
      setAdminFlags: (isAdmin, adminRole, adminSessionActive) =>
        set({ isAdmin, adminRole, adminSessionActive }),

      // Accounts
      accounts: [],
      saveAccount: (acc) =>
        set((s) => {
          const filtered = s.accounts.filter((a) => a.email !== acc.email)
          return { accounts: [...filtered, acc] }
        }),
      removeAccount: (email) =>
        set((s) => ({ accounts: s.accounts.filter((a) => a.email !== email) })),

      // Navigation
      currentFolder: 'INBOX',
      currentFolderLabel: 'Inbox',
      setFolder: (name, label) => set({ currentFolder: name, currentFolderLabel: label }),

      // Messages
      messages: [],
      setMessages: (msgs) => set({ messages: msgs }),
      currentPage: 1,
      totalPages: 1,
      setPagination: (page, total) => set({ currentPage: page, totalPages: total }),
      selectedUids: [],
      toggleSelect: (uid) =>
        set((s) => ({
          selectedUids: s.selectedUids.includes(uid)
            ? s.selectedUids.filter((u) => u !== uid)
            : [...s.selectedUids, uid],
        })),
      selectAll: (uids) => set({ selectedUids: uids }),
      clearSelected: () => set({ selectedUids: [] }),

      // Current message
      currentMessage: null,
      setCurrentMessage: (msg) => set({ currentMessage: msg }),

      // Badges
      badges: {},
      setBadge: (folder, count) =>
        set((s) => ({ badges: { ...s.badges, [folder]: count } })),

      // Poll
      lastUid: 0,
      setLastUid: (uid) => set({ lastUid: uid }),

      // UI
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      view: 'mail',
      setView: (v) => set({ view: v }),

      // Compose
      composeOpen: false,
      setComposeOpen: (open) => set({ composeOpen: open }),

      // Settings
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      // Account switcher
      accountSwitcherOpen: false,
      setAccountSwitcherOpen: (open) => set({ accountSwitcherOpen: open }),
    }),
    {
      name: 'b8n6-mail-v2',
      partialize: (s) => ({ accounts: s.accounts, email: s.email, name: s.name, icon: s.icon, theme: s.theme }),
    }
  )
)
