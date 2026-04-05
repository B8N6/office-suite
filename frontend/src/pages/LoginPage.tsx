import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, getMe, adminGetMe } from '../api/client'
import { useMailStore } from '../store/mailStore'
import { useBranding, setDomainTheme } from '../hooks/useBranding'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth, saveAccount } = useMailStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const branding = useBranding()

  // If the user already has a valid session, skip the login screen.
  // Admin-only sessions (no user mailbox) go to /admin; regular users → /.
  useEffect(() => {
    getMe()
      .then((res) => {
        setAuth(res.data.email, res.data.name, res.data.icon)
        setDomainTheme(res.data)
        // After a successful login, if isAdmin is true the backend has just set
// the admin session — so the admin session IS active.
useMailStore.getState().setAdminFlags(!!res.data.isAdmin, (res.data.adminRole as 'owner' | 'admin' | undefined) || '', !!res.data.isAdmin)
        navigate('/', { replace: true })
      })
      .catch(() => {
        // No user session — check for an admin-only session
        adminGetMe()
          .then(() => navigate('/admin', { replace: true }))
          .catch(() => setCheckingAuth(false))
      })
  }, [setAuth, navigate])

  if (checkingAuth) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src={branding.logo || '/logo.png'} alt="" className="login-logo-img" />
          <div className="login-tagline" style={{ textAlign: 'center' }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 8 }} />
            Checking session…
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(email, password)
      const { email: resEmail, name, icon, iconLight, adminOnly } = res.data
      // After a successful login, if isAdmin is true the backend has just set
// the admin session — so the admin session IS active.
useMailStore.getState().setAdminFlags(!!res.data.isAdmin, (res.data.adminRole as 'owner' | 'admin' | undefined) || '', !!res.data.isAdmin)
      // Admin-only accounts (no user mailbox, e.g. admin@b8n6.com) go
      // straight to /admin. Everyone else lands on the mail dashboard.
      if (adminOnly) {
        navigate('/admin', { replace: true })
        return
      }
      setAuth(resEmail, name, icon)
      saveAccount({ email: resEmail, password, name, icon, iconLight })
      setDomainTheme(res.data)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setError(axiosErr.response?.data?.error || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={branding.logo || '/logo.png'} alt="" className="login-logo-img" />
        <div className="login-tagline">{branding.tagline}</div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password (D)</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Signing in...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right" />
                Sign In
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  )
}
