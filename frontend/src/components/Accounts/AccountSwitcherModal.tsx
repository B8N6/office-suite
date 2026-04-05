import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, logout } from '../../api/client'
import { useMailStore } from '../../store/mailStore'
import { toast } from '../../hooks/useToast'
import { setDomainTheme } from '../../hooks/useBranding'

import { ACCOUNT_COLORS } from '../../constants'

export default function AccountSwitcherModal() {
  const navigate = useNavigate()
  const {
    accountSwitcherOpen,
    setAccountSwitcherOpen,
    accounts,
    email: currentEmail,
    setAuth,
    saveAccount,
    removeAccount,
    clearAuth,
  } = useMailStore()

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  const [switching, setSwitching] = useState<string>('')

  const handleSwitch = async (acc: { email: string; password: string; name: string }) => {
    if (acc.email === currentEmail) { toast('Already signed in as this account', 'info'); return }
    if (!acc.password) { toast('No saved password — remove & re-add this account', 'error'); return }
    setSwitching(acc.email)
    try {
      const res = await login(acc.email, acc.password)
      setAuth(res.data.email, res.data.name, res.data.icon)
      saveAccount({ email: acc.email, password: acc.password, name: res.data.name, icon: res.data.icon, iconLight: res.data.iconLight })
      setDomainTheme(res.data)
      toast(`Switched to ${acc.email}`, 'success')
      setAccountSwitcherOpen(false)
      // Full reload so react-query caches reset to the new account's data
      window.location.href = '/'
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string; code?: string }
      const msg = ax.response?.data?.error
        || (ax.code === 'ERR_NETWORK' || !ax.response ? 'Network error' : 'Failed to switch account')
      toast(msg, 'error')
      setSwitching('')
    }
  }

  const handleConnect = async () => {
    setConnectError('')
    if (!newEmail || !newPassword) {
      setConnectError('Email and password required')
      return
    }
    setConnecting(true)
    try {
      const res = await login(newEmail, newPassword)
      saveAccount({ email: newEmail, password: newPassword, name: newName || res.data.name, icon: res.data.icon, iconLight: res.data.iconLight })
      // Adding a new account swaps the server session to this account — sync the store.
      setAuth(res.data.email, newName || res.data.name, res.data.icon)
      setDomainTheme(res.data)
      setNewEmail(''); setNewPassword(''); setNewName('')
      toast(`Connected ${res.data.email}`, 'success')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string; code?: string }
      const serverMsg = axiosErr.response?.data?.error
      const netErr = axiosErr.code === 'ERR_NETWORK' || !axiosErr.response
      const msg = serverMsg
        ? serverMsg
        : netErr
          ? 'Network error — could not reach server'
          : 'Failed to connect account'
      setConnectError(msg)
    } finally {
      setConnecting(false)
    }
  }

  const forceLogout = async () => {
    try { await logout() } catch { /* ignore */ }
    clearAuth()
    setDomainTheme(null)
    setAccountSwitcherOpen(false)
    navigate('/login', { replace: true })
  }

  const handleSignOut = async (email: string) => {
    const remaining = accounts.filter((a) => a.email !== email)
    removeAccount(email)

    // Case 1: removed the last saved account — force logout + redirect.
    if (remaining.length === 0) {
      await forceLogout()
      return
    }

    // Case 2: removed a non-current account, others remain — stay on dashboard.
    if (email !== currentEmail) {
      toast(`Removed ${email}`, 'success')
      return
    }

    // Case 3: removed the current account, others remain — switch to next.
    const next = remaining[0]
    try {
      const res = await login(next.email, next.password)
      setAuth(res.data.email, res.data.name, res.data.icon)
      saveAccount({ email: next.email, password: next.password, name: res.data.name, icon: res.data.icon, iconLight: res.data.iconLight })
      toast(`Signed out ${email} — switched to ${next.email}`, 'success')
      setAccountSwitcherOpen(false)
      window.location.href = '/'
    } catch {
      // Couldn't authenticate the fallback account — safest is full logout.
      toast(`Signed out ${email} — could not switch`, 'error')
      await forceLogout()
    }
  }

  if (!accountSwitcherOpen) return null

  return (
    <div className="modal-overlay" onClick={() => setAccountSwitcherOpen(false)}>
      <div className="account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-header-title">ACCOUNTS</span>
          <button className="icon-btn" onClick={() => setAccountSwitcherOpen(false)}>
            <i className="bi bi-x" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {accounts.map((acc, i) => {
            const isCurrent = acc.email === currentEmail
            const isBusy = switching === acc.email
            return (
              <div
                key={acc.email}
                className={`account-item ${isCurrent ? 'current' : ''}`}
                onClick={() => !isCurrent && !isBusy && handleSwitch(acc)}
                title={isCurrent ? 'Current account' : `Click to switch to ${acc.email}`}
              >
                <div
                  className="account-avatar"
                  style={{
                    background: acc.icon ? 'transparent' : ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
                    padding: acc.icon ? 2 : undefined,
                    border: acc.icon ? '1px solid var(--bd2)' : undefined,
                  }}
                >
                  {acc.icon ? (
                    <img src={acc.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : acc.email.charAt(0).toUpperCase()}
                </div>
                <div className="account-info">
                  <div className="account-email">{acc.email}</div>
                  <div className="account-name">
                    {acc.name || 'No name'}
                    {isCurrent && (
                      <span style={{ color: 'var(--yl)', marginLeft: 6, fontSize: 11 }}>● current</span>
                    )}
                    {isBusy && (
                      <span style={{ color: 'var(--dim)', marginLeft: 6, fontSize: 11 }}>switching…</span>
                    )}
                  </div>
                </div>
                {!isCurrent && (
                  <i className="bi bi-arrow-left-right" style={{ color: 'var(--dim)', fontSize: 14, marginRight: 6 }} title="Switch" />
                )}
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={(e) => { e.stopPropagation(); handleSignOut(acc.email) }}
                >
                  {isCurrent ? 'Sign out' : 'Remove'}
                </button>
              </div>
            )
          })}

          {accounts.length === 0 && (
            <div className="empty-state" style={{ padding: 30 }}>
              <i className="bi bi-person-x" />
              <p>No saved accounts</p>
            </div>
          )}
        </div>

        {/* Add account */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--bd)' }}>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: 1.5, color: 'var(--yl)', marginBottom: 12 }}>
            ADD ACCOUNT
          </div>
          <div className="form-group">
            <input
              className="form-input"
              type="email"
              placeholder="Email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <input
              className="form-input"
              type="password"
              placeholder="Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="form-group">
            <input
              className="form-input"
              type="text"
              placeholder="Display name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          {connectError && (
            <div className="login-error" style={{ marginBottom: 10 }}>
              <i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />
              {connectError}
            </div>
          )}
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <><span className="spinner" style={{ width: 12, height: 12 }} /> Connecting...</>
            ) : (
              <><i className="bi bi-person-plus" /> Connect Account</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
